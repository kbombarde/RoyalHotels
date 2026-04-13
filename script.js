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

# ================= SERVICE =================
class BOService:

    def __init__(self):
        self.folder_map = {}
        self.initialized = False

    async def initialize(self, client, token, base_url):

        if self.initialized:
            return

        print("Initializing folder map...")

        self.folder_map = await self.build_folder_map(client, token, base_url)
        self.initialized = True

    async def build_folder_map(self, client, token, base_url):

        folder_map = {}
        semaphore = asyncio.Semaphore(10)

        async def fetch_children(parent_cuid):

            async with semaphore:

                try:
                    res = await client.get(
                        f"{base_url}/folders/{parent_cuid}/children",
                        params={"type": "Folder", "page":1, "pagesize":200},
                        headers=headers(token)
                    )

                    children = res.json().get("entries", [])

                    tasks = []

                    for f in children:
                        cuid = f.get("cuid")

                        folder_map[cuid] = {
                            "name": f.get("name"),
                            "parent": parent_cuid
                        }

                        tasks.append(fetch_children(cuid))

                    if tasks:
                        await asyncio.gather(*tasks)

                except Exception as e:
                    print("Folder error:", e)

        # root folders
        res = await client.get(
            f"{base_url}/folders",
            params={"page":1,"pagesize":9999},
            headers=headers(token)
        )

        roots = res.json().get("entries", [])

        tasks = []

        for r in roots:
            cuid = r.get("cuid")

            folder_map[cuid] = {
                "name": r.get("name"),
                "parent": None
            }

            tasks.append(fetch_children(cuid))

        await asyncio.gather(*tasks)

        print("Folder map loaded:", len(folder_map))
        return folder_map

    def get_location(self, cuid):

        path = []
        current = cuid

        while current and current in self.folder_map:

            node = self.folder_map[current]
            name = node["name"]
            parent = node["parent"]

            if name.lower() not in ["root", "root folder"]:
                path.append(name)

            if not parent or parent == current:
                break

            current = parent

        path.reverse()
        return "/" + "/".join(path) if path else ""

bo_service = BOService()

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

        # 🔥 INIT
        await bo_service.initialize(client, token, base_url)

    return {"success": True}

# ================= SAP DATA =================
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

        result = []

        for idx, obj in enumerate(objects, start=1):

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": bo_service.get_location(get_val(obj, "SI_PARENT_FOLDER_CUID")),
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATION_TIME"),
                "server": extract_server(obj),
                "error": extract_error(obj),
                "status": get_val(obj, "SI_SCHEDULE_STATUS")
            })

    return {"data": result}