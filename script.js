<!DOCTYPE html>
<html>
<head>
    <title>SAP BO Schedule Viewer</title>
</head>
<body>

<h2>SAP BO Schedule Viewer</h2>

<table>
<tr>
    <td>Logon Token:</td>
    <td><input type="text" id="token" size="80"></td>
    <td><button type="button" onclick="loadFolders()">Load Folders</button></td>
</tr>

<tr>
    <td>Parent Folder:</td>
    <td>
        <select id="parentId">
            <option value="">-- Select Folder --</option>
        </select>
    </td>
</tr>

<tr><td>Owner:</td><td><input type="text" id="owner"></td></tr>
<tr><td>Status:</td><td><input type="text" id="status"></td></tr>
<tr><td>Object Type:</td><td><input type="text" id="type"></td></tr>

<tr><td>Completion Start:</td><td><input type="datetime-local" id="compStart"></td></tr>
<tr><td>Completion End:</td><td><input type="datetime-local" id="compEnd"></td></tr>

<tr><td>Next Run Start:</td><td><input type="datetime-local" id="nextStart"></td></tr>
<tr><td>Next Run End:</td><td><input type="datetime-local" id="nextEnd"></td></tr>
</table>

<br>
<button type="button" onclick="fetchData()">Fetch Data</button>

<p id="statusMsg"></p>

<br>

<table border="1" id="resultTable" cellspacing="0" cellpadding="5">
<thead>
<tr>
<th>Name</th><th>Type</th><th>Status</th><th>Location</th><th>Owner</th>
<th>Completion Time</th><th>Next Run Time</th><th>Creation Time</th>
<th>Start Time</th><th>End Time</th><th>Expiry</th><th>Server</th><th>Error</th>
</tr>
</thead>
<tbody></tbody>
</table>

<script>

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";

function toDate(val) {
    return val ? new Date(val) : null;
}

function inRange(date, start, end) {
    if (!date) return true;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
}

// ✅ Load folders dropdown
async function loadFolders() {

    const token = document.getElementById("token").value.trim();
    const dropdown = document.getElementById("parentId");

    if (!token) {
        alert("Enter Logon Token first");
        return;
    }

    try {
        const res = await fetch(`${baseUrl}/folders`, {
            headers: { "X-SAP-LogonToken": token }
        });

        if (!res.ok) throw new Error("Folder API failed");

        const data = await res.json();
        const folders = data.entries || [];

        dropdown.innerHTML = '<option value="">-- Select Folder --</option>';

        folders.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.text = f.name;
            dropdown.appendChild(opt);
        });

    } catch (err) {
        alert("Failed to load folders (CORS or API issue)");
        console.error(err);
    }
}

// ✅ Main Fetch
async function fetchData() {

    const token = document.getElementById("token").value.trim();
    const parentId = document.getElementById("parentId").value;

    if (!token || !parentId) {
        alert("Token and Folder required");
        return;
    }

    const owner = document.getElementById("owner").value.trim();
    const statusFilter = document.getElementById("status").value.trim();
    const type = document.getElementById("type").value.trim();

    const compStart = toDate(document.getElementById("compStart").value);
    const compEnd = toDate(document.getElementById("compEnd").value);
    const nextStart = toDate(document.getElementById("nextStart").value);
    const nextEnd = toDate(document.getElementById("nextEnd").value);

    const tableBody = document.querySelector("#resultTable tbody");
    const statusMsg = document.getElementById("statusMsg");

    tableBody.innerHTML = "";
    statusMsg.innerText = "Loading...";

    let query = `
        SELECT SI_ID, SI_NAME, SI_OWNER, SI_PARENTID, SI_CREATION_TIME, SI_KIND
        FROM CI_INFOOBJECTS
        WHERE SI_PARENTID=${parentId}
    `;

    if (owner) query += ` AND SI_OWNER='${owner}'`;
    if (type) query += ` AND SI_KIND='${type}'`;

    try {

        const cmsRes = await fetch(`${baseUrl}/cmsquery?pagesize=9999`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SAP-LogonToken": token
            },
            body: JSON.stringify({ query })
        });

        if (!cmsRes.ok) throw new Error("CMS query failed");

        const cmsData = await cmsRes.json();
        const objects = cmsData.entries || [];

        let count = 0;

        for (let obj of objects) {

            try {

                const schedRes = await fetch(`${baseUrl}/documents/${obj.SI_ID}/schedules`, {
                    headers: { "X-SAP-LogonToken": token }
                });

                if (!schedRes.ok) continue;

                const schedData = await schedRes.json();
                const schedules = schedData.entries || [];

                for (let sched of schedules) {

                    const compTime = sched.endTime ? new Date(sched.endTime) : null;
                    const nextTime = sched.nextRunTime ? new Date(sched.nextRunTime) : null;

                    if (!inRange(compTime, compStart, compEnd)) continue;
                    if (!inRange(nextTime, nextStart, nextEnd)) continue;
                    if (statusFilter && sched.status !== statusFilter) continue;

                    const tr = document.createElement("tr");

                    function td(v) {
                        let cell = document.createElement("td");
                        cell.innerText = v || "";
                        return cell;
                    }

                    tr.appendChild(td(obj.SI_NAME));
                    tr.appendChild(td(obj.SI_KIND));
                    tr.appendChild(td(sched.status));
                    tr.appendChild(td(obj.SI_PARENTID));
                    tr.appendChild(td(obj.SI_OWNER));
                    tr.appendChild(td(sched.endTime));
                    tr.appendChild(td(sched.nextRunTime));
                    tr.appendChild(td(obj.SI_CREATION_TIME));
                    tr.appendChild(td(sched.startTime));
                    tr.appendChild(td(sched.endTime));
                    tr.appendChild(td(sched.expiryTime));
                    tr.appendChild(td(sched.server));
                    tr.appendChild(td(sched.errorMessage));

                    tableBody.appendChild(tr);
                    count++;
                }

            } catch (e) {
                console.log("Schedule error:", obj.SI_ID);
            }
        }

        statusMsg.innerText = "Loaded " + count + " rows";

    } catch (err) {
        statusMsg.innerText = "Failed to fetch (CORS or network issue)";
        console.error(err);
    }
}

</script>

</body>
</html>