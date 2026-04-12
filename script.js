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
            params={"type": "Folder", "page": 1, "pagesize": 9999},
            headers=headers(token)
        )

    return res.json().get("entries", [])