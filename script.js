from flask import Flask, request, jsonify, render_template
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

BASE_URL = "http://YOUR_BO_SERVER:6405/biprws/v1"

# ---------- COMMON HEADERS ----------
def get_headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

# ---------- SAFE GET ----------
def safe_get(url, headers):
    try:
        res = requests.get(url, headers=headers, timeout=10)
        return res.json()
    except:
        return {}

# ---------- GET ALL FOLDERS ----------
def get_all_folders(token):
    headers = get_headers(token)
    url = f"{BASE_URL}/folders?type=Folder&pagesize=9999"
    data = safe_get(url, headers)
    return data.get("entries", [])

# ---------- RECURSIVE BFS (PARALLEL) ----------
def get_all_child_cuids(root_cuid, token):

    headers = get_headers(token)

    visited = set([root_cuid])
    queue = [root_cuid]

    with ThreadPoolExecutor(max_workers=10) as executor:

        while queue:
            futures = []

            batch = queue[:10]
            queue = queue[10:]

            for cuid in batch:
                url = f"{BASE_URL}/folders/{cuid}/children?type=Folder"
                futures.append(executor.submit(safe_get, url, headers))

            for future in as_completed(futures):
                data = future.result()
                children = data.get("entries", [])

                for child in children:
                    cuid = child.get("cuid")
                    if cuid and cuid not in visited:
                        visited.add(cuid)
                        queue.append(cuid)

    return list(visited)

# ---------- CMS QUERY ----------
def run_cms_query(token, cuids):

    cuid_list = ",".join([f"'{c}'" for c in cuids])

    query = f"""
    SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
    si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
    FROM ci_infoobjects, ci_appobjects, ci_systemobjects
    WHERE si_instance=1 AND si_parent_folder_cuid IN ({cuid_list})
    """

    headers = get_headers(token)

    res = requests.post(
        f"{BASE_URL}/cmsquery?pagesize=9999",
        json={"query": query},
        headers=headers,
        timeout=30
    )

    return res.json(), query

# ---------- FETCH SCHEDULES (PARALLEL) ----------
def fetch_schedules(token, objects):

    headers = get_headers(token)

    def get_schedule(obj):
        doc_id = obj.get("si_id")

        try:
            res = requests.get(
                f"{BASE_URL}/documents/{doc_id}/schedules",
                headers=headers,
                timeout=10
            )
            schedules = res.json().get("entries", [])
            return (doc_id, schedules)
        except:
            return (doc_id, [])

    schedule_map = {}

    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = [executor.submit(get_schedule, obj) for obj in objects]

        for future in as_completed(futures):
            doc_id, schedules = future.result()
            schedule_map[doc_id] = schedules

    return schedule_map

# ---------- MAIN API ----------
@app.route("/sap-data", methods=["POST"])
def sap_data():

    body = request.json
    token = body.get("token")
    root_cuid = body.get("folder")

    if not token or not root_cuid:
        return jsonify({"error": "token and folder required"}), 400

    # Step 1: Get full folder tree
    cuids = get_all_child_cuids(root_cuid, token)

    # Step 2: CMS Query
    cms_data, query = run_cms_query(token, cuids)
    objects = cms_data.get("entries", [])

    # Step 3: Fetch schedules (parallel)
    schedule_map = fetch_schedules(token, objects)

    # Step 4: Merge data
    result = []

    for obj in objects:
        doc_id = obj.get("si_id")
        schedules = schedule_map.get(doc_id, [])

        for sched in schedules:
            result.append({
                "name": obj.get("si_name"),
                "type": obj.get("si_kind"),
                "status": obj.get("si_schedule_status"),
                "owner": obj.get("si_owner"),
                "folder": obj.get("si_parent_folder_cuid"),
                "start": obj.get("si_starttime"),
                "end": obj.get("si_endtime"),
                "server": obj.get("si_machine_used"),
                "error": obj.get("si_status_info"),
                "next_run": sched.get("nextRunTime"),
                "completion": sched.get("endTime")
            })

    return jsonify({
        "total_folders": len(cuids),
        "total_objects": len(objects),
        "query": query,
        "data": result
    })

# ---------- UI ----------
@app.route("/")
def home():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)