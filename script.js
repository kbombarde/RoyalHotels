async def get_folder_map(client, token, base_url, start_cuid):

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

    # ✅ Start from selected folder (NOT root)
    folder_map[start_cuid] = {
        "name": "ROOT",
        "parent": None
    }

    await fetch_children(start_cuid)

    return folder_map