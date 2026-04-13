async def build_location_from_cms_chain(client, token, base_url, start_cuid, root_cuid):

    if start_cuid in location_cache:
        return location_cache[start_cuid]

    path = []
    current = start_cuid

    MAX_DEPTH = 20
    depth = 0

    while current and current != root_cuid and depth < MAX_DEPTH:
        depth += 1

        query = f"""
        SELECT SI_NAME, SI_PARENT_FOLDER_CUID
        FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS
        WHERE SI_CUID = '{current}'
        """

        res = await client.post(
            f"{base_url}/v1/cmsquery?page=1&pagesize=1",
            json={"query": query},
            headers=headers(token)
        )

        entries = res.json().get("entries", [])
        if not entries:
            break

        obj = entries[0]

        name = obj.get("SI_NAME")
        parent = obj.get("SI_PARENT_FOLDER_CUID")

        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        if not parent or parent == current:
            break

        current = parent

    path.reverse()
    final_path = "/" + "/".join(path) if path else ""

    location_cache[start_cuid] = final_path   # 🔥 cache it

    return final_path
    
    
    
    
    
    
    
    
    
    
    async def get_schedules(client, token, base_url, parent_ids):

    async def fetch(pid):
        try:
            res = await client.get(
                f"{base_url}/v1/documents/{pid}/schedules",
                headers=headers(token)
            )
            return pid, res.json().get("entries", [])
        except:
            return pid, []

    results = await asyncio.gather(*[fetch(pid) for pid in parent_ids])

    return dict(results)