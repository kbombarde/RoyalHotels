<!DOCTYPE html>
<html>
<head>
    <title>SAP BO Max Depth</title>
</head>
<body>

<h3>SAP BO Recursive Max Depth</h3>

Token:
<input type="text" id="token" size="80"><br><br>

Parent Folder CUID:
<input type="text" id="folderInput"><br><br>

<button id="runBtn">Run Query</button>

<p id="status"></p>

<div id="loader" style="display:none;">
    <div style="width:30px;height:30px;border:5px solid #ccc;border-top:5px solid black;border-radius:50%;animation:spin 1s linear infinite;"></div>
</div>

<style>
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>

<h4>Query Used:</h4>
<pre id="queryBox"></pre>

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

// 🔥 SAFE VALUE EXTRACTOR
function getVal(obj, key) {
    return obj[key] ||
           obj[key.toUpperCase()] ||
           obj?.properties?.[key]?.value ||
           obj?.properties?.[key.toUpperCase()]?.value ||
           obj?.["@attributes"]?.[key] ||
           "";
}

// 🔥 TRUE MAX DEPTH BFS (IMPORTANT FIX)
async function getAllCuidsMaxDepth(root, token) {

    let visited = new Set();
    let queue = [root];

    visited.add(root);

    const CONCURRENCY = 5;

    while (queue.length > 0) {

        let batch = queue.splice(0, CONCURRENCY);

        let responses = await Promise.all(batch.map(cuid =>
            fetch(`${baseUrl}/folders/${cuid}/children`, {
                headers: {
                    "X-SAP-LogonToken": token,
                    "Accept": "application/json"
                }
            })
            .then(r => parse(r))
            .catch(() => null)
        ));

        responses.forEach(data => {

            if (!data) return;

            const children = data.entries || data.feed?.entry || [];

            children.forEach(child => {

                const childCuid = getVal(child, "cuid");

                if (childCuid && !visited.has(childCuid)) {
                    visited.add(childCuid);
                    queue.push(childCuid);
                }
            });
        });
    }

    return Array.from(visited);
}

// 🚀 RUN QUERY
document.getElementById("runBtn").addEventListener("click", async () => {

    const token = document.getElementById("token").value.trim();
    const root = document.getElementById("folderInput").value.trim();

    const status = document.getElementById("status");
    const loader = document.getElementById("loader");
    const tbody = document.querySelector("#table tbody");
    const queryBox = document.getElementById("queryBox");

    if (!token || !root) return;

    tbody.innerHTML = "";
    loader.style.display = "block";

    try {

        status.innerText = "🔍 Traversing folder tree (max depth)...";

        const cuids = await getAllCuidsMaxDepth(root, token);

        status.innerText = "📂 Total folders found: " + cuids.length;

        const query = `
SELECT si_id, si_name, si_kind, si_schedule_status, si_parent_folder_cuid,
si_owner, si_starttime, si_endtime, si_machine_used, si_status_info
FROM ci_infoobjects, ci_appobjects, ci_systemobjects
WHERE si_instance=1 AND si_parent_folder_cuid IN (${cuids.map(c=>`'${c}'`).join(",")})
`;

        queryBox.innerText = query;

        status.innerText = "⚡ Running query...";

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

        status.innerText = "📊 Rendering results...";

        rows.forEach(r => {

            let tr = document.createElement("tr");

            function td(v) {
                let c = document.createElement("td");
                c.innerText = v || "";
                return c;
            }

            tr.appendChild(td(getVal(r, "SI_ID")));
            tr.appendChild(td(getVal(r, "SI_NAME")));
            tr.appendChild(td(getVal(r, "SI_KIND")));
            tr.appendChild(td(getVal(r, "SI_SCHEDULE_STATUS")));
            tr.appendChild(td(getVal(r, "SI_PARENT_FOLDER_CUID")));
            tr.appendChild(td(getVal(r, "SI_OWNER")));
            tr.appendChild(td(getVal(r, "SI_STARTTIME")));
            tr.appendChild(td(getVal(r, "SI_ENDTIME")));
            tr.appendChild(td(getVal(r, "SI_MACHINE_USED")));
            tr.appendChild(td(getVal(r, "SI_STATUS_INFO")));

            tbody.appendChild(tr);
        });

        status.innerText = "✅ Loaded " + rows.length + " rows";

    } catch (e) {
        status.innerText = "❌ " + e.message;
    }

    loader.style.display = "none";
});

</script>

</body>
</html>