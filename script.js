import asyncio

async def get_full_folder_map(client, token, base_url):

    folder_map = {}

    # 🔥 limit concurrency (VERY IMPORTANT)
    semaphore = asyncio.Semaphore(10)

    async def fetch_children(parent_cuid):

        async with semaphore:  # limit concurrent calls

            try:
                res = await client.get(
                    f"{base_url}/folders/{parent_cuid}/children",
                    params={"type": "Folder"},
                    headers=headers(token)
                )

                children = res.json().get("entries", [])

                tasks = []

                for f in children:
                    cuid = f.get("cuid")

                    folder_map[cuid] = {
                        "name": f.get("name"),
                        "parent": parent_cuid
                    }

                    # 🔥 schedule next level
                    tasks.append(fetch_children(cuid))

                # 🔥 run all children in parallel
                if tasks:
                    await asyncio.gather(*tasks)

            except:
                return

    # 🔥 Step 1: get root folders
    res = await client.get(
        f"{base_url}/folders",
        params={"page": 1, "pagesize": 9999},
        headers=headers(token)
    )

    roots = res.json().get("entries", [])

    # 🔥 Step 2: process roots in parallel
    tasks = []

    for r in roots:
        cuid = r.get("cuid")

        folder_map[cuid] = {
            "name": r.get("name"),
            "parent": None
        }

        tasks.append(fetch_children(cuid))

    # 🔥 run root-level recursion in parallel
    await asyncio.gather(*tasks)

    return folder_map
    
    
    
    
    
    
    
    
    def build_location(folder_map, start_cuid):

    path = []
    current = start_cuid

    while current and current in folder_map:

        node = folder_map[current]

        name = node["name"]
        parent = node["parent"]

        if name and name.lower() not in ["root", "root folder"]:
            path.append(name)

        if not parent or parent == current:
            break

        current = parent

    path.reverse()

    return "/" + "/".join(path) if path else ""
    
    
    
    
    
    
    
    