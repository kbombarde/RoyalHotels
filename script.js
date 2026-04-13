from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import httpx, os, asyncio

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ENV_CONFIG = {
    "DEV": "http://dev-server:6405/biprws/v1"
}

# ================= HEADERS =================
def headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json"
    }

# ================= CACHE =================
location_cache = {}
semaphore = asyncio.Semaphore(20)

# ================= HOME =================
@app.get("/")
async def home():
    return FileResponse(os.path.join(BASE_DIR, "templates", "index.html"))

# ================= ENVS =================
@app.get("/envs")
async def envs():
    return {"envs": list(ENV_CONFIG.keys())}

# ================= CHECK AUTH =================
@app.get("/check-auth")
async def check_auth(req: Request):
    return {
        "authenticated": bool(req.session.get("token")),
        "env": req.session.get("env")
    }

# ================= LOGIN =================
@app.post("/login")
async def login(req: Request):

    body = await req.json()
    base_url = ENV_CONFIG.get(body.get("env"))

    async with httpx.AsyncClient() as client:

        res = await client.post(
            f"{base_url}/logon/long",
            json={
                "userName": body["username"],
                "password": body["password"],
                "auth": body["auth"]
            }
        )

        token = res.headers.get("X-SAP-LogonToken")

        if not token:
            raise HTTPException(401, "Login failed")

        req.session["token"] = token
        req.session["env"] = body.get("env")

    return {"success": True}

# ================= LOGOUT =================
@app.post("/logout")
async def logout(req: Request):
    req.session.clear()
    return {"success": True}

# ================= FOLDERS =================
@app.get("/folders")
async def get_folders(req: Request):

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{base_url}/folders",
            params={"page": 1, "pagesize": 9999},
            headers=headers(token)
        )

        data = res.json()
        entries = data.get("entries")

        if isinstance(entries, dict):
            return entries.get("entry", [])
        elif isinstance(entries, list):
            return entries
        return []

# ================= HELPERS =================
def get_val(obj, key):
    val = obj.get(key)
    if isinstance(val, dict):
        return val.get("value")
    return val

# ================= RECURSIVE FOLDER =================
async def get_all_child_cuids(client, token, base_url, root_cuid):

    visited = set([root_cuid])
    queue = [root_cuid]

    while queue:
        current = queue.pop(0)

        try:
            res = await client.get(
                f"{base_url}/folders/{current}/children",
                params={"type": "Folder"},
                headers=headers(token)
            )

            data = res.json()
            entries = data.get("entries")

            if isinstance(entries, dict):
                children = entries.get("entry", [])
            elif isinstance(entries, list):
                children = entries
            else:
                children = []

            for f in children:
                cuid = f.get("cuid")
                if cuid and cuid not in visited:
                    visited.add(cuid)
                    queue.append(cuid)

        except:
            pass

    return list(visited)

# ================= LOCATION =================
async def get_location(client, token, base_url, parent_id, instance_id, kind):

    key = f"{parent_id}_{instance_id}"

    if key in location_cache:
        return location_cache[key]

    async with semaphore:
        try:
            if kind and kind.lower() == "webi":
                url = f"{base_url}/documents/{parent_id}/schedules/{instance_id}"
            else:
                url = f"{base_url}/infostore/{parent_id}/schedules/{instance_id}"

            res = await client.get(url, headers=headers(token))

            if res.status_code != 200:
                location_cache[key] = ""
                return ""

            data = res.json()
            location = data.get("path", "") or data.get("location", "")

            location_cache[key] = location
            return location

        except:
            return ""

# ================= QUERY =================
async def build_query(client, token, base_url, filters):

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_KIND, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_STARTTIME, SI_ENDTIME,
    SI_CREATION_TIME, SI_NEXTRUNTIME
    FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    if filters.get("parent_folder_enabled") and filters.get("folder"):

        cuids = await get_all_child_cuids(
            client, token, base_url, filters.get("folder")
        )

        cuid_list = ",".join([f"'{c}'" for c in cuids])

        query += f" AND SI_PARENT_FOLDER_CUID IN ({cuid_list})"

    return query

# ================= SAP DATA =================
@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient(timeout=60.0) as client:

        query = await build_query(client, token, base_url, body)

        res = await client.post(
            f"{base_url}/cmsquery",
            json={"query": query},
            headers=headers(token)
        )

        data = res.json()
        entries = data.get("entries")

        if isinstance(entries, dict):
            objects = entries.get("entry", [])
        elif isinstance(entries, list):
            objects = entries
        else:
            objects = []

        # UNIQUE KEYS
        unique = {}
        for obj in objects:
            pid = get_val(obj, "SI_PARENTID")
            iid = get_val(obj, "SI_ID")
            kind = get_val(obj, "SI_KIND")

            key = f"{pid}_{iid}"
            if key not in unique:
                unique[key] = (pid, iid, kind)

        tasks = [
            get_location(client, token, base_url, pid, iid, kind)
            for (pid, iid, kind) in unique.values()
        ]

        results = await asyncio.gather(*tasks)
        location_map = dict(zip(unique.keys(), results))

        final = []

        for obj in objects:
            pid = get_val(obj, "SI_PARENTID")
            iid = get_val(obj, "SI_ID")

            key = f"{pid}_{iid}"

            final.append({
                **obj,
                "LOCATION": location_map.get(key, "")
            })

    return {"data": final}