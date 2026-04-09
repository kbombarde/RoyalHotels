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
            <option value="0">Root Folder</option>
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

<p id="statusMsg" style="white-space: pre-wrap;"></p>

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

// 🚫 BLOCK REFRESH
document.addEventListener("submit", e => e.preventDefault());
document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";
let foldersLoaded = false;

// 🔄 XML → JSON
function xmlToJson(xml) {
    let obj = {};

    if (xml.nodeType === 1 && xml.attributes.length > 0) {
        obj["@attributes"] = {};
        for (let j = 0; j < xml.attributes.length; j++) {
            let attr = xml.attributes.item(j);
            obj["@attributes"][attr.nodeName] = attr.nodeValue;
        }
    }

    if (xml.nodeType === 3) return xml.nodeValue.trim();

    if (xml.hasChildNodes()) {
        for (let i = 0; i < xml.childNodes.length; i++) {
            let item = xml.childNodes.item(i);
            let nodeName = item.nodeName;

            let value = xmlToJson(item);
            if (!value) continue;

            if (!obj[nodeName]) obj[nodeName] = value;
            else {
                if (!Array.isArray(obj[nodeName])) obj[nodeName] = [obj[nodeName]];
                obj[nodeName].push(value);
            }
        }
    }
    return obj;
}

// 🔄 Parse response
async function parseResponse(res) {
    const text = await res.text();

    if (!res.ok) throw new Error(text);

    try {
        return JSON.parse(text);
    } catch {
        const xml = new DOMParser().parseFromString(text, "text/xml");
        return xmlToJson(xml);
    }
}

// 📂 LOAD FOLDERS
document.getElementById("token").addEventListener("blur", async function() {

    if (foldersLoaded) return;

    const token = document.getElementById("token").value.trim();
    const statusMsg = document.getElementById("statusMsg");

    if (!token) return;

    statusMsg.innerText = "Loading folders...";

    try {

        const res = await fetch(`${baseUrl}/folders`, {
            headers: {
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            }
        });

        const data = await parseResponse(res);

        const dropdown = document.getElementById("parentId");
        dropdown.innerHTML = '<option value="0">Root Folder</option>';

        const folders = data.entries || data.feed?.entry || [];

        folders.forEach(f => {
            const id = f.id || f["@attributes"]?.id || f.SI_ID;
            const name = f.name || f.title || f.SI_NAME;

            if (!id || !name) return;

            let opt = document.createElement("option");
            opt.value = id;
            opt.text = name;
            dropdown.appendChild(opt);
        });

        statusMsg.innerText = "Folders loaded";
        foldersLoaded = true;

    } catch (err) {
        statusMsg.innerText = "Folder Error:\n" + err.message;
    }
});

// 🔥 GET ALL CHILD FOLDERS (RECURSIVE)
async function getAllChildFolders(parentId, token, allIds = new Set()) {

    allIds.add(parentId);

    try {
        const res = await fetch(`${baseUrl}/folders/${parentId}/children`, {
            headers: {
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            }
        });

        const data = await parseResponse(res);

        const children = data.entries || data.feed?.entry || [];

        for (let child of children) {

            const childId = child.id || child["@attributes"]?.id;

            if (childId && !allIds.has(childId)) {
                await getAllChildFolders(childId, token, allIds);
            }
        }

    } catch (err) {
        console.log("Child fetch error:", parentId);
    }

    return Array.from(allIds);
}

// 🚀 FETCH DATA
document.getElementById("fetchBtn").addEventListener("click", async function() {

    const statusMsg = document.getElementById("statusMsg");
    const tableBody = document.querySelector("#resultTable tbody");

    statusMsg.innerText = "Loading...";
    tableBody.innerHTML = "";

    try {

        const token = document.getElementById("token").value.trim();
        const parentId = document.getElementById("parentId").value;

        if (!token) throw new Error("Token required");

        // 🔥 GET ALL FOLDER IDS
        const folderIds = await getAllChildFolders(parentId, token);

        const folderList = folderIds.join(",");

        statusMsg.innerText = "Folders considered:\n" + folderList;

        let query = `
            SELECT SI_ID, SI_NAME, SI_OWNER, SI_PARENT_FOLDER, SI_CREATION_TIME, SI_KIND
            FROM CI_INFOOBJECTS
            WHERE SI_PARENT_FOLDER IN (${folderList})
        `;

        const cmsRes = await fetch(`${baseUrl}/cmsquery?pagesize=9999`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            },
            body: JSON.stringify({ query })
        });

        const cmsData = await parseResponse(cmsRes);
        const objects = cmsData.entries || cmsData.feed?.entry || [];

        const promises = objects.map(obj => {

            const id = obj.SI_ID || obj.id;

            return fetch(`${baseUrl}/documents/${id}/schedules`, {
                headers: {
                    "X-SAP-LogonToken": token,
                    "Accept": "application/json"
                }
            })
            .then(res => parseResponse(res))
            .then(data => ({
                obj,
                schedules: data.entries || data.feed?.entry || []
            }))
            .catch(() => null);
        });

        const results = await Promise.all(promises);

        let count = 0;

        results.forEach(r => {
            if (!r) return;

            r.schedules.forEach(s => {

                let tr = document.createElement("tr");

                function td(v) {
                    let c = document.createElement("td");
                    c.innerText = v || "";
                    return c;
                }

                tr.appendChild(td(r.obj.SI_NAME));
                tr.appendChild(td(r.obj.SI_KIND));
                tr.appendChild(td(s.status));
                tr.appendChild(td(r.obj.SI_PARENT_FOLDER));
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
        statusMsg.innerText = "Error:\n" + err.message;
    }
});

</script>

</body>
</html>