async def get_location_by_parent_chain(client, token, base_url, start_cuid):

    path = []
    current = start_cuid

    try:
        while current:

            res = await client.get(
                f"{base_url}/folders/{current}",
                headers=headers(token)
            )

            if res.status_code != 200:
                break

            data = res.json()

            name = data.get("name", "")
            parent = data.get("parent_cuid")

            # skip root
            if name and name.lower() not in ["root", "root folder"]:
                path.append(name)

            # stop if no parent OR same cuid (safety)
            if not parent or parent == current:
                break

            current = parent

    except Exception as e:
        print("Path fetch error:", e)

    path.reverse()

    return "/" + "/".join(path) if path else ""