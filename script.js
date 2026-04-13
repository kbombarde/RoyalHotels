import requests

# 🔐 Config
LOGON_TOKEN = "YOUR_LOGON_TOKEN"
ROOT_FOLDER_CUID = "YOUR_ROOT_FOLDER_CUID"   # e.g. "Af3kL9abcde123"

BASE_URL = "http://<BO_SERVER>:<PORT>/biprws/v1"

HEADERS = {
    "X-SAP-LogonToken": LOGON_TOKEN,
    "Accept": "application/json"
}


def get_children_by_cuid(folder_cuid):
    url = f"{BASE_URL}/folders/{folder_cuid}/children"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json().get("entries", [])


def print_tree(folder, indent=""):
    print(f"{indent}📁 {folder['name']} ({folder['cuid']})")

    children = get_children_by_cuid(folder['cuid'])

    for child in children:
        # Ensure only folders
        if child.get("type") == "Folder":
            print_tree(child, indent + "    ")


def get_root_folder_by_cuid():
    url = f"{BASE_URL}/folders/{ROOT_FOLDER_CUID}"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def build_folder_tree():
    root = get_root_folder_by_cuid()
    print_tree(root)


if __name__ == "__main__":
    build_folder_tree()