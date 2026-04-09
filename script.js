from flask import Flask, request, jsonify, render_template
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

BASE_URL = "http://YOUR_BO_SERVER:6405/biprws/v1"

def headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

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
                    headers=headers(token),
                    timeout=10
                )
                for c in batch
            ]

            for f in as_completed(futures):
                try:
                    res = f.result()
                    data = res.json()
                    responses.append(data)

                    for child in data.get("entries", []):
                        cuid = child.get("cuid")
                        if cuid and cuid not in visited:
                            visited.add(cuid)
                            queue.append(cuid)

                except:
                    continue

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

    res = requests.post(
        f"{BASE_URL}/cmsquery?pagesize=9999",
        json={"query": query},
        headers=headers(token),
        timeout=30
    )

    return res.json(), query


# ---------- SCHEDULE FETCH (CORRECTED) ----------
def get_schedules(token, objects):

    schedule_map = {}
    raw_responses = []

    def fetch(obj):

        # ✅ CORRECT FIELD
        parent_id = obj.get("si_parentid")

        if not parent_id:
            return None, {}

        try:
            res = requests.get(
                f"{BASE_URL}/documents/{parent_id}/schedules",
                headers=headers(token),
                timeout=10
            )

            data = res.json()
            return parent_id, data

        except:
            return parent_id, {}

    with ThreadPoolExecutor(max_workers=15) as executor:

        futures = [executor.submit(fetch, o) for o in objects]

        for f in as_completed(futures):
            parent_id, data = f.result()

            if not parent_id:
                continue

            schedule_map[parent_id] = data.get("entries", [])
            raw_responses.append(data)

    return schedule_map, raw_responses


# ---------- MAIN API ----------
@app.route("/sap-data", methods=["POST"])
def sap_data():

    body = request.json
    token = body.get("token")
    folder = body.get("folder")

    if not token or not folder:
        return jsonify({"error": "token and folder required"}), 400

    # 1. Folder recursion
    cuids, folder_responses = get_all_child_cuids(folder, token)

    # 2. CMS Query
    cms_data, query = cms_query(token, cuids)
    objects = cms_data.get("entries", [])

    # 3. Schedule fetch (corrected)
    schedule_map, schedule_responses = get_schedules(token, objects)

    # 4. Consolidation
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

        # 🔍 RAW RESPONSES
        "folder_api_responses": folder_responses,
        "cms_raw_response": cms_data,
        "schedule_api_responses": schedule_responses,

        # ✅ FINAL DATA
        "data": result
    })


# ---------- UI ----------
@app.route("/")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)