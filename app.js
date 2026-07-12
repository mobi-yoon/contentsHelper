let recipes = [];
let scrolls = [];
let materials = [];
let byName = {};
let byMaterial = {};

async function loadData() {
  const [r, s, m] = await Promise.all([
    fetch("data/recipes.json").then(res => res.json()),
    fetch("data/scrolls.json").then(res => res.json()),
    fetch("data/materials.json").then(res => res.json()),
  ]);
  recipes = r;
  scrolls = s;
  materials = m;
  buildIndexes();
}

function buildIndexes() {
  byName = {};
  byMaterial = {};
  for (const r of recipes) {
    byName[r.name] = r;
  }
  for (const r of recipes) {
    for (const mat of r.materials) {
      if (!byMaterial[mat.name]) byMaterial[mat.name] = [];
      byMaterial[mat.name].push({ name: r.name, qty: mat.qty });
    }
  }
}

function getMajorCategory(name) {
  const r = byName[name];
  return r ? r.major_category : null;
}

// visited: Set of names already on the current path (cycle guard)
function breakdownTree(name, qty, visited) {
  visited = visited || new Set();
  if (visited.has(name)) {
    throw new Error(`순환 참조가 감지되었습니다: ${name}`);
  }

  const recipe = byName[name];
  if (!recipe) {
    return { name, qty, isRaw: true, children: [], crafts: null, produced: qty };
  }

  const outputQty = recipe.output_qty || 1;
  const crafts = Math.ceil(qty / outputQty);
  const produced = crafts * outputQty;

  const nextVisited = new Set(visited);
  nextVisited.add(name);

  const children = recipe.materials.map(mat =>
    breakdownTree(mat.name, mat.qty * crafts, nextVisited)
  );

  return { name, qty, isRaw: false, children, crafts, produced };
}

function summarizeRequirements(tree) {
  const processed = {};
  const raw = {};

  function walk(node, isRoot) {
    if (!isRoot) {
      if (node.isRaw) {
        raw[node.name] = (raw[node.name] || 0) + node.qty;
      } else {
        if (!processed[node.name]) {
          processed[node.name] = { qty: 0, crafts: 0, produced: 0 };
        }
        processed[node.name].qty += node.qty;
        processed[node.name].crafts += node.crafts;
        processed[node.name].produced += node.produced;
      }
    }
    for (const child of node.children) walk(child, false);
  }

  walk(tree, true);
  return { processed, raw };
}

function recipeLabel(r) {
  const sub = r.sub_category ? `/${r.sub_category}` : "";
  return `[${r.major_category}${sub}] ${r.name} (산출 ${r.output_qty}개)`;
}

function renderMaterialsList(list) {
  if (!list.length) return "<p>없음</p>";
  const items = list.map(m => `<li>${m.name} x${m.qty}</li>`).join("");
  return `<ul>${items}</ul>`;
}

// ---------- 탭 전환 ----------

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ---------- 1. 완제품 검색 ----------

function setupFindProduct() {
  const input = document.getElementById("fp-input");
  const result = document.getElementById("fp-result");

  input.addEventListener("input", () => {
    const name = input.value.trim();
    const recipe = byName[name];
    if (!recipe) {
      result.innerHTML = name ? "<p>찾을 수 없습니다.</p>" : "";
      return;
    }
    result.innerHTML = `
      <div class="card">
        <h3>${recipeLabel(recipe)}</h3>
        ${renderMaterialsList(recipe.materials)}
      </div>`;
  });
}

// ---------- 2. 재료 역검색 ----------

function setupFindMaterial() {
  const input = document.getElementById("fm-input");
  const result = document.getElementById("fm-result");

  input.addEventListener("input", () => {
    const name = input.value.trim();
    const users = byMaterial[name];
    if (!users || !users.length) {
      result.innerHTML = name ? "<p>사용하는 완제품이 없습니다.</p>" : "";
      return;
    }
    const items = users.map(u => `<li>${u.name} (필요 수량: ${u.qty})</li>`).join("");
    result.innerHTML = `<ul>${items}</ul>`;
  });
}

// ---------- 3. 필요 재료 계산 ----------

