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

# Global map: cuid -> node
folder_map = {}


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

                # Ensure parent exists
                folder_map.setdefault(parent_cuid, {
                    "name": "ROOT",
                    "children": []
                })

                for child in children:
                    if child.get("type") != "Folder":
                        continue

                    cuid = child["cuid"]

                    # Add child node
                    folder_map[cuid] = {
                        "name": child["name"],
                        "children": []
                    }

                    # Link parent -> child
                    folder_map[parent_cuid]["children"].append(cuid)

                    # Add to next level queue
                    queue.append(cuid)


def print_tree(cuid, indent=""):
    node = folder_map.get(cuid)
    if not node:
        return

    print(f"{indent}📁 {node['name']} ({cuid})")

    for child_cuid in node["children"]:
        print_tree(child_cuid, indent + "    ")


def main():
    # Initialize root
    folder_map[ROOT_FOLDER_CUID] = {
        "name": "ROOT",
        "children": []
    }

    build_tree_parallel(ROOT_FOLDER_CUID)

    print_tree(ROOT_FOLDER_CUID)


if __name__ == "__main__":
    main()