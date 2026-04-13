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

        except Exception as e:
            print("Folder error:", e)

    return list(visited)
    
    
    
    
    
    
# ================= QUERY BUILDER =================
async def build_query(client, token, base_url, filters):

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_KIND, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_STARTTIME, SI_ENDTIME,
    SI_CREATION_TIME, SI_NEXTRUNTIME, SI_SCHEDULEINFO, SI_STATUSINFO
    FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    if filters.get("parent_folder_enabled") and filters.get("folder"):

        root = filters.get("folder")

        cuids = await get_all_child_cuids(client, token, base_url, root)

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

        filters = {
            "parent_folder_enabled": body.get("parent_folder_enabled"),
            "folder": body.get("folder")
        }

        query = await build_query(client, token, base_url, filters)

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

    return {"data": objects}
    
    
    