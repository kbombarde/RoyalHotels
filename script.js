# ================= LOCATION =================
async def get_location(client, token, base_url, parent_id, instance_id, kind):

    try:
        if kind and kind.lower() == "webi":
            url = f"{base_url}/documents/{parent_id}/schedules/{instance_id}"
        else:
            url = f"{base_url}/infostore/{parent_id}/schedules/{instance_id}"

        res = await client.get(url, headers=headers(token))

        if res.status_code != 200:
            return ""

        data = res.json()

        return data.get("path", "") or data.get("location", "")

    except Exception as e:
        print("Location error:", e)
        return ""
        
        
        
        
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

        # 🔥 PARALLEL LOCATION CALLS
        import asyncio

        tasks = []
        for obj in objects:

            parent_id = get_val(obj, "SI_PARENTID")
            instance_id = get_val(obj, "SI_ID")
            kind = get_val(obj, "SI_KIND")

            tasks.append(
                get_location(client, token, base_url, parent_id, instance_id, kind)
            )

        locations = await asyncio.gather(*tasks)

        # 🔥 MERGE DATA
        result = []

        for idx, obj in enumerate(objects):

            result.append({
                **obj,
                "LOCATION": locations[idx]
            })

    return {"data": result}
    
    
    
tableBody.innerHTML += `
<tr>
    <td>${index + 1}</td>
    <td>${getVal(obj, "SI_ID")}</td>
    <td>${getVal(obj, "SI_NAME")}</td>
    <td>${getVal(obj, "SI_PARENTID")}</td>
    <td>${getVal(obj, "SI_PARENT_FOLDER_CUID")}</td>
    <td>${getVal(obj, "SI_OWNER")}</td>
    <td>${getVal(obj, "SI_STARTTIME")}</td>
    <td>${getVal(obj, "SI_ENDTIME")}</td>
    <td>${getVal(obj, "SI_CREATION_TIME")}</td>
    <td>${getVal(obj, "SI_NEXTRUNTIME")}</td>
    <td>${getVal(obj, "SI_SCHEDULE_STATUS")}</td>
    <td>${obj.LOCATION || ""}</td>
</tr>`;