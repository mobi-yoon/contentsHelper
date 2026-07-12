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
    renderList();
    status.textContent = `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length}`;
  } catch (e) {
    status.textContent = `데이터 로드 실패: ${e.message}`;
  }
}

init();
