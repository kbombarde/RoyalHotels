from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import httpx, asyncio, os
from datetime import datetime, timedelta

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ================= ENV =================
ENV_CONFIG = {
    "DEV": "http://dev-bo-server:6405/biprws/v1",
    "QA": "http://qa-bo-server:6405/biprws/v1",
    "UAT": "http://uat-bo-server:6405/biprws/v1",
    "PROD": "http://prod-bo-server:6405/biprws/v1"
}

# ================= CACHE =================
schedule_cache = {}
folder_cache = None
CACHE_TTL = 300


# ================= HELPERS =================
def headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }


def get_val(obj, key):
    if key in obj:
        v = obj[key]
        return v.get("value") if isinstance(v, dict) else v
    if key.lower() in obj:
        v = obj[key.lower()]
        return v.get("value") if isinstance(v, dict) else v
    return ""


def extract_server(obj):
    try:
        return obj.get("SCHEDULING_INFO", {}).get("SI_MACHINE_USED", "")
    except:
        return ""


def extract_error(obj):
    try:
        return (
            obj.get("SI_STATUSINFO", {})
               .get("1", {})
               .get("SI_SUBST_STRINGS", {})
               .get("1", "")
        )
    except:
        return ""


# ================= FOLDER =================
async def get_all_folders(client, token, base_url):
    res = await client.get(
        f"{base_url}/folders?type=Folder&pagesize=9999",
        headers=headers(token)
    )
    return res.json().get("entries", [])


def build_folder_map(folders):
    folder_map = {}
    for f in folders:
        folder_map[f.get("cuid")] = {
            "name": f.get("name"),
            "parent": f.get("parent_cuid")
        }
    return folder_map


async def get_cached_folder_map(client, token, base_url):
    global folder_cache
    if folder_cache:
        return folder_cache

    folders = await get_all_folders(client, token, base_url)
    folder_cache = build_folder_map(folders)
    return folder_cache


def build_path_excluding_root(folder_cuid, folder_map):
    path = []
    current = folder_cuid

    while current and current in folder_map:
        node = folder_map[current]
        name = node.get("name", "")

        if name.lower() not in ["root", "root folder"]:
            path.append(name)

        current = node.get("parent")

    path.reverse()
    return "/" + "/".join(path) if path else ""


# ================= CMS QUERY =================
async def cms_query(client, token, cuids, base_url):

    cuid_list = ",".join([f"'{c}'" for c in cuids])

    query = f"""
    SELECT 
    SI_ID,
    SI_NAME,
    SI_PARENTID,
    SI_KIND,
    SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID,
    SI_OWNER,
    SI_STARTTIME,
    SI_ENDTIME,
    SI_STATUSINFO,
    SI_NEXTRUNTIME,
    SI_CREATIONTIME,
    SCHEDULING_INFO
    FROM CI_INFOOBJECTS
    WHERE SI_INSTANCE = 1
    AND SI_PARENT_FOLDER_CUID IN ({cuid_list})
    """

    res = await client.post(
        f"{base_url}/cmsquery?pagesize=9999",
        json={"query": query},
        headers=headers(token)
    )

    data = res.json()
    objects = data.get("entries") or data.get("feed", {}).get("entry", []) or []

    return objects, query


# ================= SCHEDULE DETAIL =================
async def get_schedule_detail(client, token, base_url, parent_id, instance_id):

    key = f"{parent_id}_{instance_id}"
    now = datetime.now()

    if key in schedule_cache:
        cached = schedule_cache[key]
        if now < cached["expiry"]:
            return cached["data"]

    try:
        res = await client.get(
            f"{base_url}/documents/{parent_id}/schedules/{instance_id}",
            headers=headers(token)
        )

        if res.status_code == 200:
            data = res.json()

            result = {
                "path": data.get("path", ""),
                "expiry": data.get("expiry", "")
            }

            schedule_cache[key] = {
                "data": result,
                "expiry": now + timedelta(seconds=CACHE_TTL)
            }

            return result

        # fallback
        res2 = await client.get(
            f"{base_url}/documents/{parent_id}/schedules",
            headers=headers(token)
        )

        if res2.status_code == 200:
            for s in res2.json().get("entries", []):
                if str(s.get("id")) == str(instance_id):
                    return {
                        "path": s.get("path", ""),
                        "expiry": s.get("expiry", "")
                    }

    except:
        pass

    return {"path": "", "expiry": ""}


# ================= FOLDER RECURSION =================
async def get_all_child_cuids(client, token, root, base_url):

    visited = set([root])
    queue = [root]

    while queue:
        current = queue.pop(0)

        try:
            res = await client.get(
                f"{base_url}/folders/{current}/children?type=Folder",
                headers=headers(token)
            )

            for child in res.json().get("entries", []):
                cuid = child.get("cuid")
                if cuid and cuid not in visited:
                    visited.add(cuid)
                    queue.append(cuid)

        except:
            continue

    return list(visited)


# ================= BUILD DATA =================
async def build_data(token, cuids, base_url, page, page_size):

    async with httpx.AsyncClient(timeout=30) as client:

        objects, query = await cms_query(client, token, cuids, base_url)

        folder_map = await get_cached_folder_map(client, token, base_url)

        # parallel schedule calls
        tasks = []

        for obj in objects:
            tasks.append(
                get_schedule_detail(
                    client,
                    token,
                    base_url,
                    get_val(obj, "SI_PARENTID"),
                    get_val(obj, "SI_ID")
                )
            )

        details = await asyncio.gather(*tasks)

        result = []

        for idx, (obj, detail) in enumerate(zip(objects, details), start=1):

            location = build_path_excluding_root(
                get_val(obj, "SI_PARENT_FOLDER_CUID"),
                folder_map
            )

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": location,
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATIONTIME"),
                "expiry": detail.get("expiry") or "N/A",
                "server": extract_server(obj),
                "error": extract_error(obj)
            })

        total = len(result)
        start = (page - 1) * page_size
        end = start + page_size

        return {
            "query": query,
            "total": total,
            "page": page,
            "data": result[start:end]
        }


# ================= APIs =================
@app.get("/")
async def home():
    return FileResponse(os.path.join(BASE_DIR, "templates", "index.html"))


@app.get("/envs")
async def envs():
    return {"envs": list(ENV_CONFIG.keys())}


@app.get("/check-auth")
async def check_auth(req: Request):
    return {
        "authenticated": bool(req.session.get("token")),
        "env": req.session.get("env")
    }


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


@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    async with httpx.AsyncClient() as client:
        cuids = await get_all_child_cuids(
            client,
            token,
            body.get("folder"),
            base_url
        )

    return await build_data(
        token,
        cuids,
        base_url,
        int(body.get("page", 1)),
        int(body.get("page_size", 50))
    )