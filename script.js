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
    <td><button type="button" id="loadFoldersBtn">Load Folders</button></td>
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
<button type="button" id="fetchBtn">Fetch Data</button>

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

// 🚫 HARD STOP any form submit / refresh
document.addEventListener("submit", e => e.preventDefault());
document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";

let isLoading = false;

function toDate(val) {
    return val ? new Date(val) : null;
}

function inRange(date, start, end) {
    if (!date) return true;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
}

// 📂 Load folders
document.getElementById("loadFoldersBtn").onclick = async () => {

    const token = document.getElementById("token").value.trim();
    const dropdown = document.getElementById("parentId");

    if (!token) return alert("Enter token");

    try {
        const res = await fetch(`${baseUrl}/folders`, {
            headers: { "X-SAP-LogonToken": token }
        });

        const data = await res.json();
        const folders = data.entries || [];

        dropdown.innerHTML = '<option value="">-- Select Folder --</option>';

        folders.forEach(f => {
            let opt = document.createElement("option");
            opt.value = f.id;
            opt.text = f.name;
            dropdown.appendChild(opt);
        });

    } catch (e) {
        alert("Folder load failed (CORS likely)");
        console.error(e);
    }
};

// 🚀 Fetch Data (parallel)
document.getElementById("fetchBtn").onclick = async () => {

    if (isLoading) return;
    isLoading = true;

    const statusMsg = document.getElementById("statusMsg");
    const tableBody = document.querySelector("#resultTable tbody");

    statusMsg.innerText = "Loading...";
    tableBody.innerHTML = "";

    try {

        const token = document.getElementById("token").value.trim();
        const parentId = document.getElementById("parentId").value;

        if (!token || !parentId) throw new Error("Token + Folder required");

        const owner = document.getElementById("owner").value.trim();
        const statusFilter = document.getElementById("status").value.trim();
        const type = document.getElementById("type").value.trim();

        const compStart = toDate(document.getElementById("compStart").value);
        const compEnd = toDate(document.getElementById("compEnd").value);
        const nextStart = toDate(document.getElementById("nextStart").value);
        const nextEnd = toDate(document.getElementById("nextEnd").value);

        let query = `
            SELECT SI_ID, SI_NAME, SI_OWNER, SI_PARENTID, SI_CREATION_TIME, SI_KIND
            FROM CI_INFOOBJECTS
            WHERE SI_PARENTID=${parentId}
        `;

        if (owner) query += ` AND SI_OWNER='${owner}'`;
        if (type) query += ` AND SI_KIND='${type}'`;

        const cmsRes = await fetch(`${baseUrl}/cmsquery?pagesize=9999`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SAP-LogonToken": token
            },
            body: JSON.stringify({ query })
        });

        const cmsData = await cmsRes.json();
        const objects = cmsData.entries || [];

        // ⚡ PARALLEL schedule calls
        const schedulePromises = objects.map(obj =>
            fetch(`${baseUrl}/documents/${obj.SI_ID}/schedules`, {
                headers: { "X-SAP-LogonToken": token }
            })
            .then(r => r.ok ? r.json() : null)
            .then(data => ({ obj, schedules: data?.entries || [] }))
            .catch(() => null)
        );

        const results = await Promise.all(schedulePromises);

        let count = 0;

        results.forEach(res => {
            if (!res) return;

            const { obj, schedules } = res;

            schedules.forEach(sched => {

                const compTime = sched.endTime ? new Date(sched.endTime) : null;
                const nextTime = sched.nextRunTime ? new Date(sched.nextRunTime) : null;

                if (!inRange(compTime, compStart, compEnd)) return;
                if (!inRange(nextTime, nextStart, nextEnd)) return;
                if (statusFilter && sched.status !== statusFilter) return;

                const tr = document.createElement("tr");

                function td(v) {
                    let c = document.createElement("td");
                    c.innerText = v || "";
                    return c;
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
            });
        });

        statusMsg.innerText = "Loaded " + count + " rows";

    } catch (err) {
        statusMsg.innerText = err.message.includes("fetch")
            ? "Failed to fetch (CORS issue)"
            : err.message;
        console.error(err);
    }

    isLoading = false;
};

</script>

</body>
</html>