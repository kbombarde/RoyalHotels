folders_res = await client.get(
    f"{base_url}/folders?type=Folder&pagesize=9999",
    headers=headers(token)
)

folders = folders_res.json().get("entries", [])




def get_instance_location(parent_cuid, folders):
    """
    Build folder path like /abc/def (excluding Root)
    folders = response from /folders?type=Folder
    """

    # Build map once
    folder_map = {
        f.get("cuid"): {
            "name": f.get("name"),
            "parent": f.get("parent_cuid")
        }
        for f in folders
    }

    path = []
    current = parent_cuid

    while current and current in folder_map:
        node = folder_map[current]
        name = node.get("name", "")

        # Skip root
        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        current = node.get("parent")

    path.reverse()

    return "/" + "/".join(path) if path else ""