const SUPABASE_URL = "https://ytnbvlaryswpthwqqdkd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0bmJ2bGFyeXN3cHRod3FxZGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MjQxNzMsImV4cCI6MjA5OTQwMDE3M30.bHHCMasS5LMu_lcNw1noW_oyqFz__f-fZmS40-dPgYs";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let recipes = [];
let scrolls = [];
let materials = [];
let byName = {};
let byMaterial = {};

async function loadData() {
  const [rr, sr, mr] = await Promise.all([
    supabaseClient.from("recipes").select("*").order("name"),
    supabaseClient.from("scrolls").select("*").order("scroll_type"),
    supabaseClient.from("materials").select("*").order("name"),
  ]);
  if (rr.error) throw rr.error;
  if (sr.error) throw sr.error;
  if (mr.error) throw mr.error;
  recipes = rr.data;
  scrolls = sr.data;
  materials = mr.data.map(m => m.name);
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
    result.innerHTML = renderRequirements(name, qty, processed, raw, tree);
  });
}

function renderRequirements(name, qty, processed, raw, tree) {
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

  const treeHtml = tree.children.length
    ? `<div class="tree">${renderTree(tree)}</div>`
    : "<p>없음</p>";

  return `
    <p><strong>${name}</strong> ${qty}개 제작 시 필요</p>
    <h4>가공품</h4>${processedHtml}
    <h4>원재료</h4>${rawHtml}
    <h4>제작 트리</h4>${treeHtml}`;
}

// 어떤 재료가 무엇을 만드는 데 쓰이는지 계층으로 보여주는 트리 (루트 자신은 표시하지 않음)
function renderTree(tree) {
  return tree.children.map(child => renderTreeNode(child, 0)).join("");
}

function renderTreeNode(node, depth) {
  const overage = !node.isRaw && node.produced !== node.qty ? ` → ${node.produced}개 생산` : "";
  const craftsInfo = node.isRaw ? "" : ` (제작 ${node.crafts}회${overage})`;
  const marker = node.isRaw ? "·" : "▸";
  const row = `<div class="tree-row" style="padding-left:${depth * 1.1}rem">${marker} ${node.name} x${node.qty}${craftsInfo}</div>`;
  const childrenHtml = node.children.map(child => renderTreeNode(child, depth + 1)).join("");
  return row + childrenHtml;
}

// ---------- 4. 스크롤 계산 ----------

