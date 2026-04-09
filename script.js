<!DOCTYPE html>
<html>
<head>
    <title>SAP BO Ultra Fast Viewer</title>
</head>
<body>

<h2>SAP BO Ultra Fast Schedule Viewer ⚡</h2>

<table>
<tr>
    <td>Logon Token:</td>
    <td><input type="text" id="token" size="80"></td>
</tr>

<tr>
    <td>Parent Folder:</td>
    <td>
        <select id="parentId">
            <option value="root">Root Folder</option>
        </select>
    </td>
</tr>
</table>

<br>
<button id="fetchBtn">Fetch Data</button>

<p id="statusMsg" style="white-space: pre-wrap;"></p>

<div id="loader" style="display:none;">
    <div style="width:30px;height:30px;border:5px solid #ccc;border-top:5px solid black;border-radius:50%;animation:spin 1s linear infinite;"></div>
</div>

<style>
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>

<br>

<table border="1" id="resultTable">
<thead>
<tr>
<th>Name</th><th>Type</th><th>Status</th><th>Folder</th>
<th>Owner</th><th>Start</th><th>End</th>
<th>Server</th><th>Error</th>
</tr>
</thead>
<tbody></tbody>
</table>

<script>

document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";

let folderMap = {}; // parent → children
let allFolders = []; // flat list

// 🔄 XML → JSON
function xmlToJson(xml) {
    let obj = {};
    if (xml.nodeType === 3) return xml.nodeValue.trim();

    if (xml.hasChildNodes()) {
        for (let i = 0; i < xml.childNodes.length; i++) {
            let item = xml.childNodes[i];
            let val = xmlToJson(item);
            if (!val) continue;

            if (!obj[item.nodeName]) obj[item.nodeName] = val;
            else {
                if (!Array.isArray(obj[item.nodeName]))
                    obj[item.nodeName] = [obj[item.nodeName]];
                obj[item.nodeName].push(val);
            }
        }
    }
    return obj;
}

async function parseResponse(res) {
    const text = await res.text();
    if (!res.ok) throw new Error(text);

    try { return JSON.parse(text); }
    catch {
        const xml = new DOMParser().parseFromString(text, "text/xml");
        return xmlToJson(xml);
    }
}

// 🚀 LOAD ALL FOLDERS ONCE (ULTRA FAST BASE)
document.getElementById("token").addEventListener("blur", async function() {

    const token = document.getElementById("token").value.trim();
    if (!token) return;

    const statusMsg = document.getElementById("statusMsg");
    statusMsg.innerText = "Loading ALL folders once...";

    try {

        const res = await fetch(`${baseUrl}/folders?pagesize=9999`, {
            headers: {
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            }
        });

        const data = await parseResponse(res);
        const folders = data.entries || data.feed?.entry || [];

        folderMap = {};
        allFolders = folders;

        const dropdown = document.getElementById("parentId");
        dropdown.innerHTML = '<option value="root">Root Folder</option>';

        folders.forEach(f => {

            const cuid = f.cuid || f["@attributes"]?.cuid;
            const parent = f.parentid || f.si_parentid;
            const name = f.name || f.title;

            if (!cuid) return;

            // build tree
            if (!folderMap[parent]) folderMap[parent] = [];
            folderMap[parent].push(cuid);

            // dropdown
            let opt = document.createElement("option");
            opt.value = cuid;
            opt.text = name;
            dropdown.appendChild(opt);
        });

        statusMsg.innerText = "Folders cached: " + folders.length;

    } catch (err) {
        statusMsg.innerText = err.message;
    }
});

// ⚡ INSTANT TREE TRAVERSAL (NO API CALL)
function getAllChildCuidsFast(root) {

    let result = new Set([root]);
    let stack = [root];

    while (stack.length) {
        let current = stack.pop();
        let children = folderMap[current] || [];

        children.forEach(c => {
            if (!result.has(c)) {
                result.add(c);
                stack.push(c);
            }
        });
    }

    return Array.from(result);
}

// 🚀 FETCH DATA
document.getElementById("fetchBtn").addEventListener("click", async function() {

    const token = document.getElementById("token").value.trim();
    const parent = document.getElementById("parentId").value;

    const statusMsg = document.getElementById("statusMsg");
    const tableBody = document.querySelector("#resultTable tbody");
    const loader = document.getElementById("loader");

    if (!token) return;

    tableBody.innerHTML = "";
    loader.style.display = "block";

    try {

        statusMsg.innerText = "Resolving folder tree (instant)...";

        const cuids = parent === "root"
            ? allFolders.map(f => f.cuid)
            : getAllChildCuidsFast(parent);

        statusMsg.innerText = "Folders: " + cuids.length;

        const query = `
SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
FROM ci_infoobjects, ci_appobjects, ci_systemobjects
WHERE si_instance=1 AND si_parent_folder_cuid IN (${cuids.map(c=>`'${c}'`).join(",")})
`;

        statusMsg.innerText = "Running CMS query...";

        const res = await fetch(`${baseUrl}/cmsquery?pagesize=9999`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            },
            body: JSON.stringify({ query })
        });

        const data = await parseResponse(res);
        const objects = data.entries || data.feed?.entry || [];

        statusMsg.innerText = "Rendering...";

        // ⚡ Chunk rendering (no freeze)
        let i = 0;

        function renderChunk() {
            let chunk = objects.slice(i, i + 200);

            chunk.forEach(obj => {
                let tr = document.createElement("tr");

                function td(v) {
                    let c = document.createElement("td");
                    c.innerText = v || "";
                    return c;
                }

                tr.appendChild(td(obj.si_name));
                tr.appendChild(td(obj.si_kind));
                tr.appendChild(td(obj.si_schedule_status));
                tr.appendChild(td(obj.si_parent_folder_cuid));
                tr.appendChild(td(obj.si_owner));
                tr.appendChild(td(obj.si_starttime));
                tr.appendChild(td(obj.si_endtime));
                tr.appendChild(td(obj.si_machine_used));
                tr.appendChild(td(obj.si_status_info));

                tableBody.appendChild(tr);
            });

            i += 200;

            if (i < objects.length) {
                requestAnimationFrame(renderChunk);
            } else {
                statusMsg.innerText = "Loaded " + objects.length + " rows ⚡";
                loader.style.display = "none";
            }
        }

        renderChunk();

    } catch (err) {
        statusMsg.innerText = err.message;
        loader.style.display = "none";
    }
});

</script>

</body>
</html>