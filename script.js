from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import httpx, os

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ENV_CONFIG = {
    "LN0043DEV": "http://eun05611:6405/biprws/v1",
    "JP0043DEV": "http://jpn018266:6405/biprws/v1"
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
            params={"page":1,"pagesize":9999},
            headers=headers(token)
        )

        data = res.json()

        return (
            data.get("entries")
            or data.get("entries", {}).get("entry")
            or []
        )

# ================= SCHEDULE =================
async def get_schedules(client, token, base_url, parent_ids):

    result = {}

    for pid in parent_ids:
        try:
            res = await client.get(
                f"{base_url}/documents/{pid}/schedules",
                headers=headers(token)
            )
            result[pid] = res.json().get("entries", [])
        except:
            result[pid] = []

    return result

# ================= SAP DATA =================
@app.post("/sap-data")
async def sap_data(req: Request):

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_KIND, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_STARTTIME, SI_ENDTIME,
    SI_NEXTRUNTIME, SI_CREATION_TIME, SI_SCHEDULEINFO, SI_STATUSINFO
    FROM CI_INFOOBJECTS, CI_APPOBJECTS ,CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    async with httpx.AsyncClient(timeout=60.0) as client:

        res = await client.post(
            f"{base_url}/cmsquery?page=1&pagesize=9999",
            json={"query": query},
            headers=headers(token)
        )

        data = res.json()

        objects = (
            data.get("entries")
            or data.get("entries", {}).get("entry")
            or []
        )

        parent_ids = list(set(
            get_val(o, "SI_PARENTID")
            for o in objects if get_val(o, "SI_PARENTID")
        ))

        schedule_map = await get_schedules(client, token, base_url, parent_ids)

        result = []

        for idx, obj in enumerate(objects, start=1):

            parent_id = get_val(obj, "SI_PARENTID")
            schedules = schedule_map.get(parent_id, [])

            sched = schedules[0] if schedules else {}

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": sched.get("path", ""),  # 🔥 WORKING VERSION
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "server": extract_server(obj),
                "error": extract_error(obj)
            })

    return {"data": result}