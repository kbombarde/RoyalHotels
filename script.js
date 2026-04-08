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
</tr>

<tr>
    <td>Parent Folder:</td>
    <td>
        <select id="parentId">
            <option value="">-- Enter Token First --</option>
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
<button id="fetchBtn">Fetch Data</button>

<p id="statusMsg"></p>

<br>

<table border="1" id="resultTable">
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

// 🚫 BLOCK ALL REFRESH BEHAVIOR
document.addEventListener("submit", e => e.preventDefault());
document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";
let foldersLoaded = false;

// 📂 LOAD FOLDERS WHEN TOKEN FILLED
document.getElementById("token").addEventListener("blur", loadFolders);

async function loadFolders() {

    if (foldersLoaded) return;

    const token = document.getElementById("token").value.trim();
    const statusMsg = document.getElementById("statusMsg");

    if (!token) return;

    try {
        const res = await fetch(`${baseUrl}/folders`, {
            headers: { "X-SAP-LogonToken": token }
        });

        const text = await res.text();

        if (!res.ok) {
            statusMsg.innerText =
                "Folder API Error\nStatus: " + res.status + "\nResponse:\n" + text;
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            statusMsg.innerText = "Invalid JSON:\n" + text;
            return;
        }

        const dropdown = document.getElementById("parentId");
        dropdown.innerHTML = '<option value="">-- Select Folder --</option>';

        (data.entries || []).forEach(f => {
            let opt = document.createElement("option");
            opt.value = f.id;
            opt.text = f.name;
            dropdown.appendChild(opt);
        });

        statusMsg.innerText = "Folders loaded: " + (data.entries?.length || 0);
        foldersLoaded = true;

    } catch (err) {
        statusMsg.innerText = "Fetch Failed (CORS?)\n" + err.message;
        console.error(err);
    }
}

// 🚀 FETCH DATA
document.getElementById("fetchBtn").addEventListener("click", async function(e) {

    e.preventDefault();

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

        const compStart = document.getElementById("compStart").value ? new Date(document.getElementById("compStart").value) : null;
        const compEnd = document.getElementById("compEnd").value ? new Date(document.getElementById("compEnd").value) : null;
        const nextStart = document.getElementById("nextStart").value ? new Date(document.getElementById("nextStart").value) : null;
        const nextEnd = document.getElementById("nextEnd").value ? new Date(document.getElementById("nextEnd").value) : null;

        function inRange(d, s, e) {
            if (!d) return true;
            if (s && d < s) return false;
            if (e && d > e) return false;
            return true;
        }

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

        const cmsText = await cmsRes.text();

        if (!cmsRes.ok) {
            statusMsg.innerText =
                "CMS Error\nStatus: " + cmsRes.status + "\nResponse:\n" + cmsText;
            return;
        }

        const cmsData = JSON.parse(cmsText);
        const objects = cmsData.entries || [];

        const promises = objects.map(obj =>
            fetch(`${baseUrl}/documents/${obj.SI_ID}/schedules`, {
                headers: { "X-SAP-LogonToken": token }
            })
            .then(async r => {
                const txt = await r.text();
                if (!r.ok) return null;
                return { obj, schedules: JSON.parse(txt).entries || [] };
            })
            .catch(() => null)
        );

        const results = await Promise.all(promises);

        let count = 0;

        results.forEach(r => {
            if (!r) return;

            r.schedules.forEach(s => {

                const compTime = s.endTime ? new Date(s.endTime) : null;
                const nextTime = s.nextRunTime ? new Date(s.nextRunTime) : null;

                if (!inRange(compTime, compStart, compEnd)) return;
                if (!inRange(nextTime, nextStart, nextEnd)) return;
                if (statusFilter && s.status !== statusFilter) return;

                let tr = document.createElement("tr");

                function td(v) {
                    let c = document.createElement("td");
                    c.innerText = v || "";
                    return c;
                }

                tr.appendChild(td(r.obj.SI_NAME));
                tr.appendChild(td(r.obj.SI_KIND));
                tr.appendChild(td(s.status));
                tr.appendChild(td(r.obj.SI_PARENTID));
                tr.appendChild(td(r.obj.SI_OWNER));
                tr.appendChild(td(s.endTime));
                tr.appendChild(td(s.nextRunTime));
                tr.appendChild(td(r.obj.SI_CREATION_TIME));
                tr.appendChild(td(s.startTime));
                tr.appendChild(td(s.endTime));
                tr.appendChild(td(s.expiryTime));
                tr.appendChild(td(s.server));
                tr.appendChild(td(s.errorMessage));

                tableBody.appendChild(tr);
                count++;
            });
        });

        statusMsg.innerText = "Loaded " + count + " rows";

    } catch (err) {
        statusMsg.innerText = err.message;
        console.error(err);
    }

});
</script>

</body>
</html>