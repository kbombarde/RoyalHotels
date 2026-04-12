async def get_folder_map(client, token, base_url):

    folder_map = {}

    # ✅ Step 1: get actual root folders
    res = await client.get(
        f"{base_url}/folders",
        headers=headers(token)
    )

    roots = res.json().get("entries", [])

    async def fetch_children(parent_cuid):

        try:
            res = await client.get(
                f"{base_url}/folders/{parent_cuid}/children",
                params={"type": "Folder"},
                headers=headers(token)
            )

            if res.status_code != 200:
                return

            children = res.json().get("entries", [])

            for f in children:
                cuid = f.get("cuid")

                folder_map[cuid] = {
                    "name": f.get("name"),
                    "parent": parent_cuid
                }

                await fetch_children(cuid)

        except:
            return

    # ✅ Step 2: start recursion from ALL roots
    for r in roots:
        root_cuid = r.get("cuid")

        folder_map[root_cuid] = {
            "name": r.get("name"),
            "parent": None
        }

        await fetch_children(root_cuid)

    return folder_map
    
    
    
    





def get_location_from_map(parent_cuid, folder_map):

    if not parent_cuid:
        return ""

    path = []
    current = parent_cuid

    while current and current in folder_map:

        node = folder_map[current]
        name = node.get("name", "")

        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        current = node.get("parent")

    path.reverse()

    return "/" + "/".join(path) if path else ""