from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import httpx, asyncio
from datetime import datetime, timedelta

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

templates = Jinja2Templates(directory="templates")

# 🔥 ENV CONFIG
ENV_CONFIG = {
    "DEV": "http://dev-bo-server:6405/biprws/v1",
    "QA": "http://qa-bo-server:6405/biprws/v1",
    "UAT": "http://uat-bo-server:6405/biprws/v1",
    "PROD": "http://prod-bo-server:6405/biprws/v1"
}

# 🔥 CACHE
schedule_cache = {}
CACHE_TTL = 300


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
    props = obj.get("properties", {})
    if key in props:
        return props[key].get("value")
    if key.upper() in props:
        return props[key.upper()].get("value")
    return ""


# ============================================================
# LOGIN / AUTH
# ============================================================
@app.get("/envs")
async def get_envs():
    return {"envs": list(ENV_CONFIG.keys())}


@app.post("/login")
async def login(req: Request):

    body = await req.json()
    env = body.get("env")

    base_url = ENV_CONFIG.get(env)
    if not base_url:
        raise HTTPException(400, "Invalid ENV")

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
    req.session["env"] = env

    return {"success": True}


@app.get("/check-auth")
async def check_auth(req: Request):
    return {
        "authenticated": bool(req.session.get("token")),
        "env": req.session.get("env")
    }


@app.post("/logout")
async def logout(req: Request):
    req.session.clear()
    return {"success": True}


# ============================================================
# CORE METHODS
# ============================================================

async def cms_query(client, token, cuids, base_url):

    cuid_list = ",".join([f"'{c}'" for c in cuids])

    query = f"""
    SELECT si_id, si_parentid, si_name, si_kind, si_schedule_status,
           si_parent_folder_cuid, si_owner, si_starttime, si_endtime,
           si_machine_used, si_status_info
    FROM ci_infoobjects, ci_appobjects, ci_systemobjects
    WHERE si_instance=1
    AND si_parent_folder_cuid IN ({cuid_list})
    """

    res = await client.post(
        f"{base_url}/cmsquery?pagesize=9999",
        json={"query": query},
        headers=headers(token)
    )

    data = res.json()
    objects = data.get("entries") or data.get("feed", {}).get("entry", []) or []

    return objects, query


async def get_schedule(client, token, parent_id, base_url):

    now = datetime.now()

    if parent_id in schedule_cache:
        cached = schedule_cache[parent_id]
        if now < cached["expiry"]:
            return cached["data"]

    try:
        res = await client.get(
            f"{base_url}/documents/{parent_id}/schedules",
            headers=headers(token)
        )

        data = res.json().get("entries", [])

        schedule_cache[parent_id] = {
            "data": data,
            "expiry": now + timedelta(seconds=CACHE_TTL)
        }

        return data

    except:
        return []


async def get_all_schedules(client, token, parent_ids, base_url):

    tasks = [get_schedule(client, token, pid, base_url) for pid in parent_ids]
    results = await asyncio.gather(*tasks)

    return dict(zip(parent_ids, results))


async def get_all_child_cuids(token, root, base_url):

    async with httpx.AsyncClient() as client:

        visited = set([root])
        queue = [root]

        while queue:
            current = queue.pop(0)

            try:
                res = await client.get(
                    f"{base_url}/folders/{current}/children?type=Folder",
                    headers=headers(token)
                )

                data = res.json()

                for child in data.get("entries", []):
                    cuid = child.get("cuid")
                    if cuid and cuid not in visited:
                        visited.add(cuid)
                        queue.append(cuid)

            except:
                continue

        return list(visited)


async def build_data(token, cuids, base_url, page, page_size):

    async with httpx.AsyncClient() as client:

        objects, query = await cms_query(client, token, cuids, base_url)

        parent_ids = list(set(get_val(o, "SI_PARENTID") for o in objects))

        schedule_map = await get_all_schedules(client, token, parent_ids, base_url)

        result = []

        for obj in objects:

            parent_id = get_val(obj, "SI_PARENTID")
            schedules = schedule_map.get(parent_id, [])

            if not schedules:
                result.append({
                    "si_id": get_val(obj, "SI_ID"),
                    "si_parentid": parent_id,
                    "si_name": get_val(obj, "SI_NAME"),
                    "si_kind": get_val(obj, "SI_KIND"),
                    "si_schedule_status": get_val(obj, "SI_SCHEDULE_STATUS"),
                    "si_owner": get_val(obj, "SI_OWNER"),
                    "si_starttime": get_val(obj, "SI_STARTTIME"),
                    "si_endtime": get_val(obj, "SI_ENDTIME"),
                    "next_run": "",
                    "completion": ""
                })
            else:
                for s in schedules:
                    result.append({
                        "si_id": get_val(obj, "SI_ID"),
                        "si_parentid": parent_id,
                        "si_name": get_val(obj, "SI_NAME"),
                        "si_kind": get_val(obj, "SI_KIND"),
                        "si_schedule_status": get_val(obj, "SI_SCHEDULE_STATUS"),
                        "si_owner": get_val(obj, "SI_OWNER"),
                        "si_starttime": get_val(obj, "SI_STARTTIME"),
                        "si_endtime": get_val(obj, "SI_ENDTIME"),
                        "next_run": s.get("nextRunTime"),
                        "completion": s.get("endTime")
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


# ============================================================
# MAIN API
# ============================================================
@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    cuids = await get_all_child_cuids(token, body["folder"], base_url)

    return await build_data(
        token,
        cuids,
        base_url,
        int(body.get("page", 1)),
        int(body.get("page_size", 50))
    )


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})