function setupBreakdown() {
  const nameInput = document.getElementById("bd-name");
  const qtyInput = document.getElementById("bd-qty");
  const btn = document.getElementById("bd-run");
  const result = document.getElementById("bd-result");

  btn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const qty = parseInt(qtyInput.value, 10) || 1;

    if (!byName[name]) {
      result.innerHTML = "<p>찾을 수 없습니다.</p>";
      return;
    }

    let tree;
    try {
      tree = breakdownTree(name, qty);
    } catch (e) {
      result.innerHTML = `<p>오류: ${e.message}</p>`;
      return;
    }

    const { processed, raw } = summarizeRequirements(tree);
    result.innerHTML = renderRequirements(name, qty, processed, raw);
  });
}

function renderRequirements(name, qty, processed, raw) {
  const processedEntries = Object.entries(processed);
  const rawEntries = Object.entries(raw);

  const processedHtml = processedEntries.length
    ? "<ul>" + processedEntries.map(([n, info]) => {
        const overage = info.produced === info.qty ? "" : ` → ${info.produced}개 생산`;
        return `<li>${n}: ${info.qty}개 (제작 ${info.crafts}회${overage})</li>`;
      }).join("") + "</ul>"
    : "<p>없음</p>";

  const rawHtml = rawEntries.length
    ? "<ul>" + rawEntries.map(([n, q]) => `<li>${n}: ${q}개</li>`).join("") + "</ul>"
    : "<p>없음</p>";

  return `
    <p><strong>${name}</strong> ${qty}개 제작 시 필요</p>
    <h4>가공품</h4>${processedHtml}
    <h4>원재료</h4>${rawHtml}`;
}

// ---------- 4. 스크롤 계산 ----------

function setupScrollCalc() {
  const select = document.getElementById("sc-select");
  const qtyInput = document.getElementById("sc-qty");
  const btn = document.getElementById("sc-run");
  const result = document.getElementById("sc-result");

  select.innerHTML = scrolls
    .map((s, i) => `<option value="${i}">[${s.scroll_type}] ${s.target_name} (${s.town || "미상"})</option>`)
    .join("");

  btn.addEventListener("click", () => {
    const scroll = scrolls[select.value];
    if (!scroll) {
      result.innerHTML = "<p>등록된 스크롤이 없습니다.</p>";
      return;
    }
    const n = parseInt(qtyInput.value, 10) || 1;
    const totalQty = scroll.qty_per_scroll * n;

    let tree;
    try {
      tree = breakdownTree(scroll.target_name, totalQty);
    } catch (e) {
      result.innerHTML = `<p>오류: ${e.message}</p>`;
      return;
    }

    const { processed, raw } = summarizeRequirements(tree);
    const header = `<p>'${scroll.scroll_type} 스크롤: ${scroll.target_name}' ${n}장 -> ${scroll.target_name} ${totalQty}개 필요</p>`;
    result.innerHTML = header + renderRequirements(scroll.target_name, totalQty, processed, raw).replace(/<p><strong>.*?<\/p>/, "");
  });
}

// ---------- 5. 전체 목록 ----------

let currentList = "recipes";

function setupLists() {
  document.querySelectorAll(".list-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".list-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentList = btn.dataset.list;
      renderList();
    });
  });
  document.getElementById("list-filter").addEventListener("input", renderList);
}

function renderList() {
  const filter = document.getElementById("list-filter").value.trim().toLowerCase();
  const result = document.getElementById("list-result");

  if (currentList === "recipes") {
    const items = recipes.filter(r => r.name.toLowerCase().includes(filter));
    result.innerHTML = items.length
      ? items.map(r => `
          <div class="card">
            <h3>${recipeLabel(r)}</h3>
            ${renderMaterialsList(r.materials)}
          </div>`).join("")
      : "<p>없음</p>";
  } else if (currentList === "scrolls") {
    const items = scrolls.filter(s => s.target_name.toLowerCase().includes(filter));
    result.innerHTML = items.length
      ? items.map(s => `
          <div class="card">
            <h3>[${s.scroll_type} 스크롤] ${s.target_name}</h3>
            <div class="tag">마을: ${s.town || "미상"} · 1장당 ${s.qty_per_scroll}개</div>
          </div>`).join("")
      : "<p>없음</p>";
  } else {
    const items = materials.filter(m => m.toLowerCase().includes(filter));
    result.innerHTML = items.length
      ? "<ul>" + items.map(m => `<li>${m}</li>`).join("") + "</ul>"
      : "<p>없음</p>";
  }
}

