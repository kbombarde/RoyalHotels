async def fetch_all_cms_data(client, token, base_url, query):

    all_entries = []
    page = 1
    page_size = 200   # ⚡ optimal

    while True:

        res = await client.post(
            f"{base_url}/v1/cmsquery?page={page}&pagesize={page_size}",
            data=query,   # ⚠️ IMPORTANT: NOT json=
            headers={
                "X-SAP-LogonToken": token,
                "Content-Type": "text/plain",
                "Accept": "application/json"
            }
        )

        if res.status_code != 200:
            raise HTTPException(res.status_code, res.text)

        data = res.json()

        entries = (
            data.get("entries")
            or data.get("entries", {}).get("entry")
            or data.get("feed", {}).get("entry")
            or []
        )

        if not entries:
            break

        all_entries.extend(entries)

        print(f"Page {page} → {len(entries)} records")

        if len(entries) < page_size:
            break

        page += 1

    return all_entries