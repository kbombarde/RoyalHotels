<!DOCTYPE html>
<html>
<head>
    <title>SAP BO Ultra Fast Viewer</title>
</head>
<body>

<h3>SAP BO Super Ultra Fast ⚡</h3>

Token:
<input type="text" id="token" size="80"><br><br>

Parent Folder:
<select id="folderSelect">
    <option value="">-- Load after token --</option>
</select>

<br><br>
<button id="runBtn">Run Query</button>

<p id="status"></p>

<!-- Loader -->
<div id="loader" style="display:none;">
    <div style="width:30px;height:30px;border:5px solid #ccc;border-top:5px solid black;border-radius:50%;animation:spin 1s linear infinite;"></div>
</div>

<style>
@keyframes spin {
    100% { transform: rotate(360deg); }
}
</style>

<h4>Query Used:</h4>
<pre id="queryBox" style="background:#f5f5f5;padding:10px;"></pre>

<table border="1" id="table">
<thead>
<tr>
<th>si_id</th><th>si_name</th><th>si_kind</th><th>si_schedule_status</th>
<th>si_parent_folder_cuid</th><th>si_owner</th>
<th>si_starttime</th><th>si_endtime</th>
<th>si_machine_used</th><th>si_status_info</th>
</tr>
</thead>
<tbody></tbody>
</table>

<script>

const baseUrl = "http://YOUR_BO_SERVER:6405/biprws/v1";

let folderTree = {};
let allFolders = [];

// Prevent refresh
document.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

// XML → JSON
function xmlToJson(xml) {
    let obj = {};
    if (xml.nodeType === 3) return xml.nodeValue.trim();

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
    return obj;
}

async function parse(res) {
    const text = await res.text();
    if (!res.ok) throw new Error(text);

    try { return JSON.parse(text); }
    catch {
        return xmlToJson(new DOMParser().parseFromString(text, "text/xml"));
    }
}

// 🚀 LOAD ALL FOLDERS ONCE (KEY SPEED BOOST)
document.getElementById("token").addEventListener("blur", async () => {

    const token = document.getElementById("token").value.trim();
    if (!token) return;

    const status = document.getElementById("status");
    const loader = document.getElementById("loader");

    status.innerText = "Loading all folders (one-time)...";
    loader.style.display = "block";

    try {

        const res = await fetch(`${baseUrl}/folders?pagesize=9999`, {
            headers: {
                "X-SAP-LogonToken": token,
                "Accept": "application/json"
            }
        });

        const data = await parse(res);
        const folders = data.entries || data.feed?.entry || [];

        allFolders = folders;
        folderTree = {};

        const dropdown = document.getElementById("folderSelect");
        dropdown.innerHTML = "";

        folders.forEach(f => {

            const cuid = f.cuid || f["@attributes"]?.cuid;
            const parent = f.parent_cuid || f.si_parent_cuid;
            const name = f.name || f.title;

            if (!cuid) return;

            if (!folderTree[parent]) folderTree[parent] = [];
            folderTree[parent].push(cuid);

            let opt = document.createElement("option");
            opt.value = cuid;
            opt.text = name;
            dropdown.appendChild(opt);
        });

        status.innerText = "Folders cached: " + folders.length;

    } catch (e) {
        status.innerText = e.message;
    }

    loader.style.display = "none";
});

// ⚡ INSTANT TREE TRAVERSAL
function getAllCuids(root) {

    let result = new Set([root]);
    let stack = [root];

    while (stack.length) {
        let current = stack.pop();
        let children = folderTree[current] || [];

        children.forEach(c => {
            if (!result.has(c)) {
                result.add(c);
                stack.push(c);
            }
        });
    }

    return Array.from(result);
}

// 🚀 RUN QUERY
document.getElementById("runBtn").addEventListener("click", async () => {

    const token = document.getElementById("token").value.trim();
    const root = document.getElementById("folderSelect").value;

    const status = document.getElementById("status");
    const loader = document.getElementById("loader");
    const tbody = document.querySelector("#table tbody");
    const queryBox = document.getElementById("queryBox");

    if (!token || !root) return;

    tbody.innerHTML = "";
    loader.style.display = "block";

    try {

        status.innerText = "Resolving folders (instant)...";

        const cuids = getAllCuids(root);

        const query = `
SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
FROM ci_infoobjects, ci_appobjects, ci_systemobjects
WHERE si_instance=1 AND si_parent_folder_cuid IN (${cuids.map(c=>`'${c}'`).join(",")})
`;

        queryBox.innerText = query;

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

        status.innerText = "Rendering...";

        // ⚡ Chunk rendering
        let i = 0;

        function render() {
            let chunk = rows.slice(i, i + 200);

            chunk.forEach(r => {

                let tr = document.createElement("tr");

                function td(v) {
                    let c = document.createElement("td");
                    c.innerText = v || "";
                    return c;
                }

                tr.appendChild(td(r.si_id));
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

            i += 200;

            if (i < rows.length) {
                requestAnimationFrame(render);
            } else {
                status.innerText = "Loaded " + rows.length + " rows ⚡";
                loader.style.display = "none";
            }
        }

        render();

    } catch (e) {
        status.innerText = e.message;
        loader.style.display = "none";
    }
});

</script>

</body>
</html>