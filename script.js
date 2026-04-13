from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import httpx, os

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
        else:
            return []