# ================= QUERY BUILDER =================
async def build_query(client, token, base_url, filters):

    query = """
    SELECT SI_ID, SI_PARENTID, SI_NAME, SI_KIND, SI_SCHEDULE_STATUS,
    SI_PARENT_FOLDER_CUID, SI_OWNER, SI_STARTTIME, SI_ENDTIME,
    SI_NEXTRUNTIME, SI_CREATION_TIME
    FROM CI_INFOOBJECTS, CI_APPOBJECTS ,CI_SYSTEMOBJECTS
    WHERE SI_INSTANCE = 1
    """

    # ✅ Parent Folder Filter
    if filters.get("parent_folder_enabled") and filters.get("folder"):
        query += f" AND SI_PARENT_FOLDER_CUID = '{filters.get('folder')}'"

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
            f"{base_url}/cmsquery?page=1&pagesize=9999",
            json={"query": query},
            headers=headers(token)
        )

        data = res.json()

        # ✅ SAFE PARSING
        entries = data.get("entries")
        if isinstance(entries, dict):
            objects = entries.get("entry", [])
        elif isinstance(entries, list):
            objects = entries
        else:
            objects = []

        result = []

        for idx, obj in enumerate(objects, start=1):

            result.append({
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "parent_folder": get_val(obj, "SI_PARENT_FOLDER_CUID"),
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATION_TIME")
            })

    return {"data": result}