// ---------- 자동완성 ----------

function setupAutocomplete() {
  const productNames = recipes.map(r => r.name);
  const materialNames = Object.keys(byMaterial);

  const fpList = document.getElementById("fp-datalist");
  fpList.innerHTML = productNames.map(n => `<option value="${n}">`).join("");

  const bdList = document.getElementById("bd-datalist");
  bdList.innerHTML = productNames.map(n => `<option value="${n}">`).join("");

  const fmList = document.getElementById("fm-datalist");
  fmList.innerHTML = materialNames.map(n => `<option value="${n}">`).join("");
}

// ---------- 편집: 공용 헬퍼 ----------

const MAJOR_CATEGORIES = ["가공품", "제작품"];
const DEFAULT_SCROLL_TYPES = ["채집", "채광", "제작", "요리"];
const GH_SETTINGS_KEY = "makingdb_gh_settings";

function recipeExists(name) {
  return name in byName;
}

function getSettings() {
  const raw = localStorage.getItem(GH_SETTINGS_KEY);
  const defaults = { owner: "mobi-yoon", repo: "MakingDB", branch: "main", token: "" };
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveSettings(s) {
  localStorage.setItem(GH_SETTINGS_KEY, JSON.stringify(s));
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function ghRequest(url, options = {}) {
  const settings = getSettings();
  if (!settings.token) {
    throw new Error("GitHub 토큰이 설정되어 있지 않습니다. 'GitHub 연결' 탭에서 먼저 설정해주세요.");
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.message) detail = body.message;
    } catch {}
    throw new Error(`GitHub API 오류 (${res.status}): ${detail}`);
  }
  return res.json();
}

