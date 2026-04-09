<!DOCTYPE html>
<html>
<head>
    <title>SAP BO Query Viewer</title>
</head>
<body>

<h3>SAP BO Schedule Data</h3>

Token:
<input type="text" id="token" size="80"><br><br>

Parent Folder:
<select id="folderSelect">
    <option value="">-- Load after token --</option>
</select>

<br><br>
<button id="runBtn">Run Query</button>

<p id="status"></p>

<table border="1" id="table">
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

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";

// Prevent refresh
document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

// XML → JSON
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

// Parse response
async function parse(res) {
    const text = await res.text();
    if (!res.ok) throw new Error(text);

    try { return JSON.parse(text); }
    catch {
        return xmlToJson(new DOMParser().parseFromString(text, "text/xml"));
    }
}

// Load folders
document.getElementById("token").addEventListener("blur", async () => {

    const token = document.getElementById("token").value.trim();
    if (!token) return;

    const res = await fetch(`${baseUrl}/folders?pagesize=9999`, {
        headers: {
            "X-SAP-LogonToken": token,
            "Accept": "application/json"
        }
    });

    const data = await parse(res);
    const folders = data.entries || data.feed?.entry || [];

    const dropdown = document.getElementById("folderSelect");
    dropdown.innerHTML = "";

    folders.forEach(f => {
        const cuid = f.cuid || f["@attributes"]?.cuid;
        const name = f.name || f.title;

        if (!cuid) return;

        let opt = document.createElement("option");
        opt.value = cuid;
        opt.text = name;
        dropdown.appendChild(opt);
    });
});

// 🔥 Recursive folder traversal (FAST BFS)
async function getAllChildCuids(root, token) {

    let result = new Set([root]);
    let queue = [root];

    while (queue.length) {

        let current = queue.shift();

        try {
            const res = await fetch(`${baseUrl}/folders/${current}/children`, {
                headers: {
                    "X-SAP-LogonToken": token,
                    "Accept": "application/json"
                }
            });

            const data = await parse(res);
            const children = data.entries || data.feed?.entry || [];

            children.forEach(c => {
                const cuid = c.cuid || c["@attributes"]?.cuid;

                if (cuid && !result.has(cuid)) {
                    result.add(cuid);
                    queue.push(cuid);
                }
            });

        } catch {}
    }

    return Array.from(result);
}

// Run query
document.getElementById("runBtn").addEventListener("click", async () => {

    const token = document.getElementById("token").value.trim();
    const root = document.getElementById("folderSelect").value;
    const status = document.getElementById("status");
    const tbody = document.querySelector("#table tbody");

    if (!token || !root) return;

    status.innerText = "Getting folders...";
    tbody.innerHTML = "";

    try {

        const cuids = await getAllChildCuids(root, token);

        status.innerText = "Folders: " + cuids.length;

        const query = `
SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
FROM ci_infoobjects, ci_appobjects, ci_systemobjects
WHERE si_instance=1 AND si_parent_folder_cuid IN (${cuids.map(c=>`'${c}'`).join(",")})
`;

        status.innerText = "Running query...";

        const res = await fetch(`${baseUrl}/cmsquery?pagesize=9999`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            },
            body: JSON.stringify({ query })
        });

        const data = await parse(res);
        const rows = data.entries || data.feed?.entry || [];

        rows.forEach(r => {

            let tr = document.createElement("tr");

            function td(v) {
                let c = document.createElement("td");
                c.innerText = v || "";
                return c;
            }

            tr.appendChild(td(r.si_name));
            tr.appendChild(td(r.si_kind));
            tr.appendChild(td(r.si_schedule_status));
            tr.appendChild(td(r.si_parent_folder_cuid));
            tr.appendChild(td(r.si_owner));
            tr.appendChild(td(r.si_starttime));
            tr.appendChild(td(r.si_endtime));
            tr.appendChild(td(r.si_machine_used));
            tr.appendChild(td(r.si_status_info));

            tbody.appendChild(tr);
        });

        status.innerText = "Loaded " + rows.length + " rows";

    } catch (e) {
        status.innerText = e.message;
    }
});

</script>

</body>
</html>