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

# ================= HELPERS =================
def get_val(obj, key):
    val = obj.get(key)
    if isinstance(val, dict):
        return val.get("value")
    return val

def extract_server(obj):
    sched = obj.get("SI_SCHEDULEINFO", {})
    if isinstance(sched, dict):
        return sched.get("SI_MACHINE_USED", "")
    return ""

def extract_error(obj):
    status = obj.get("SI_STATUSINFO", {})
    if isinstance(status, dict):
        lvl = status.get("1", {})
        subst = lvl.get("SI_SUBST_STRINGS", {})
        return subst.get("1", "")
    return ""

# ================= RECURSIVE FOLDER =================
async def get_all_child_cuids(client, token, base_url, root):
    visited = set([root])
    queue = [root]

    while queue:
        current = queue.pop(0)

        try:
            res = await client.get(
                f"{base_url}/folders/{current}/children",
                params={"type": "Folder"},
                headers=headers(token)
            )

            for f in res.json().get("entries", []):
                cuid = f.get("cuid")
                if cuid and cuid not in visited:
                    visited.add(cuid)
                    queue.append(cuid)

        except:
            continue

    return list(visited)

# ================= QUERY BUILDER =================
async def build_query(client, token, base_url, filters):

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_KIND, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_STARTTIME, SI_ENDTIME,
    SI_NEXTRUNTIME, SI_CREATION_TIME, SI_SCHEDULEINFO, SI_STATUSINFO
    FROM CI_INFOOBJECTS, CI_APPOBJECTS ,CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    if filters.get("parent_folder_enabled"):

        root_cuid = filters.get("folder")

        if root_cuid:
            cuids = await get_all_child_cuids(client, token, base_url, root_cuid)
            cuid_list = ",".join([f"'{c}'" for c in cuids])
            query += f" AND SI_PARENT_FOLDER_CUID IN ({cuid_list})"

    return query

# ================= LOCATION (CMS RECURSIVE) =================
async def build_location(client, token, base_url, cuid):

    path = []
    current = cuid
    depth = 0

    while current and depth < 20:
        depth += 1

        query = f"""
        SELECT SI_NAME, SI_PARENT_FOLDER_CUID
        FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS
        WHERE SI_CUID = '{current}'
        """

        res = await client.post(
            f"{base_url}/cmsquery",
            json={"query": query},
            headers=headers(token)
        )

        entries = res.json().get("entries", [])
        if not entries:
            break

        obj = entries[0]

        name = obj.get("SI_NAME")
        parent = obj.get("SI_PARENT_FOLDER_CUID")

        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        if not parent or parent == current:
            break

        current = parent

    path.reverse()
    return "/" + "/".join(path) if path else ""

# ================= HOME =================
@app.get("/")
async def home():
    return FileResponse(os.path.join(BASE_DIR, "templates", "index.html"))

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

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{base_url}/folders",
            params={"page":1,"pagesize":9999},
            headers=headers(token)
        )

        return res.json().get("entries", [])

# ================= SAP DATA =================
@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient(timeout=60.0) as client:

        filters = {
            "parent_folder_enabled": body.get("parent_folder_enabled"),
            "folder": body.get("folder")
        }

        query = await build_query(client, token, base_url, filters)

        res = await client.post(
            f"{base_url}/cmsquery?page=1&pagesize=9999",
            json={"query": query},
            headers=headers(token)
        )

        objects = res.json().get("entries", [])

        result = []

        for idx, obj in enumerate(objects, start=1):

            location = await build_location(
                client,
                token,
                base_url,
                get_val(obj, "SI_PARENT_FOLDER_CUID")
            )

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": location,
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATION_TIME"),
                "server": extract_server(obj),
                "error": extract_error(obj)
            })

    return {"data": result}