async function commitFile(path, dataObj, message) {
  const settings = getSettings();
  const apiBase = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}`;
  const current = await ghRequest(`${apiBase}?ref=${encodeURIComponent(settings.branch)}`);
  const jsonStr = JSON.stringify(dataObj, null, 2) + "\n";
  return ghRequest(apiBase, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(jsonStr),
      sha: current.sha,
      branch: settings.branch,
    }),
  });
}

async function commitRecipes(message) {
  await commitFile("data/recipes.json", recipes, message);
}
async function commitScrolls(message) {
  await commitFile("data/scrolls.json", scrolls, message);
}
async function commitMaterials(message) {
  await commitFile("data/materials.json", materials, message);
}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = "result" + (kind ? ` ${kind}` : "");
}

function refreshAfterDataChange() {
  buildIndexes();
  setupAutocomplete();
  refreshEditDatalists();
  renderList();
  document.getElementById("status").textContent =
    `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length}`;
  window.dispatchEvent(new Event("makingdb:datachanged"));
}

function refreshEditDatalists() {
  const subs = [...new Set(recipes.map(r => r.sub_category).filter(Boolean))];
  document.getElementById("sub-datalist").innerHTML = subs.map(s => `<option value="${escapeAttr(s)}">`).join("");

  const scrollTypes = [...new Set([...DEFAULT_SCROLL_TYPES, ...scrolls.map(s => s.scroll_type)])];
  document.getElementById("scroll-type-datalist").innerHTML =
    scrollTypes.map(t => `<option value="${escapeAttr(t)}">`).join("");

  const towns = [...new Set(scrolls.map(s => s.town).filter(Boolean))];
  document.getElementById("town-datalist").innerHTML = towns.map(t => `<option value="${escapeAttr(t)}">`).join("");

  const allItems = [...new Set([...recipes.map(r => r.name), ...materials])];
  document.getElementById("all-item-datalist").innerHTML =
    allItems.map(n => `<option value="${escapeAttr(n)}">`).join("");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- 편집: 재료 행 UI ----------

function addMaterialRow(container, name = "", qty = 1) {
  const row = document.createElement("div");
  row.className = "material-row";
  row.innerHTML = `
    <input type="text" class="mat-name" list="all-item-datalist" placeholder="재료 이름" value="${escapeAttr(name)}">
    <input type="number" class="mat-qty" min="1" value="${qty}">
    <button type="button" class="mat-remove">삭제</button>
  `;
  row.querySelector(".mat-remove").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

function readMaterialRows(container) {
  const rows = [...container.querySelectorAll(".material-row")];
  const result = [];
  for (const row of rows) {
    const name = row.querySelector(".mat-name").value.trim();
    const qty = parseInt(row.querySelector(".mat-qty").value, 10);
    if (!name || !qty || qty < 1) continue;
    result.push({ name, qty });
  }
  return result;
}

// 새로운 원재료 이름이 섞여 있으면 사용자 확인 후 materials 배열에 등록(커밋은 호출부에서 함께 처리).
// 반환값: 새로 등록된 이름 배열(없으면 빈 배열), 사용자가 취소하면 null.
function confirmAndRegisterNewMaterials(materialRows) {
  const unknown = [...new Set(
    materialRows.map(m => m.name).filter(n => !(n in byName) && !materials.includes(n))
  )];
  if (unknown.length === 0) return [];
  const ok = confirm(
    `다음 재료는 처음 보는 이름입니다. 새 원재료로 등록할까요?\n\n${unknown.join(", ")}`
  );
  if (!ok) return null;
  for (const n of unknown) materials.push(n);
  return unknown;
}

// ---------- 편집 탭 전환 ----------

function setupEditTabs() {
  document.querySelectorAll(".edit-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".edit-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".edit-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.edit).classList.add("active");
    });
  });
}

// ---------- GitHub 연결 설정 ----------

function setupGhSettings() {
  const ownerInput = document.getElementById("gh-owner");
  const repoInput = document.getElementById("gh-repo");
  const branchInput = document.getElementById("gh-branch");
  const tokenInput = document.getElementById("gh-token");
  const status = document.getElementById("gh-status");

  const s = getSettings();
  ownerInput.value = s.owner;
  repoInput.value = s.repo;
  branchInput.value = s.branch;
  tokenInput.value = s.token;

  document.getElementById("gh-save-btn").addEventListener("click", () => {
    saveSettings({
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || "main",
      token: tokenInput.value.trim(),
    });
    showMsg(status, "설정을 저장했습니다.", "success");
  });

  document.getElementById("gh-clear-btn").addEventListener("click", () => {
    tokenInput.value = "";
    const cur = getSettings();
    saveSettings({ ...cur, token: "" });
    showMsg(status, "토큰을 지웠습니다.", "success");
  });

  document.getElementById("gh-test-btn").addEventListener("click", async () => {
    showMsg(status, "연결 확인 중...", "");
    try {
      const cur = getSettings();
      await ghRequest(`https://api.github.com/repos/${cur.owner}/${cur.repo}`);
      showMsg(status, "연결 성공: 저장소에 접근할 수 있습니다.", "success");
    } catch (e) {
      showMsg(status, e.message, "error");
    }
  });
}

// ---------- 제작법 추가 ----------

function setupRecipeAdd() {
  const materialsBox = document.getElementById("ra-materials");
  addMaterialRow(materialsBox);
  document.getElementById("ra-add-material-btn").addEventListener("click", () => addMaterialRow(materialsBox));

  document.getElementById("ra-save-btn").addEventListener("click", async () => {
    const msg = document.getElementById("ra-msg");
    const major = document.getElementById("ra-major").value;
    const sub = document.getElementById("ra-sub").value.trim();
    const name = document.getElementById("ra-name").value.trim();
    const output = parseInt(document.getElementById("ra-output").value, 10) || 1;
    const materialRows = readMaterialRows(materialsBox);

    if (!name) { showMsg(msg, "완제품 이름을 입력해주세요.", "error"); return; }
    if (recipeExists(name)) { showMsg(msg, `'${name}'은(는) 이미 등록되어 있습니다.`, "error"); return; }
    if (materialRows.length === 0) { showMsg(msg, "재료를 1개 이상 입력해주세요.", "error"); return; }
    const newlyAdded = confirmAndRegisterNewMaterials(materialRows);
    if (newlyAdded === null) { showMsg(msg, "취소했습니다.", ""); return; }

    const recipe = { major_category: major, sub_category: sub, name, output_qty: output, materials: materialRows };
    recipes.push(recipe);

    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      if (newlyAdded.length) await commitMaterials(`Add materials: ${newlyAdded.join(", ")}`);
      await commitRecipes(`Add recipe: ${name}`);
      showMsg(msg, `'${name}' 등록 완료.`, "success");
      document.getElementById("ra-name").value = "";
      document.getElementById("ra-sub").value = "";
      document.getElementById("ra-output").value = "1";
      materialsBox.innerHTML = "";
      addMaterialRow(materialsBox);
      refreshAfterDataChange();
    } catch (e) {
      recipes.pop();
      for (const n of newlyAdded) {
        const idx = materials.indexOf(n);
        if (idx !== -1) materials.splice(idx, 1);
      }
      showMsg(msg, e.message, "error");
    }
  });
}

