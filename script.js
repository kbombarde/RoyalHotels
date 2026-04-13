# configure your root cuid here
ROOT_FOLDER_CUID = "YOUR_ROOT_CUID"

folder_cache = {}

async def build_location(client, token, base_url, cuid):

    if not cuid:
        return ""

    if cuid in folder_cache:
        return folder_cache[cuid]

    path = []
    current = cuid
    depth = 0

    while current and depth < 10:
        depth += 1

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

        # ✅ STOP AT ROOT
        if current == ROOT_FOLDER_CUID:
            break

        if name and name.lower() not in ["root", "root folder"]:
            path.insert(0, name)   # 🔥 FIX: insert at beginning

        # cache partial (optional)
        folder_cache[current] = name

        if not parent or parent == current:
            break

        current = parent

    final_path = "/" + "/".join(path) if path else ""

    folder_cache[cuid] = final_path

    return final_path