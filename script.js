from flask import Flask, request, jsonify, render_template
import requests

app = Flask(__name__)

BASE_URL = "http://YOUR_BO_SERVER:6405/biprws/v1"

def get_all_cuids(root_cuid, token):
    visited = set()
    queue = [root_cuid]

    headers = {
        "X-SAP-LogonToken": token,
        "Accept": "application/json"
    }

    while queue:
        current = queue.pop(0)
        visited.add(current)

        try:
            res = requests.get(f"{BASE_URL}/folders/{current}/children", headers=headers)
            data = res.json()

            children = data.get("entries", [])

            for child in children:
                cuid = child.get("cuid")
                if cuid and cuid not in visited:
                    queue.append(cuid)

        except:
            continue

    return list(visited)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/run-query", methods=["POST"])
def run_query():

    token = request.json.get("token")
    root = request.json.get("folder")

    cuids = get_all_cuids(root, token)

    cuid_list = ",".join([f"'{c}'" for c in cuids])

    query = f"""
    SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
    si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
    FROM ci_infoobjects, ci_appobjects, ci_systemobjects
    WHERE si_instance=1 AND si_parent_folder_cuid IN ({cuid_list})
    """

    headers = {
        "X-SAP-LogonToken": token,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    res = requests.post(
        f"{BASE_URL}/cmsquery?pagesize=9999",
        json={"query": query},
        headers=headers
    )

    return jsonify({
        "query": query,
        "data": res.json()
    })


if __name__ == "__main__":
    app.run(debug=True)