// ---------- 제작법 수정/삭제 ----------

let rmCurrentRecipe = null;

function setupRecipeManage() {
  const materialsBox = document.getElementById("rm-materials");
  document.getElementById("rm-add-material-btn").addEventListener("click", () => addMaterialRow(materialsBox));

  document.getElementById("rm-load-btn").addEventListener("click", () => {
    const msg = document.getElementById("rm-msg");
    const name = document.getElementById("rm-select").value.trim();
    const recipe = byName[name];
    if (!recipe) {
      showMsg(msg, `'${name}'을(를) 찾을 수 없습니다.`, "error");
      document.getElementById("rm-form").classList.add("hidden");
      return;
    }
    rmCurrentRecipe = recipe;
    document.getElementById("rm-major").value = recipe.major_category;
    document.getElementById("rm-sub").value = recipe.sub_category || "";
    document.getElementById("rm-output").value = recipe.output_qty;
    materialsBox.innerHTML = "";
    recipe.materials.forEach(m => addMaterialRow(materialsBox, m.name, m.qty));
    document.getElementById("rm-form").classList.remove("hidden");
    showMsg(msg, "", "");
  });

  document.getElementById("rm-save-btn").addEventListener("click", async () => {
    const msg = document.getElementById("rm-msg");
    if (!rmCurrentRecipe) return;
    const materialRows = readMaterialRows(materialsBox);
    if (materialRows.length === 0) { showMsg(msg, "재료를 1개 이상 입력해주세요.", "error"); return; }
    const newlyAdded = confirmAndRegisterNewMaterials(materialRows);
    if (newlyAdded === null) { showMsg(msg, "취소했습니다.", ""); return; }

    const backup = { ...rmCurrentRecipe, materials: [...rmCurrentRecipe.materials] };
    rmCurrentRecipe.major_category = document.getElementById("rm-major").value;
    rmCurrentRecipe.sub_category = document.getElementById("rm-sub").value.trim();
    rmCurrentRecipe.output_qty = parseInt(document.getElementById("rm-output").value, 10) || 1;
    rmCurrentRecipe.materials = materialRows;

    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      if (newlyAdded.length) await commitMaterials(`Add materials: ${newlyAdded.join(", ")}`);
      await commitRecipes(`Edit recipe: ${rmCurrentRecipe.name}`);
      showMsg(msg, `'${rmCurrentRecipe.name}' 수정 완료.`, "success");
      refreshAfterDataChange();
    } catch (e) {
      Object.assign(rmCurrentRecipe, backup);
      for (const n of newlyAdded) {
        const idx = materials.indexOf(n);
        if (idx !== -1) materials.splice(idx, 1);
      }
      showMsg(msg, e.message, "error");
    }
  });

  document.getElementById("rm-delete-btn").addEventListener("click", async () => {
    const msg = document.getElementById("rm-msg");
    if (!rmCurrentRecipe) return;
    const users = byMaterial[rmCurrentRecipe.name] || [];
    let warnText = "";
    if (users.length) {
      warnText = `\n경고: 이 항목을 재료로 쓰는 완제품이 있습니다 -> ${users.map(u => u.name).join(", ")}`;
    }
    if (!confirm(`'${rmCurrentRecipe.name}'을(를) 정말 삭제하시겠습니까?${warnText}`)) return;

    const idx = recipes.indexOf(rmCurrentRecipe);
    recipes.splice(idx, 1);
    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      await commitRecipes(`Delete recipe: ${rmCurrentRecipe.name}`);
      showMsg(msg, "삭제 완료.", "success");
      document.getElementById("rm-form").classList.add("hidden");
      document.getElementById("rm-select").value = "";
      rmCurrentRecipe = null;
      refreshAfterDataChange();
    } catch (e) {
      recipes.splice(idx, 0, rmCurrentRecipe);
      showMsg(msg, e.message, "error");
    }
  });
}

