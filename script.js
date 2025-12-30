/*************************************************
 * API CONFIGURATION
 *************************************************/
const API_CONFIG = {
  BASE_URL: "https://baseurl",
  FOLDERS_ENDPOINT: "/v1/folders",
  HEADERS: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
};

/*************************************************
 * APPLICATION STATE
 *************************************************/
let currentFolder = null; // { id, name, path }
const navigationStack = [];

const stagedSelections = new Set();
const finalSelections = new Set();

/*************************************************
 * API HELPER
 *************************************************/
async function apiGet(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: API_CONFIG.HEADERS
  });

  if (!response.ok) {
    throw new Error(`API Error ${response.status}`);
  }

  return response.json();
}

/*************************************************
 * LOAD ROOT FOLDERS (LEFT PANE)
 *************************************************/
async function loadRootFolders() {
  const ul = document.getElementById("rootFolders");
  ul.innerHTML = "";

  const data = await apiGet(
    `${API_CONFIG.BASE_URL}${API_CONFIG.FOLDERS_ENDPOINT}/`
  );

  data.entries
    .filter(entry => entry.type === "Folder")
    .forEach(folder => {
      const li = document.createElement("li");
      li.className =
        "px-3 py-2 rounded cursor-pointer hover:bg-slate-700";

      li.textContent = `📁 ${folder.name}`;

      li.onclick = () => openFolder(folder, "root/");
      ul.appendChild(li);
    });
}

/*************************************************
 * OPEN FOLDER (RIGHT PANE)
 *************************************************/
async function openFolder(folder, parentPath) {
  currentFolder = {
    id: folder.id,
    name: folder.name,
    path: `${parentPath}${folder.name}/`
  };

  navigationStack.push(currentFolder);
  stagedSelections.clear();

  updateBreadcrumb();
  updateUpButton();

  const tbody = document.getElementById("content");
  tbody.innerHTML = "";

  const data = await apiGet(
    `${API_CONFIG.BASE_URL}${API_CONFIG.FOLDERS_ENDPOINT}/${folder.id}/children`
  );

  data.entries.forEach(item => {
    const isFolder = item.type === "Folder";
    const fullPath =
      currentFolder.path + item.name + (isFolder ? "/" : "");

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 cursor-pointer";

    tr.innerHTML = `
      <td class="px-4 py-2">
        <input
          type="checkbox"
          data-path="${fullPath}"
          class="mr-2"
          onchange="toggleStage('${fullPath}', this.checked)">
        ${isFolder ? "📁" : "📄"}
        <span class="ml-1">${item.name}</span>
      </td>
    `;

    tr.onclick = (e) => {
      if (isFolder && e.target.tagName !== "INPUT") {
        openFolder(item, currentFolder.path);
      }
    };

    tbody.appendChild(tr);
  });
}

/*************************************************
 * NAVIGATION
 *************************************************/
function updateBreadcrumb() {
  document.getElementById("breadcrumb").textContent =
    currentFolder ? currentFolder.path : "Select a folder";
}

function updateUpButton() {
  document.getElementById("upBtn").disabled =
    navigationStack.length <= 1;
}

function goUp() {
  if (navigationStack.length <= 1) return;

  navigationStack.pop();
  const previous = navigationStack.pop();

  const parentPath =
    previous.path.replace(previous.name + "/", "");

  openFolder(previous, parentPath);
}

/*************************************************
 * SELECTION LOGIC
 *************************************************/
function toggleStage(path, checked) {
  checked ? stagedSelections.add(path) : stagedSelections.delete(path);
}

function addSelected() {
  stagedSelections.forEach(p => finalSelections.add(p));
  renderFinal();
}

function renderFinal() {
  const ul = document.getElementById("selectedList");
  ul.innerHTML = "";

  [...finalSelections].sort().forEach(path => {
    const li = document.createElement("li");
    li.className =
      "flex justify-between items-center px-4 py-2 text-sm";

    li.innerHTML = `
      <span>${path}</span>
      <button
        class="text-red-600 hover:text-red-800"
        onclick="removeItem('${path}')">
        ❌
      </button>
    `;

    ul.appendChild(li);
  });
}

function removeItem(path) {
  finalSelections.delete(path);
  stagedSelections.delete(path);
  uncheckIfVisible(path);
  renderFinal();
}

function uncheckIfVisible(path) {
  document.querySelectorAll("input[type='checkbox']").forEach(cb => {
    if (cb.dataset.path === path) {
      cb.checked = false;
    }
  });
}

/*************************************************
 * INIT
 *************************************************/
loadRootFolders().catch(err => {
  console.error("Failed to load root folders:", err);
});
