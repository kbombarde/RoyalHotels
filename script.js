from flask import Flask, request, jsonify, render_template
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

BASE_URL = "http://YOUR_BO_SERVER:6405/biprws/v1"

def build_headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

def mask_token(token):
    return token[:5] + "..." if token else ""

# ---------- FOLDER RECURSION ----------
def get_all_child_cuids(root, token):

    visited = set([root])
    queue = [root]
    responses = []

    with ThreadPoolExecutor(max_workers=10) as executor:

        while queue:
            batch = queue[:10]
            queue = queue[10:]

            futures = [
                executor.submit(
                    requests.get,
                    f"{BASE_URL}/folders/{c}/children?type=Folder",
                    headers=build_headers(token),
                    timeout=10
                )
                for c in batch
            ]

            for f in as_completed(futures):
                try:
                    res = f.result()
                    data = res.json()
                    responses.append({
                        "url": res.url,
                        "status": res.status_code,
                        "response": data
                    })

                    for child in data.get("entries", []):
                        cuid = child.get("cuid")
                        if cuid and cuid not in visited:
                            visited.add(cuid)
                            queue.append(cuid)

                except Exception as e:
                    responses.append({"error": str(e)})

    return list(visited), responses


# ---------- CMS QUERY ----------
def cms_query(token, cuids):

    cuid_list = ",".join([f"'{c}'" for c in cuids])

    query = f"""
    SELECT si_id, si_parentid, si_name, si_kind, si_schedule_status, 
           si_parent_folder_cuid, si_owner, si_starttime, si_endtime, 
           si_machine_used, si_status_info
    FROM ci_infoobjects, ci_appobjects, ci_systemobjects
    WHERE si_instance=1 
    AND si_parent_folder_cuid IN ({cuid_list})
    """

    url = f"{BASE_URL}/cmsquery?pagesize=9999"

    res = requests.post(
        url,
        json={"query": query},
        headers=build_headers(token),
        timeout=30
    )

    return {
        "request": {
            "url": url,
            "headers": {"X-SAP-LogonToken": mask_token(token)},
            "body": query
        },
        "response": res.json(),
        "status": res.status_code
    }, query


# ---------- SCHEDULE FETCH (FULL DEBUG) ----------
def get_schedules(token, objects):

    debug_calls = []
    schedule_map = {}

    def fetch(obj):

        parent_id = obj.get("si_parentid")

        url = f"{BASE_URL}/documents/{parent_id}/schedules"

        try:
            res = requests.get(
                url,
                headers=build_headers(token),
                timeout=10
            )

            try:
                data = res.json()
            except:
                data = res.text  # handle XML or non-JSON

            debug = {
                "request": {
                    "url": url,
                    "headers": {"X-SAP-LogonToken": mask_token(token)}
                },
                "status": res.status_code,
                "response": data
            }

            return parent_id, data, debug

        except Exception as e:
            return parent_id, {}, {"error": str(e), "url": url}

    with ThreadPoolExecutor(max_workers=15) as executor:

        futures = [executor.submit(fetch, o) for o in objects]

        for f in as_completed(futures):
            parent_id, data, debug = f.result()

            debug_calls.append(debug)

            if isinstance(data, dict):
                schedule_map[parent_id] = data.get("entries", [])
            else:
                schedule_map[parent_id] = []

    return schedule_map, debug_calls


# ---------- MAIN ENDPOINT ----------
@app.route("/sap-data", methods=["POST"])
def sap_data():

    body = request.json
    token = body.get("token")
    folder = body.get("folder")

    if not token or not folder:
        return jsonify({"error": "token and folder required"}), 400

    # 1. Folder recursion
    cuids, folder_debug = get_all_child_cuids(folder, token)

    # 2. CMS query
    cms_debug, query = cms_query(token, cuids)
    objects = cms_debug["response"].get("entries", [])

    # 3. Schedule fetch
    schedule_map, schedule_debug = get_schedules(token, objects)

    # 4. Merge data
    result = []

    for obj in objects:

        parent_id = obj.get("si_parentid")
        schedules = schedule_map.get(parent_id, [])

        for s in schedules:
            result.append({
                "instance_id": obj.get("si_id"),
                "document_id": parent_id,
                "name": obj.get("si_name"),
                "type": obj.get("si_kind"),
                "status": obj.get("si_schedule_status"),
                "owner": obj.get("si_owner"),
                "folder": obj.get("si_parent_folder_cuid"),
                "start": obj.get("si_starttime"),
                "end": obj.get("si_endtime"),
                "server": obj.get("si_machine_used"),
                "error": obj.get("si_status_info"),
                "next_run": s.get("nextRunTime"),
                "completion": s.get("endTime")
            })

    return jsonify({
        "query": query,
        "folders_traversed": cuids,

        # 🔥 FULL DEBUG
        "folder_api_debug": folder_debug,
        "cms_api_debug": cms_debug,
        "schedule_api_debug": schedule_debug,

        # ✅ FINAL DATA
        "data": result
    })


# ---------- UI ----------
@app.route("/")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)