// ---------- 스크롤 추가 ----------

function validateScrollTarget(scrollType, targetName) {
  const major = getMajorCategory(targetName);
  if (scrollType === "채집" || scrollType === "채광") {
    if (major !== null) {
      return { ok: false, reason: `'${targetName}'은(는) 이미 제작법이 있는 항목(${major})이라 ${scrollType} 스크롤 대상이 될 수 없습니다.` };
    }
    return { ok: true };
  }
  if (scrollType === "제작" || scrollType === "요리") {
    if (major !== "제작품") {
      const reason = major === null ? "제작법이 없는 재료템" : `'${major}'로 분류된 항목`;
      return { ok: false, reason: `'${targetName}'은(는) ${reason}이라 ${scrollType} 스크롤 대상이 될 수 없습니다.` };
    }
    return { ok: true };
  }
  return { ok: true };
}

function scrollExists(scrollType, targetName) {
  return scrolls.some(s => s.scroll_type === scrollType && s.target_name === targetName);
}

function setupScrollAdd() {
  document.getElementById("sa-save-btn").addEventListener("click", async () => {
    const msg = document.getElementById("sa-msg");
    const scrollType = document.getElementById("sa-type").value.trim();
    const town = document.getElementById("sa-town").value.trim();
    const targetName = document.getElementById("sa-target").value.trim();
    const qty = parseInt(document.getElementById("sa-qty").value, 10) || 1;

    if (!scrollType) { showMsg(msg, "스크롤 종류를 입력해주세요.", "error"); return; }
    if (!town) { showMsg(msg, "마을을 입력해주세요.", "error"); return; }
    if (!targetName) { showMsg(msg, "대상 아이템 이름을 입력해주세요.", "error"); return; }

    const { ok, reason } = validateScrollTarget(scrollType, targetName);
    if (!ok) { showMsg(msg, reason, "error"); return; }

    if (scrollExists(scrollType, targetName)) {
      showMsg(msg, `'${scrollType} 스크롤: ${targetName}'은(는) 이미 등록되어 있습니다.`, "error");
      return;
    }

    let registerMaterial = false;
    if ((scrollType === "채집" || scrollType === "채광") && !materials.includes(targetName)) {
      registerMaterial = confirm(`'${targetName}'을(를) 원재료 목록에도 등록해두시겠습니까?`);
    }

    const scroll = { scroll_type: scrollType, town, target_name: targetName, qty_per_scroll: qty };
    scrolls.push(scroll);
    if (registerMaterial) materials.push(targetName);

    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      if (registerMaterial) await commitMaterials(`Add material: ${targetName}`);
      await commitScrolls(`Add scroll: ${scrollType} ${targetName}`);
      showMsg(msg, `'${scrollType} 스크롤: ${targetName}' (${town}) 등록 완료.`, "success");
      document.getElementById("sa-target").value = "";
      document.getElementById("sa-qty").value = "1";
      refreshAfterDataChange();
    } catch (e) {
      scrolls.pop();
      if (registerMaterial) materials.pop();
      showMsg(msg, e.message, "error");
    }
  });
}

// ---------- 스크롤 수정/삭제 ----------

