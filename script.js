async def get_folder_map(client, token, base_url):

    folder_map = {}

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

    # 🔥 Start from root (this works in most systems)
    ROOT_CUID = "23"

    await fetch_children(ROOT_CUID)

    return folder_map
    
    
    
    
    
    
    def get_location_from_map(parent_cuid, folder_map):

    path = []
    current = parent_cuid

    while current and current in folder_map:

        node = folder_map[current]
        name = node.get("name", "")

        if name.lower() not in ["root", "root folder"]:
            path.append(name)

        current = node.get("parent")

    path.reverse()

    return "/" + "/".join(path) if path else ""