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

# ================= HELPERS =================
def get_val(obj, key):
    val = obj.get(key)
    if isinstance(val, dict):
        return val.get("value")
    return val

def extract_server(obj):
    return obj.get("SI_SCHEDULEINFO", {}).get("SI_MACHINE_USED", "")

def extract_error(obj):
    return obj.get("SI_STATUSINFO", {}).get("1", {}).get("SI_SUBST_STRINGS", {}).get("1", "")

# ================= LOCATION =================
async def get_location(client, token, base_url, cuid):

    if not cuid:
        return ""

    if cuid in location_cache:
        return location_cache[cuid]

    path = []
    current = cuid

    while current:

        query = f"""
        SELECT SI_NAME, SI_PARENT_FOLDER_CUID
        FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS
        WHERE SI_CUID = '{current}'
        """

        res = await client.post(
            f"{base_url}/cmsquery?page=1&pagesize=1",
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

    final = "/" + "/".join(path) if path else ""
    location_cache[cuid] = final

    return final

# ================= HOME =================
@app.get("/")
async def home():
    return FileResponse(os.path.join(BASE_DIR, "templates", "index.html"))

# ================= ENVS =================
@app.get("/envs")
async def envs():
    return {"envs": list(ENV_CONFIG.keys())}

# ================= AUTH =================
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

# ================= DATA =================
@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    page = body.get("page", 1)
    page_size = 50

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_ENDTIME,
    SI_NEXTRUNTIME, SI_CREATION_TIME,
    SI_SCHEDULEINFO, SI_STATUSINFO
    FROM CI_INFOOBJECTS, CI_APPOBJECTS ,CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    async with httpx.AsyncClient(timeout=60.0) as client:

        res = await client.post(
            f"{base_url}/cmsquery?page={page}&pagesize={page_size}",
            json={"query": query},
            headers=headers(token)
        )

        data = res.json()
        objects = data.get("entries", [])

        # 🔥 Unique folder CUIDs
        unique_cuids = list(set(
            get_val(o, "SI_PARENT_FOLDER_CUID")
            for o in objects if get_val(o, "SI_PARENT_FOLDER_CUID")
        ))

        # 🔥 Resolve locations in parallel
        tasks = [
            get_location(client, token, base_url, cuid)
            for cuid in unique_cuids
        ]

        locations = await asyncio.gather(*tasks)

        location_map = dict(zip(unique_cuids, locations))

        # 🔥 Build result
        result = []

        for idx, obj in enumerate(objects, start=1):

            result.append({
                "sr_no": idx,
                "instance_name": get_val(obj, "SI_NAME"),
                "owner": get_val(obj, "SI_OWNER"),
                "location": location_map.get(get_val(obj, "SI_PARENT_FOLDER_CUID"), ""),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "server": extract_server(obj),
                "error": extract_error(obj),
                "status": get_val(obj, "SI_SCHEDULE_STATUS")
            })

    return {"data": result}