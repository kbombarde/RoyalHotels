import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# 🔐 Config
LOGON_TOKEN = "YOUR_LOGON_TOKEN"
ROOT_FOLDER_CUID = "YOUR_ROOT_FOLDER_CUID"

BASE_URL = "http://<BO_SERVER>:<PORT>/biprws/v1"

HEADERS = {
    "X-SAP-LogonToken": LOGON_TOKEN,
    "Accept": "application/json"
}

# Maps
folder_map = {}      # cuid -> {name, children[]}
parent_map = {}      # cuid -> parent_cuid


def get_children(cuid):
    url = f"{BASE_URL}/folders/{cuid}/children"
    res = requests.get(url, headers=HEADERS)
    res.raise_for_status()
    return res.json().get("entries", [])


def build_tree_parallel(root_cuid):
    queue = [root_cuid]

    with ThreadPoolExecutor(max_workers=10) as executor:
        while queue:
            futures = {executor.submit(get_children, cuid): cuid for cuid in queue}
            queue = []

            for future in as_completed(futures):
                parent_cuid = futures[future]
                children = future.result()

                for child in children:
                    if child.get("type") != "Folder":
                        continue

                    cuid = child["cuid"]

                    folder_map[cuid] = {
                        "name": child["name"],
                        "children": []
                    }

                    parent_map[cuid] = parent_cuid

                    folder_map[parent_cuid]["children"].append(cuid)

                    queue.append(cuid)


def get_path(target_cuid):
    path = []

    while target_cuid in folder_map:
        path.append(folder_map[target_cuid]["name"])
        if target_cuid == ROOT_FOLDER_CUID:
            break
        target_cuid = parent_map.get(target_cuid)

        if not target_cuid:
            break

    return " / ".join(reversed(path))


def main():
    # Initialize root
    folder_map[ROOT_FOLDER_CUID] = {
        "name": "ROOT",
        "children": []
    }

    build_tree_parallel(ROOT_FOLDER_CUID)

    # 🔍 Ask user for CUID
    target_cuid = input("Enter Folder CUID: ").strip()

    if target_cuid not in folder_map:
        print("❌ CUID not found in folder tree")
        return

    path = get_path(target_cuid)

    print("\n📂 Folder Path:")
    print(path)


if __name__ == "__main__":
    main()