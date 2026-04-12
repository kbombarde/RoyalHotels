from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import httpx, os

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ENV_CONFIG = {
    "DEV": "http://dev-server:6405/biprws/v1",
    "QA": "http://qa-server:6405/biprws/v1"
}

# ================= HEADERS =================
def headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json"
    }

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
    return {"authenticated": bool(req.session.get("token")), "env": req.session.get("env")}

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

@app.post("/logout")
async def logout(req: Request):
    req.session.clear()
    return {"success": True}

# ================= GET FOLDERS =================
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
    return data.get("entries") or data.get("entries", {}).get("entry") or []

# ================= RECURSIVE CUID =================
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
        level1 = status.get("1", {})
        subst = level1.get("SI_SUBST_STRINGS", {})
        return subst.get("1", "")
    return ""

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

            # safety limit (avoid BO crash)
            cuids = cuids[:500]

            cuid_list = ",".join([f"'{c}'" for c in cuids])

            query += f"\n AND SI_PARENT_FOLDER_CUID IN ({cuid_list})"

    return query

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

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient(timeout=60.0) as client:

        filters = {
            "parent_folder_enabled": body.get("parent_folder_enabled"),
            "folder": body.get("folder")
        }

        query = await build_query(client, token, base_url, filters)

        res = await client.post(
            f"{base_url}/cmsquery",
            data=query,
            headers={
                "X-SAP-LogonToken": token,
                "Content-Type": "text/plain",
                "Accept": "application/json"
            }
        )

        if res.status_code != 200:
            raise HTTPException(res.status_code, res.text)

        text = res.text
        if not text.strip():
            raise HTTPException(500, "Empty CMS response")

        data = res.json()

        objects = (
            data.get("entries")
            or data.get("entries", {}).get("entry")
            or data.get("feed", {}).get("entry")
            or []
        )

        parent_ids = list(set(get_val(o, "SI_PARENTID") for o in objects if get_val(o, "SI_PARENTID")))

        schedule_map = await get_schedules(client, token, base_url, parent_ids)

        result = []

        for idx, obj in enumerate(objects, start=1):

            parent_id = get_val(obj, "SI_PARENTID")
            sched = (schedule_map.get(parent_id) or [{}])[0]

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": sched.get("path", ""),
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATION_TIME"),
                "expiry": sched.get("expiry", ""),
                "server": extract_server(obj),
                "error": extract_error(obj)
            })

    return {"query": query, "total": len(result), "data": result}