function setupScrollManage() {
  const select = document.getElementById("sm-select");

  function refreshSelect() {
    select.innerHTML = scrolls
      .map((s, i) => `<option value="${i}">[${s.scroll_type}] ${s.target_name} (${s.town || "미상"})</option>`)
      .join("");
  }
  refreshSelect();
  window.addEventListener("makingdb:datachanged", refreshSelect);

  document.getElementById("sm-load-btn").addEventListener("click", () => {
    const msg = document.getElementById("sm-msg");
    const scroll = scrolls[select.value];
    if (!scroll) { showMsg(msg, "스크롤을 선택해주세요.", "error"); return; }
    document.getElementById("sm-town").value = scroll.town || "";
    document.getElementById("sm-qty").value = scroll.qty_per_scroll;
    document.getElementById("sm-form").classList.remove("hidden");
    showMsg(msg, "", "");
  });

  document.getElementById("sm-save-btn").addEventListener("click", async () => {
    const msg = document.getElementById("sm-msg");
    const scroll = scrolls[select.value];
    if (!scroll) return;
    const backup = { ...scroll };
    scroll.town = document.getElementById("sm-town").value.trim();
    scroll.qty_per_scroll = parseInt(document.getElementById("sm-qty").value, 10) || 1;

    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      await commitScrolls(`Edit scroll: ${scroll.scroll_type} ${scroll.target_name}`);
      showMsg(msg, "수정 완료.", "success");
      refreshAfterDataChange();
      refreshSelect();
    } catch (e) {
      Object.assign(scroll, backup);
      showMsg(msg, e.message, "error");
    }
  });

  document.getElementById("sm-delete-btn").addEventListener("click", async () => {
    const msg = document.getElementById("sm-msg");
    const scroll = scrolls[select.value];
    if (!scroll) return;
    if (!confirm(`[${scroll.scroll_type} 스크롤] ${scroll.target_name}을(를) 정말 삭제하시겠습니까?`)) return;

    const idx = scrolls.indexOf(scroll);
    scrolls.splice(idx, 1);
    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      await commitScrolls(`Delete scroll: ${scroll.scroll_type} ${scroll.target_name}`);
      showMsg(msg, "삭제 완료.", "success");
      document.getElementById("sm-form").classList.add("hidden");
      refreshAfterDataChange();
      refreshSelect();
    } catch (e) {
      scrolls.splice(idx, 0, scroll);
      showMsg(msg, e.message, "error");
    }
  });
}

// ---------- 원재료 관리 ----------

function setupMaterialManage() {
  const list = document.getElementById("mm-list");

  function renderMmList() {
    list.innerHTML = materials.length
      ? "<ul>" + materials.map(m =>
          `<li>${m} <button type="button" class="mat-remove" data-name="${escapeAttr(m)}">삭제</button></li>`
        ).join("") + "</ul>"
      : "<p>없음</p>";

    list.querySelectorAll(".mat-remove").forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.name;
        const users = byMaterial[name] || [];
        let warnText = "";
        if (users.length) {
          warnText = `\n경고: 이 항목을 재료로 쓰는 완제품이 있습니다 -> ${users.map(u => u.name).join(", ")}`;
        }
        if (!confirm(`'${name}'을(를) 정말 삭제하시겠습니까?${warnText}`)) return;

        const idx = materials.indexOf(name);
        materials.splice(idx, 1);
        try {
          await commitMaterials(`Delete material: ${name}`);
          refreshAfterDataChange();
        } catch (e) {
          materials.splice(idx, 0, name);
          alert(e.message);
        }
      });
    });
  }

  window.addEventListener("makingdb:datachanged", renderMmList);
  renderMmList();

  document.getElementById("mm-add-btn").addEventListener("click", async () => {
    const msg = document.getElementById("mm-msg");
    const input = document.getElementById("mm-name");
    const name = input.value.trim();
    if (!name) { showMsg(msg, "이름을 입력해주세요.", "error"); return; }
    if (materials.includes(name)) { showMsg(msg, `'${name}'은(는) 이미 등록되어 있습니다.`, "error"); return; }

    materials.push(name);
    showMsg(msg, "GitHub에 커밋하는 중...", "");
    try {
      await commitMaterials(`Add material: ${name}`);
      showMsg(msg, `'${name}' 등록 완료.`, "success");
      input.value = "";
      refreshAfterDataChange();
    } catch (e) {
      materials.pop();
      showMsg(msg, e.message, "error");
    }
  });
}

// ---------- 초기화 ----------

async function init() {
  const status = document.getElementById("status");
  try {
    await loadData();
    setupTabs();
    setupFindProduct();
    setupFindMaterial();
    setupBreakdown();
    setupScrollCalc();
    setupLists();
    setupAutocomplete();
    setupEditTabs();
    setupGhSettings();
    setupRecipeAdd();
    setupRecipeManage();
    setupScrollAdd();
    setupScrollManage();
    setupMaterialManage();
    refreshEditDatalists();
    renderList();
    status.textContent = `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length}`;
  } catch (e) {
    status.textContent = `데이터 로드 실패: ${e.message}`;
  }
}

init();