function setupScrollCalc() {
  const townSelect = document.getElementById("sc-town-select");
  const select = document.getElementById("sc-select");
  const qtyInput = document.getElementById("sc-qty");
  const btn = document.getElementById("sc-run");
  const result = document.getElementById("sc-result");

  function refreshTowns() {
    const towns = [...new Set(scrolls.map(s => s.town).filter(Boolean))].sort();
    townSelect.innerHTML =
      `<option value="">전체 마을</option>` +
      towns.map(t => `<option value="${escapeAttr(t)}">${t}</option>`).join("");
  }

  function refreshScrollOptions() {
    const town = townSelect.value;
    const filtered = town ? scrolls.filter(s => s.town === town) : scrolls;
    select.innerHTML = filtered
      .map(s => `<option value="${s.id}">[${s.scroll_type}] ${s.target_name} (${s.town || "미상"})</option>`)
      .join("");
  }

  refreshTowns();
  refreshScrollOptions();
  townSelect.addEventListener("change", refreshScrollOptions);
  window.addEventListener("makingdb:datachanged", () => {
    refreshTowns();
    refreshScrollOptions();
  });

  btn.addEventListener("click", () => {
    const scroll = scrolls.find(s => String(s.id) === select.value);
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
    result.innerHTML = header + renderRequirements(scroll.target_name, totalQty, processed, raw, tree).replace(/<p><strong>.*?<\/p>/, "");
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
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>대분류</th><th>소분류</th><th>이름 (산출)</th><th>재료</th></tr></thead>
          <tbody>${items.map(r => {
            const matText = r.materials.length
              ? r.materials.map(m => `${m.name} x${m.qty}`).join(", ")
              : "-";
            return `<tr>
                <td>${r.major_category}</td>
                <td>${r.sub_category || "-"}</td>
                <td>${r.name} (${r.output_qty}개)</td>
                <td>${matText}</td>
              </tr>`;
          }).join("")}</tbody>
        </table></div>`
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

const DEFAULT_SCROLL_TYPES = ["채집", "채광", "제작", "요리"];

function recipeExists(name) {
  return name in byName;
}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = "result" + (kind ? ` ${kind}` : "");
}

function friendlyError(error) {
  if (error.code === "23505") return "이미 존재하는 이름입니다.";
  if (error.code === "42501") return "권한이 없습니다. 로그인 상태를 확인해주세요.";
  return error.message || String(error);
}

async function refreshAfterDataChange() {
  await loadData();
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

// 새로운 원재료 이름이 섞여 있으면 사용자 확인 후 등록할 이름 목록을 반환.
// 반환값: 등록할 이름 배열(없으면 빈 배열), 사용자가 취소하면 null.
function confirmNewMaterials(materialRows) {
  const unknown = [...new Set(
    materialRows.map(m => m.name).filter(n => !(n in byName) && !materials.includes(n))
  )];
  if (unknown.length === 0) return [];
  const ok = confirm(
    `다음 재료는 처음 보는 이름입니다. 새 원재료로 등록할까요?\n\n${unknown.join(", ")}`
  );
  return ok ? unknown : null;
}

// ---------- 로그인 ----------

let currentSession = null;

function updateAuthUI(session) {
  currentSession = session;
  const loggedOut = document.getElementById("auth-loggedout");
  const loggedIn = document.getElementById("auth-loggedin");
  const editBody = document.getElementById("edit-body");

  if (session) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    editBody.classList.remove("hidden");
    document.getElementById("auth-user").textContent = `로그인됨: ${session.user.email}`;
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
    editBody.classList.add("hidden");
  }
}

function setupAuth() {
  document.getElementById("auth-login-btn").addEventListener("click", async () => {
    const msg = document.getElementById("auth-msg");
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    if (!email || !password) { showMsg(msg, "이메일과 비밀번호를 입력해주세요.", "error"); return; }

    showMsg(msg, "로그인 중...", "");
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showMsg(msg, error.message, "error");
      return;
    }
    document.getElementById("auth-password").value = "";
    showMsg(msg, "", "");
  });

  document.getElementById("auth-logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => updateAuthUI(session));
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
    const newMaterials = confirmNewMaterials(materialRows);
    if (newMaterials === null) { showMsg(msg, "취소했습니다.", ""); return; }

    showMsg(msg, "저장 중...", "");
    try {
      if (newMaterials.length) {
        const { error } = await supabaseClient.from("materials").insert(newMaterials.map(n => ({ name: n })));
        if (error) throw error;
      }
      const { error } = await supabaseClient.from("recipes").insert({
        major_category: major, sub_category: sub, name, output_qty: output, materials: materialRows,
      });
      if (error) throw error;

      // 원재료로 먼저 등록돼 있던 이름에 제작법이 생기면 원재료 목록에서는 뺀다
      if (materials.includes(name)) {
        const { error: cleanupError } = await supabaseClient.from("materials").delete().eq("name", name);
        if (cleanupError) throw cleanupError;
      }

      showMsg(msg, `'${name}' 등록 완료.`, "success");
      document.getElementById("ra-name").value = "";
      document.getElementById("ra-sub").value = "";
      document.getElementById("ra-output").value = "1";
      materialsBox.innerHTML = "";
      addMaterialRow(materialsBox);
      await refreshAfterDataChange();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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
    const newMaterials = confirmNewMaterials(materialRows);
    if (newMaterials === null) { showMsg(msg, "취소했습니다.", ""); return; }

    showMsg(msg, "저장 중...", "");
    try {
      if (newMaterials.length) {
        const { error } = await supabaseClient.from("materials").insert(newMaterials.map(n => ({ name: n })));
        if (error) throw error;
      }
      const { error } = await supabaseClient.from("recipes").update({
        major_category: document.getElementById("rm-major").value,
        sub_category: document.getElementById("rm-sub").value.trim(),
        output_qty: parseInt(document.getElementById("rm-output").value, 10) || 1,
        materials: materialRows,
      }).eq("id", rmCurrentRecipe.id);
      if (error) throw error;

      showMsg(msg, `'${rmCurrentRecipe.name}' 수정 완료.`, "success");
      await refreshAfterDataChange();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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

    showMsg(msg, "삭제 중...", "");
    try {
      const { error } = await supabaseClient.from("recipes").delete().eq("id", rmCurrentRecipe.id);
      if (error) throw error;

      showMsg(msg, "삭제 완료.", "success");
      document.getElementById("rm-form").classList.add("hidden");
      document.getElementById("rm-select").value = "";
      rmCurrentRecipe = null;
      await refreshAfterDataChange();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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

    showMsg(msg, "저장 중...", "");
    try {
      if (registerMaterial) {
        const { error } = await supabaseClient.from("materials").insert({ name: targetName });
        if (error) throw error;
      }
      const { error } = await supabaseClient.from("scrolls").insert({
        scroll_type: scrollType, town, target_name: targetName, qty_per_scroll: qty,
      });
      if (error) throw error;

      showMsg(msg, `'${scrollType} 스크롤: ${targetName}' (${town}) 등록 완료.`, "success");
      document.getElementById("sa-target").value = "";
      document.getElementById("sa-qty").value = "1";
      await refreshAfterDataChange();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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

    showMsg(msg, "저장 중...", "");
    try {
      const { error } = await supabaseClient.from("scrolls").update({
        town: document.getElementById("sm-town").value.trim(),
        qty_per_scroll: parseInt(document.getElementById("sm-qty").value, 10) || 1,
      }).eq("id", scroll.id);
      if (error) throw error;

      showMsg(msg, "수정 완료.", "success");
      await refreshAfterDataChange();
      refreshSelect();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
    }
  });

  document.getElementById("sm-delete-btn").addEventListener("click", async () => {
    const msg = document.getElementById("sm-msg");
    const scroll = scrolls[select.value];
    if (!scroll) return;
    if (!confirm(`[${scroll.scroll_type} 스크롤] ${scroll.target_name}을(를) 정말 삭제하시겠습니까?`)) return;

    showMsg(msg, "삭제 중...", "");
    try {
      const { error } = await supabaseClient.from("scrolls").delete().eq("id", scroll.id);
      if (error) throw error;

      showMsg(msg, "삭제 완료.", "success");
      document.getElementById("sm-form").classList.add("hidden");
      await refreshAfterDataChange();
      refreshSelect();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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

        try {
          const { error } = await supabaseClient.from("materials").delete().eq("name", name);
          if (error) throw error;
          await refreshAfterDataChange();
        } catch (e) {
          alert(friendlyError(e));
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

    showMsg(msg, "저장 중...", "");
    try {
      const { error } = await supabaseClient.from("materials").insert({ name });
      if (error) throw error;
      showMsg(msg, `'${name}' 등록 완료.`, "success");
      input.value = "";
      await refreshAfterDataChange();
    } catch (e) {
      showMsg(msg, friendlyError(e), "error");
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
    setupAuth();
    setupEditTabs();
    setupRecipeAdd();
    setupRecipeManage();
    setupScrollAdd();
    setupScrollManage();
    setupMaterialManage();
    refreshEditDatalists();
    renderList();
    status.textContent = `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length}`;

    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session);
  } catch (e) {
    status.textContent = `데이터 로드 실패: ${e.message}`;
  }
}

init();
