const SUPABASE_URL = "https://ytnbvlaryswpthwqqdkd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0bmJ2bGFyeXN3cHRod3FxZGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MjQxNzMsImV4cCI6MjA5OTQwMDE3M30.bHHCMasS5LMu_lcNw1noW_oyqFz__f-fZmS40-dPgYs";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_UID = "09cb6f2d-8ef1-4dad-9de1-0ac0230c116c";

let recipes = [];
let scrolls = [];
let materials = [];
let trades = [];
let purchases = [];
let byName = {};
let byMaterial = {};
let tradesByItem = {};
let tradesByRequired = {};
let purchasesByItem = {};

async function loadData() {
  const [rr, sr, mr, tr, pr] = await Promise.all([
    supabaseClient.from("recipes").select("*").order("name"),
    supabaseClient.from("scrolls").select("*").order("scroll_type"),
    supabaseClient.from("materials").select("*").order("name"),
    supabaseClient.from("trades").select("*").order("item_name"),
    supabaseClient.from("purchases").select("*").order("item_name"),
  ]);
  if (rr.error) throw rr.error;
  if (sr.error) throw sr.error;
  if (mr.error) throw mr.error;
  if (tr.error) throw tr.error;
  if (pr.error) throw pr.error;
  recipes = rr.data;
  scrolls = sr.data;
  materials = mr.data.map(m => m.name);
  trades = tr.data;
  purchases = pr.data;
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

  tradesByItem = {};
  tradesByRequired = {};
  for (const t of trades) {
    if (!tradesByItem[t.item_name]) tradesByItem[t.item_name] = [];
    tradesByItem[t.item_name].push(t);
    if (t.required_name) {
      if (!tradesByRequired[t.required_name]) tradesByRequired[t.required_name] = [];
      tradesByRequired[t.required_name].push(t);
    }
  }

  purchasesByItem = {};
  for (const p of purchases) {
    if (!purchasesByItem[p.item_name]) purchasesByItem[p.item_name] = [];
    purchasesByItem[p.item_name].push(p);
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

function renderProcessedRaw(processed, raw) {
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

  return `<h4>가공품</h4>${processedHtml}<h4>원재료</h4>${rawHtml}`;
}

function renderRequirements(name, qty, processed, raw, tree) {
  const treeHtml = tree.children.length
    ? `<div class="tree">${renderTree(tree)}</div>`
    : "<p>없음</p>";

  return `
    <p><strong>${name}</strong> ${qty}개 제작 시 필요</p>
    ${renderProcessedRaw(processed, raw)}
    <h4>제작 트리</h4>${treeHtml}`;
}

function mergeProcessed(target, source) {
  for (const [name, info] of Object.entries(source)) {
    if (!target[name]) target[name] = { qty: 0, crafts: 0, produced: 0 };
    target[name].qty += info.qty;
    target[name].crafts += info.crafts;
    target[name].produced += info.produced;
  }
}

function mergeRaw(target, source) {
  for (const [name, qty] of Object.entries(source)) {
    target[name] = (target[name] || 0) + qty;
  }
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
  const checklist = document.getElementById("sc-checklist");
  const btn = document.getElementById("sc-run");
  const result = document.getElementById("sc-result");

  function refreshTowns() {
    const towns = [...new Set(scrolls.map(s => s.town).filter(Boolean))].sort();
    townSelect.innerHTML =
      `<option value="">전체 마을</option>` +
      towns.map(t => `<option value="${escapeAttr(t)}">${t}</option>`).join("");
  }

  function refreshChecklist() {
    const town = townSelect.value;
    const filtered = town ? scrolls.filter(s => s.town === town) : scrolls;
    checklist.innerHTML = filtered
      .map(s => `
        <label class="scroll-check-row">
          <input type="checkbox" class="sc-check" data-id="${s.id}">
          <span class="scroll-check-label">[${s.scroll_type}] ${s.target_name} (${s.town || "미상"})</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="sc-check-qty" data-id="${s.id}" value="1">
        </label>`)
      .join("");
  }

  refreshTowns();
  refreshChecklist();
  townSelect.addEventListener("change", refreshChecklist);
  window.addEventListener("makingdb:datachanged", () => {
    refreshTowns();
    refreshChecklist();
  });

  document.getElementById("sc-select-all-btn").addEventListener("click", () => {
    checklist.querySelectorAll(".sc-check").forEach(cb => { cb.checked = true; });
  });
  document.getElementById("sc-select-none-btn").addEventListener("click", () => {
    checklist.querySelectorAll(".sc-check").forEach(cb => { cb.checked = false; });
  });

  btn.addEventListener("click", () => {
    const checked = [...checklist.querySelectorAll(".sc-check:checked")];
    if (checked.length === 0) {
      result.innerHTML = "<p>스크롤을 1개 이상 선택해주세요.</p>";
      return;
    }

    const combinedProcessed = {};
    const combinedRaw = {};
    const summaryLines = [];
    const detailSections = [];

    for (const cb of checked) {
      const scroll = scrolls.find(s => String(s.id) === cb.dataset.id);
      const qtyInput = checklist.querySelector(`.sc-check-qty[data-id="${cb.dataset.id}"]`);
      const n = parseInt(qtyInput.value, 10) || 1;
      const totalQty = scroll.qty_per_scroll * n;

      let tree;
      try {
        tree = breakdownTree(scroll.target_name, totalQty);
      } catch (e) {
        result.innerHTML = `<p>오류 ('${scroll.target_name}'): ${e.message}</p>`;
        return;
      }

      const { processed, raw } = summarizeRequirements(tree);
      mergeProcessed(combinedProcessed, processed);
      mergeRaw(combinedRaw, raw);

      summaryLines.push(`'${scroll.scroll_type} 스크롤: ${scroll.target_name}' ${n}장 -> ${totalQty}개`);
      detailSections.push(`
        <div class="card">
          <h4>${scroll.scroll_type} 스크롤: ${scroll.target_name} (${n}장 → ${totalQty}개)</h4>
          ${renderProcessedRaw(processed, raw)}
          ${tree.children.length ? `<div class="tree">${renderTree(tree)}</div>` : ""}
        </div>`);
    }

    result.innerHTML = `
      <p>선택한 ${checked.length}개 스크롤: ${summaryLines.join(" · ")}</p>
      <h3>합계</h3>
      ${renderProcessedRaw(combinedProcessed, combinedRaw)}
      <h3>스크롤별 상세</h3>
      ${detailSections.join("")}`;
  });
}

// ---------- 교환/구매 검색 ----------

function renderTradeCard(t) {
  const req = t.required_name ? `${t.required_name} x${t.required_qty ?? "?"}` : "정보 없음";
  return `<div class="card">
      <h3>${t.item_name} x${t.item_qty}</h3>
      <div class="tag">${t.town} · ${t.npc} · 필요: ${req}${t.limit_text ? ` · 제한: ${t.limit_text}` : ""}</div>
    </div>`;
}

// recipes에 등록된 이름이면 그 소분류를, 아니면 "기타"를 카테고리로 사용
function getItemCategory(name) {
  const r = byName[name];
  return (r && r.sub_category) || "기타";
}

function buildCombinedTradeItems() {
  const tradeItems = trades.map(t => ({
    kind: "교환",
    town: t.town,
    npc: t.npc,
    name: t.item_name,
    detail: `필요: ${t.required_name ? `${t.required_name} x${t.required_qty ?? "?"}` : "정보 없음"}${t.limit_text ? ` · ${t.limit_text}` : ""}`,
    category: getItemCategory(t.item_name),
  }));
  const purchaseItems = purchases.map(p => ({
    kind: "구매",
    town: p.town,
    npc: p.npc,
    name: p.item_name,
    detail: `가격: ${p.price_currency ? `${p.price_amount}${p.price_currency}` : "정보 없음"}${p.limit_text ? ` · ${p.limit_text}` : ""}`,
    category: getItemCategory(p.item_name),
  }));
  return [...tradeItems, ...purchaseItems];
}

function setupTradeSearch() {
  const itemInput = document.getElementById("ts-item-input");
  const townSelect = document.getElementById("ts-town-select");
  const categorySelect = document.getElementById("ts-category-select");
  const itemResult = document.getElementById("ts-item-result");
  const materialInput = document.getElementById("ts-material-input");
  const materialResult = document.getElementById("ts-material-result");

  function refreshFilterOptions() {
    const combined = buildCombinedTradeItems();
    const towns = [...new Set(combined.map(i => i.town).filter(Boolean))].sort();
    const categories = [...new Set(combined.map(i => i.category))].sort();
    townSelect.innerHTML =
      `<option value="">전체 마을</option>` + towns.map(t => `<option value="${escapeAttr(t)}">${t}</option>`).join("");
    categorySelect.innerHTML =
      `<option value="">전체 카테고리</option>` + categories.map(c => `<option value="${escapeAttr(c)}">${c}</option>`).join("");
  }

  function renderItemResults() {
    const search = itemInput.value.trim().toLowerCase();
    const town = townSelect.value;
    const category = categorySelect.value;

    const items = buildCombinedTradeItems().filter(i =>
      i.name.toLowerCase().includes(search) &&
      (!town || i.town === town) &&
      (!category || i.category === category)
    );

    itemResult.innerHTML = items.length
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>구분</th><th>마을</th><th>NPC</th><th>아이템</th><th>상세</th><th>카테고리</th></tr></thead>
          <tbody>${items.map(i => `<tr>
              <td>${i.kind}</td><td>${i.town}</td><td>${i.npc}</td><td>${i.name}</td><td>${i.detail}</td><td>${i.category}</td>
            </tr>`).join("")}</tbody>
        </table></div>`
      : "<p>조건에 맞는 아이템이 없습니다.</p>";
  }

  refreshFilterOptions();
  renderItemResults();
  itemInput.addEventListener("input", renderItemResults);
  townSelect.addEventListener("change", renderItemResults);
  categorySelect.addEventListener("change", renderItemResults);
  window.addEventListener("makingdb:datachanged", () => {
    refreshFilterOptions();
    renderItemResults();
  });

  materialInput.addEventListener("input", () => {
    const name = materialInput.value.trim();
    if (!name) { materialResult.innerHTML = ""; return; }

    const matches = tradesByRequired[name] || [];
    materialResult.innerHTML = matches.length
      ? matches.map(renderTradeCard).join("")
      : "<p>이 재료로 교환할 수 있는 아이템이 없습니다.</p>";
  });
}

function refreshTradeSearchDatalists() {
  const itemNames = [...new Set([...trades.map(t => t.item_name), ...purchases.map(p => p.item_name)])];
  document.getElementById("ts-item-datalist").innerHTML =
    itemNames.map(n => `<option value="${escapeAttr(n)}">`).join("");

  const materialNames = [...new Set(Object.keys(tradesByRequired))];
  document.getElementById("ts-material-datalist").innerHTML =
    materialNames.map(n => `<option value="${escapeAttr(n)}">`).join("");
}

// ---------- 5. 전체 목록 ----------

let currentList = "recipes";

// 열 헤더의 드롭다운으로 고르는 필터값 (탭별로 유지)
const listFilters = {
  recipes: { major_category: "", sub_category: "" },
  scrolls: { town: "", scroll_type: "" },
  trades: { town: "", npc: "" },
  purchases: { town: "", npc: "" },
};

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

// 열 헤더 안에 넣는 필터용 드롭다운. 선택하면 해당 열 값과 정확히 일치하는 행만 남긴다.
function headerFilterSelect(col, options, current) {
  const opts =
    `<option value="">전체</option>` +
    options.map(o => `<option value="${escapeAttr(o)}"${o === current ? " selected" : ""}>${escapeAttr(o)}</option>`).join("");
  return `<select class="th-filter" data-col="${col}">${opts}</select>`;
}

function bindHeaderFilters(container, filterState) {
  container.querySelectorAll(".th-filter").forEach(sel => {
    sel.addEventListener("change", () => {
      filterState[sel.dataset.col] = sel.value;
      renderList();
    });
  });
}

function renderList() {
  const search = document.getElementById("list-filter").value.trim().toLowerCase();
  const result = document.getElementById("list-result");

  if (currentList === "recipes") {
    const f = listFilters.recipes;
    const majors = [...new Set(recipes.map(r => r.major_category))];
    const subs = [...new Set(recipes.map(r => r.sub_category).filter(Boolean))];

    const items = recipes.filter(r =>
      r.name.toLowerCase().includes(search) &&
      (!f.major_category || r.major_category === f.major_category) &&
      (!f.sub_category || r.sub_category === f.sub_category)
    );

    const rowsHtml = items.length
      ? items.map(r => {
          const matText = r.materials.length ? r.materials.map(m => `${m.name} x${m.qty}`).join(", ") : "-";
          return `<tr>
              <td>${r.major_category}</td>
              <td>${r.sub_category || "-"}</td>
              <td>${r.name}</td>
              <td>${r.output_qty}개</td>
              <td>${matText}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5">없음</td></tr>`;

    result.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>대분류${headerFilterSelect("major_category", majors, f.major_category)}</th>
          <th>소분류${headerFilterSelect("sub_category", subs, f.sub_category)}</th>
          <th>이름</th>
          <th>산출</th>
          <th>재료</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    bindHeaderFilters(result, f);
  } else if (currentList === "scrolls") {
    const f = listFilters.scrolls;
    const towns = [...new Set(scrolls.map(s => s.town).filter(Boolean))].sort();
    const types = [...new Set(scrolls.map(s => s.scroll_type))];

    const items = scrolls.filter(s =>
      s.target_name.toLowerCase().includes(search) &&
      (!f.town || s.town === f.town) &&
      (!f.scroll_type || s.scroll_type === f.scroll_type)
    );

    const rowsHtml = items.length
      ? items.map(s => `<tr>
              <td>${s.town || "미상"}</td>
              <td>${s.scroll_type}</td>
              <td>${s.target_name}</td>
              <td>${s.qty_per_scroll}개</td>
            </tr>`).join("")
      : `<tr><td colspan="4">없음</td></tr>`;

    result.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>마을${headerFilterSelect("town", towns, f.town)}</th>
          <th>종류${headerFilterSelect("scroll_type", types, f.scroll_type)}</th>
          <th>대상 아이템</th>
          <th>1장당 수량</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    bindHeaderFilters(result, f);
  } else if (currentList === "materials") {
    const items = materials.filter(m => m.toLowerCase().includes(search));
    result.innerHTML = items.length
      ? "<ul>" + items.map(m => `<li>${m}</li>`).join("") + "</ul>"
      : "<p>없음</p>";
  } else if (currentList === "trades") {
    const f = listFilters.trades;
    const towns = [...new Set(trades.map(t => t.town).filter(Boolean))].sort();
    const npcs = [...new Set(trades.map(t => t.npc).filter(Boolean))].sort();

    const items = trades.filter(t =>
      t.item_name.toLowerCase().includes(search) &&
      (!f.town || t.town === f.town) &&
      (!f.npc || t.npc === f.npc)
    );

    const rowsHtml = items.length
      ? items.map(t => {
          const req = t.required_name ? `${t.required_name} x${t.required_qty ?? "?"}` : "-";
          return `<tr>
              <td>${t.town}</td>
              <td>${t.npc}</td>
              <td>${t.item_name} x${t.item_qty}</td>
              <td>${req}</td>
              <td>${t.limit_text || "-"}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5">없음</td></tr>`;

    result.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>마을${headerFilterSelect("town", towns, f.town)}</th>
          <th>NPC${headerFilterSelect("npc", npcs, f.npc)}</th>
          <th>얻는 아이템</th>
          <th>필요 재료</th>
          <th>제한</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    bindHeaderFilters(result, f);
  } else if (currentList === "purchases") {
    const f = listFilters.purchases;
    const towns = [...new Set(purchases.map(p => p.town).filter(Boolean))].sort();
    const npcs = [...new Set(purchases.map(p => p.npc).filter(Boolean))].sort();

    const items = purchases.filter(p =>
      p.item_name.toLowerCase().includes(search) &&
      (!f.town || p.town === f.town) &&
      (!f.npc || p.npc === f.npc)
    );

    const rowsHtml = items.length
      ? items.map(p => {
          const price = p.price_currency ? `${p.price_amount}${p.price_currency}` : "-";
          return `<tr>
              <td>${p.town}</td>
              <td>${p.npc}</td>
              <td>${p.item_name}</td>
              <td>${price}</td>
              <td>${p.limit_text || "-"}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5">없음</td></tr>`;

    result.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>마을${headerFilterSelect("town", towns, f.town)}</th>
          <th>NPC${headerFilterSelect("npc", npcs, f.npc)}</th>
          <th>물품</th>
          <th>가격</th>
          <th>제한</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    bindHeaderFilters(result, f);
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
  refreshTradeSearchDatalists();
  renderList();
  document.getElementById("status").textContent =
    `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length} · 교환 ${trades.length} · 구매 ${purchases.length}`;
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
    <input type="text" inputmode="numeric" pattern="[0-9]*" class="mat-qty" value="${qty}">
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
  const notAdmin = document.getElementById("edit-not-admin");
  const editLoggedOutMsg = document.getElementById("edit-loggedout-msg");
  const accountBody = document.getElementById("account-body");
  const editTabBtn = document.querySelector('.tab-btn[data-tab="edit"]');

  const isAdmin = !!session && session.user.id === ADMIN_UID;
  editTabBtn.classList.toggle("hidden", !isAdmin);
  if (!isAdmin && editTabBtn.classList.contains("active")) {
    editTabBtn.classList.remove("active");
    document.getElementById("edit").classList.remove("active");
    const firstBtn = document.querySelector(".tab-btn");
    firstBtn.classList.add("active");
    document.getElementById(firstBtn.dataset.tab).classList.add("active");
  }

  if (session) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    document.getElementById("auth-user").textContent = `로그인됨: ${session.user.email}`;
    editLoggedOutMsg.classList.add("hidden");
    accountBody.classList.remove("hidden");

    editBody.classList.toggle("hidden", !isAdmin);
    notAdmin.classList.toggle("hidden", isAdmin);
    refreshAccountData();
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
    editBody.classList.add("hidden");
    notAdmin.classList.add("hidden");
    editLoggedOutMsg.classList.remove("hidden");
    accountBody.classList.add("hidden");
    clearAccountData();
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

  document.getElementById("auth-signup-btn").addEventListener("click", async () => {
    const msg = document.getElementById("auth-msg");
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    if (!email || !password) { showMsg(msg, "이메일과 비밀번호를 입력해주세요.", "error"); return; }

    showMsg(msg, "가입 처리 중...", "");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      showMsg(msg, error.message, "error");
      return;
    }
    if (data.session) {
      document.getElementById("auth-password").value = "";
      showMsg(msg, "", "");
    } else {
      showMsg(msg, "가입 완료. 메일함에서 인증 링크를 눌러주세요.", "success");
    }
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
  const search = document.getElementById("mm-search");

  function renderMmList() {
    const query = search.value.trim().toLowerCase();
    const items = materials.filter(m => m.toLowerCase().includes(query));

    list.innerHTML = items.length
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>삭제</th><th>이름</th></tr></thead>
          <tbody>${items.map(m => `
            <tr>
              <td><button type="button" class="mat-remove" data-name="${escapeAttr(m)}">삭제</button></td>
              <td>${m}</td>
            </tr>`).join("")}</tbody>
        </table></div>`
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
  search.addEventListener("input", renderMmList);
  renderMmList();

  async function addMaterial() {
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
  }

  document.getElementById("mm-add-btn").addEventListener("click", addMaterial);
  document.getElementById("mm-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMaterial();
  });
}

// ---------- 계정: 캐릭터 / 가방 / 보관함 ----------

function setupItemTable({ inputId, qtyId, saveId, searchId, listId, table, extraFields, matchFields }) {
  const input = document.getElementById(inputId);
  const qtyInput = document.getElementById(qtyId);
  const saveBtn = document.getElementById(saveId);
  const search = document.getElementById(searchId);
  const list = document.getElementById(listId);
  let items = [];

  function render() {
    const query = search.value.trim().toLowerCase();
    const filtered = items.filter(it => it.item_name.toLowerCase().includes(query));

    list.innerHTML = filtered.length
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>삭제</th><th>이름</th><th>수량</th></tr></thead>
          <tbody>${filtered.map(it => `
            <tr>
              <td><button type="button" class="item-remove" data-id="${it.id}">삭제</button></td>
              <td class="item-name-cell" data-name="${escapeAttr(it.item_name)}" data-qty="${it.qty}">${it.item_name}</td>
              <td>${it.qty}</td>
            </tr>`).join("")}</tbody>
        </table></div>`
      : "<p>없음</p>";

    list.querySelectorAll(".item-remove").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("삭제하시겠습니까?")) return;
        const { error } = await supabaseClient.from(table).delete().eq("id", btn.dataset.id);
        if (error) { alert(friendlyError(error)); return; }
        await reload();
      });
    });

    list.querySelectorAll(".item-name-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        input.value = cell.dataset.name;
        qtyInput.value = cell.dataset.qty;
        input.focus();
      });
    });
  }

  async function reload() {
    const f = extraFields();
    if (!f) { items = []; render(); return; }
    let query = supabaseClient.from(table).select("*");
    for (const [k, v] of Object.entries(f)) query = query.eq(k, v);
    const { data, error } = await query;
    if (error) { console.error(error); items = []; render(); return; }
    items = data || [];
    render();
  }

  function clear() {
    items = [];
    render();
  }

  search.addEventListener("input", render);

  saveBtn.addEventListener("click", async () => {
    const f = extraFields();
    if (!f) return;
    const name = input.value.trim();
    const qty = parseInt(qtyInput.value, 10);
    if (!name) { alert("아이템 이름을 입력해주세요."); return; }
    if (!Number.isInteger(qty) || qty < 0) { alert("수량을 올바르게 입력해주세요."); return; }

    const { error } = await supabaseClient
      .from(table)
      .upsert({ ...f, item_name: name, qty }, { onConflict: matchFields.join(",") });
    if (error) { alert(friendlyError(error)); return; }
    input.value = "";
    qtyInput.value = "1";
    await reload();
  });

  return { reload, clear };
}

