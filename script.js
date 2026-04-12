async def build_location_from_cms_chain(
    client,
    token,
    base_url,
    start_cuid,
    root_cuid
):

    path = []
    current = start_cuid

    try:
        depth = 0
        MAX_DEPTH = 20

        while current and current != root_cuid and depth < MAX_DEPTH:
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

            if res.status_code != 200:
                print("CMS failed:", res.text)
                break

            entries = res.json().get("entries", [])

            if not entries:
                print("No entry for:", current)
                break

            obj = entries[0]

            # ✅ DIRECT ACCESS (NO get_val)
            name = obj.get("SI_NAME")
            parent = obj.get("SI_PARENT_FOLDER_CUID")

            print("DEBUG →", current, name, parent)

            if name and name.lower() not in ["root", "root folder"]:
                path.append(name)

            if not parent or parent == current:
                break

            current = parent

    except Exception as e:
        print("Path error:", e)

    path.reverse()

    return "/" + "/".join(path) if path else ""