from flask import Flask, request, jsonify, render_template
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

BASE_URL = "http://YOUR_BO_SERVER:6405/biprws/v1"

# ---------- HEADERS ----------
def headers(token):
    return {
        "X-SAP-LogonToken": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

# ---------- SAFE VALUE EXTRACTOR ----------
def get_val(obj, key):

    # direct
    if key in obj:
        val = obj[key]
        if isinstance(val, dict):
            return val.get("value", "")
        return val

    # lowercase
    if key.lower() in obj:
        val = obj[key.lower()]
        if isinstance(val, dict):
            return val.get("value", "")
        return val

    # nested properties
    props = obj.get("properties", {})

    if key in props:
        return props[key].get("value", "")

    if key.upper() in props:
        return props[key.upper()].get("value", "")

    return ""

# ---------- FOLDER RECURSION ----------
def get_all_child_cuids(root, token):

    visited = set([root])
    queue = [root]
    debug = []

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

                    debug.append({
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
                    debug.append({"error": str(e)})

    return list(visited), debug


# ---------- CMS QUERY ----------
def run_cms_query(token, cuids):

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
        headers=headers(token),
        timeout=30
    )

    return {
        "request": {"url": url, "query": query},
        "response": res.json(),
        "status": res.status_code
    }, query


# ---------- SCHEDULE FETCH ----------
def get_schedules(token, objects):

    schedule_map = {}
    debug = []

    def fetch(obj):

        parent_id = get_val(obj, "SI_PARENTID")

        if not parent_id:
            return None, {}, {"error": "Missing parent_id"}

        url = f"{BASE_URL}/documents/{parent_id}/schedules"

        try:
            res = requests.get(url, headers=headers(token), timeout=10)

            try:
                data = res.json()
            except:
                data = {"raw": res.text}

            debug_info = {
                "url": url,
                "status": res.status_code,
                "response": data
            }

            return parent_id, data, debug_info

        except Exception as e:
            return parent_id, {}, {"error": str(e), "url": url}

    with ThreadPoolExecutor(max_workers=15) as executor:

        futures = [executor.submit(fetch, o) for o in objects]

        for f in as_completed(futures):
            parent_id, data, dbg = f.result()

            debug.append(dbg)

            if isinstance(data, dict):
                schedule_map[parent_id] = data.get("entries", [])
            else:
                schedule_map[parent_id] = []

    return schedule_map, debug


# ---------- MAIN API ----------
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
    cms_debug, query = run_cms_query(token, cuids)
    cms_data = cms_debug["response"]

    objects = cms_data.get("entries") or cms_data.get("feed", {}).get("entry", []) or []

    # 3. Schedule fetch
    schedule_map, schedule_debug = get_schedules(token, objects)

    # 4. Merge data
    result = []

    for obj in objects:

        parent_id = get_val(obj, "SI_PARENTID")
        schedules = schedule_map.get(parent_id, [])

        for s in schedules:
            result.append({
                "si_id": get_val(obj, "SI_ID"),
                "si_parentid": parent_id,
                "si_name": get_val(obj, "SI_NAME"),
                "si_kind": get_val(obj, "SI_KIND"),
                "si_schedule_status": get_val(obj, "SI_SCHEDULE_STATUS"),
                "si_parent_folder_cuid": get_val(obj, "SI_PARENT_FOLDER_CUID"),
                "si_owner": get_val(obj, "SI_OWNER"),
                "si_starttime": get_val(obj, "SI_STARTTIME"),
                "si_endtime": get_val(obj, "SI_ENDTIME"),
                "si_machine_used": get_val(obj, "SI_MACHINE_USED"),
                "si_status_info": get_val(obj, "SI_STATUS_INFO"),
                "next_run": s.get("nextRunTime"),
                "completion": s.get("endTime")
            })

    return jsonify({
        "query": query,
        "folders": cuids,
        "cms_debug": cms_debug,
        "schedule_debug": schedule_debug,
        "data": result
    })


@app.route("/")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)