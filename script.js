async def build_location(client, token, base_url, cuid):

    if not cuid:
        return ""

    if cuid in folder_cache:
        return folder_cache[cuid]

    path = []
    current = cuid
    depth = 0

    while current and depth < 20:
        depth += 1

        # CACHE HIT
        if current in folder_cache:
            cached_path = folder_cache[current]
            if cached_path:
                path.insert(0, cached_path)
            break

        query = f"""
        SELECT SI_NAME, SI_PARENT_FOLDER_CUID
        FROM CI_INFOOBJECTS
        WHERE SI_CUID = '{current}'
        """

        res = await client.post(
            f"{base_url}/cmsquery",
            json={"query": query},
            headers=headers(token)
        )

        data = res.json()
        entries = data.get("entries")

        if isinstance(entries, dict):
            objs = entries.get("entry", [])
        elif isinstance(entries, list):
            objs = entries
        else:
            objs = []

        if not objs:
            break

        obj = objs[0]

        name = obj.get("SI_NAME")
        parent = obj.get("SI_PARENT_FOLDER_CUID")

        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        # CACHE STORE (partial)
        folder_cache[current] = name

        if not parent or parent == current:
            break

        current = parent

    path.reverse()

    final_path = "/" + "/".join(path) if path else ""

    folder_cache[cuid] = final_path

    return final_path
    

@app.post("/sap-data")
async def sap_data(req: Request):

    body = await req.json()

    token = req.session.get("token")
    env = req.session.get("env")

    if not token:
        raise HTTPException(401, "Not authenticated")

    base_url = ENV_CONFIG.get(env)

    query = """
    SELECT SI_ID, SI_NAME, SI_PARENTID, SI_PARENT_FOLDER_CUID,
           SI_OWNER, SI_STARTTIME, SI_ENDTIME,
           SI_CREATION_TIME, SI_NEXTRUNTIME, SI_SCHEDULE_STATUS
    FROM CI_INFOOBJECTS
    WHERE SI_INSTANCE = 1
    """

    if body.get("parent_folder_enabled") and body.get("folder"):
        query += f" AND SI_PARENT_FOLDER_CUID = '{body.get('folder')}'"

    async with httpx.AsyncClient(timeout=60.0) as client:

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

        # 🔥 UNIQUE CUIDS
        unique_cuids = list(set(
            obj.get("SI_PARENT_FOLDER_CUID")
            for obj in objects if obj.get("SI_PARENT_FOLDER_CUID")
        ))

        # 🔥 PARALLEL LOCATION BUILD
        import asyncio
        tasks = [
            build_location(client, token, base_url, cuid)
            for cuid in unique_cuids
        ]

        results = await asyncio.gather(*tasks)
        location_map = dict(zip(unique_cuids, results))

        # 🔥 FINAL MERGE
        final = []

        for obj in objects:
            cuid = obj.get("SI_PARENT_FOLDER_CUID")

            final.append({
                **obj,
                "LOCATION": location_map.get(cuid, "")
            })

    return {"data": final}