let characters = [];
let selectedCharacterId = null;
let bagTable, storageTable, acctTable;

async function loadCharacters() {
  const { data, error } = await supabaseClient
    .from("characters")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) { console.error(error); return; }
  characters = data || [];

  if (!characters.some(c => c.id === selectedCharacterId)) {
    selectedCharacterId = characters.length ? characters[0].id : null;
  }
  renderCharSelect();
}

function renderCharSelect() {
  const select = document.getElementById("char-select");
  select.innerHTML = characters.length
    ? characters.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
    : `<option value="">(캐릭터 없음)</option>`;
  select.value = selectedCharacterId || "";
  document.getElementById("char-inventory-section").classList.toggle("hidden", !selectedCharacterId);
  document.getElementById("char-delete-btn").disabled = !selectedCharacterId;
}

function setupAccountManage() {
  bagTable = setupItemTable({
    inputId: "bag-item-input", qtyId: "bag-item-qty", saveId: "bag-item-save-btn",
    searchId: "bag-search", listId: "bag-list",
    table: "character_items",
    extraFields: () => selectedCharacterId ? { character_id: selectedCharacterId, container: "bag" } : null,
    matchFields: ["character_id", "container", "item_name"],
  });

  storageTable = setupItemTable({
    inputId: "storage-item-input", qtyId: "storage-item-qty", saveId: "storage-item-save-btn",
    searchId: "storage-search", listId: "storage-list",
    table: "character_items",
    extraFields: () => selectedCharacterId ? { character_id: selectedCharacterId, container: "storage" } : null,
    matchFields: ["character_id", "container", "item_name"],
  });

  acctTable = setupItemTable({
    inputId: "acct-item-input", qtyId: "acct-item-qty", saveId: "acct-item-save-btn",
    searchId: "acct-search", listId: "acct-list",
    table: "account_storage",
    extraFields: () => currentSession ? { user_id: currentSession.user.id } : null,
    matchFields: ["user_id", "item_name"],
  });

  document.getElementById("char-select").addEventListener("change", async (e) => {
    selectedCharacterId = e.target.value ? Number(e.target.value) : null;
    renderCharSelect();
    await Promise.all([bagTable.reload(), storageTable.reload()]);
  });

  document.getElementById("char-add-btn").addEventListener("click", async () => {
    const msg = document.getElementById("char-msg");
    const nameInput = document.getElementById("char-new-name");
    const name = nameInput.value.trim();
    if (!name) { showMsg(msg, "캐릭터 이름을 입력해주세요.", "error"); return; }
    if (characters.length >= 6) { showMsg(msg, "캐릭터는 최대 6개까지 등록할 수 있습니다.", "error"); return; }
    if (characters.some(c => c.name === name)) { showMsg(msg, "이미 등록된 캐릭터 이름입니다.", "error"); return; }

    const { data, error } = await supabaseClient
      .from("characters")
      .insert({ user_id: currentSession.user.id, name, sort_order: characters.length })
      .select()
      .single();
    if (error) { showMsg(msg, friendlyError(error), "error"); return; }

    nameInput.value = "";
    showMsg(msg, "", "");
    selectedCharacterId = data.id;
    await loadCharacters();
    await Promise.all([bagTable.reload(), storageTable.reload()]);
  });

  document.getElementById("char-delete-btn").addEventListener("click", async () => {
    if (!selectedCharacterId) return;
    const char = characters.find(c => c.id === selectedCharacterId);
    if (!confirm(`'${char.name}' 캐릭터를 삭제하시겠습니까? 가방/보관함 데이터도 함께 삭제됩니다.`)) return;

    const { error } = await supabaseClient.from("characters").delete().eq("id", selectedCharacterId);
    if (error) { alert(friendlyError(error)); return; }

    selectedCharacterId = null;
    await loadCharacters();
    await Promise.all([bagTable.reload(), storageTable.reload()]);
  });
}

async function refreshAccountData() {
  if (!bagTable) return;
  await loadCharacters();
  await Promise.all([bagTable.reload(), storageTable.reload(), acctTable.reload()]);
}

function clearAccountData() {
  if (!bagTable) return;
  characters = [];
  selectedCharacterId = null;
  renderCharSelect();
  bagTable.clear();
  storageTable.clear();
  acctTable.clear();
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
    setupTradeSearch();
    setupLists();
    setupAutocomplete();
    setupAuth();
    setupEditTabs();
    setupRecipeAdd();
    setupRecipeManage();
    setupScrollAdd();
    setupScrollManage();
    setupMaterialManage();
    setupAccountManage();
    refreshEditDatalists();
    refreshTradeSearchDatalists();
    renderList();
    status.textContent =
      `제작법 ${recipes.length} · 스크롤 ${scrolls.length} · 원재료 ${materials.length} · 교환 ${trades.length} · 구매 ${purchases.length}`;

    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session);
  } catch (e) {
    status.textContent = `데이터 로드 실패: ${e.message}`;
  }
}

init();
