import asyncio

async def fetch_all_cms_data(client, token, base_url, query):

    page_size = 200

    # First call to get total count
    first = await client.post(
        f"{base_url}/v1/cmsquery?page=1&pagesize={page_size}",
        json={"query": query},
        headers=headers(token)
    )

    data = first.json()

    entries = data.get("entries", [])
    total = int(first.headers.get("X-Total-Count", len(entries)))

    total_pages = (total // page_size) + 1

    # 🔥 Parallel calls
    async def fetch(page):
        res = await client.post(
            f"{base_url}/v1/cmsquery?page={page}&pagesize={page_size}",
            json={"query": query},
            headers=headers(token)
        )
        d = res.json()
        return d.get("entries", [])

    tasks = [fetch(p) for p in range(1, total_pages+1)]

    results = await asyncio.gather(*tasks)

    all_entries = [item for sublist in results for item in sublist]

    return all_entries