// =====================================================================
// app.js : 앱의 "동작" (버튼을 누르면 무슨 일이 일어나는지)
// ---------------------------------------------------------------------
// 크게 6부분으로 나뉘어 있어요. 고치고 싶은 부분을 찾아가세요.
//   1. 작은 도우미 함수들 (숫자 모양, 날짜 계산)
//   2. 저장 (폰 안에 기록을 저장하고 불러오기)
//   3. 음식 찾기 (foods.js 목록 + 내가 등록한 음식에서 검색)
//   4. 메인 화면 그리기 (열량, 부족한 것, 충족도, 끼니별 기록)
//   5. 아래에서 올라오는 창 (음식 고르기 → 양 입력 → 기록, 내 기준 설정)
//   6. 앱 시작 + 홈 화면 설치
// =====================================================================

// ---------------------------------------------------------------------
// 1. 작은 도우미 함수들
// ---------------------------------------------------------------------
const MEALS = [
  { key: "breakfast", label: "아침" },
  { key: "lunch",     label: "점심" },
  { key: "dinner",    label: "저녁" },
  { key: "snack",     label: "간식" },
];
const $ = (id) => document.getElementById(id);                 // id로 화면의 칸 찾기
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => Math.round(n * 10) / 10;                      // 소수점 한 자리
const fmtInt = (n) => Math.round(n).toLocaleString("ko-KR");    // 1234 → "1,234"
const fmtNum = (n) => (Math.abs(n) >= 100 ? Math.round(n) : r1(n)).toLocaleString("ko-KR");
const fmtBy = (n, unit) => (unit === "g" ? fmtNum(n) : fmtInt(n));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // 날짜 → "2026-11-01"
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const mealLabel = (k) => MEALS.find((m) => m.key === k)?.label || "";

// 100g당 값 × 먹은 g ÷ 100 = 실제로 먹은 양  ← 이 앱의 핵심 계산!
const amountOf = (per100, grams, key) => ((Number(per100?.[key]) || 0) * (Number(grams) || 0)) / 100;

// 기록에 보여줄 양: "2개 · 100g"처럼 단위로 딱 떨어지면 단위도 함께
function amountLabel(e) {
  const u = e.unit;
  if (u && u.name !== "g") {
    const count = e.grams / u.g;
    if (Math.abs(count * 2 - Math.round(count * 2)) < 0.01) return `${r1(count)}${u.name} · ${fmtNum(e.grams)}g`;
  }
  return `${fmtNum(e.grams)}g`;
}

// 지금 시각으로 어느 끼니인지 짐작하기
function guessMeal() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 4 && h < 10.5) return "breakfast";
  if (h >= 10.5 && h < 15) return "lunch";
  if (h >= 17 && h < 21.5) return "dinner";
  return "snack";
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// ---------------------------------------------------------------------
// 2. 저장 : 폰 브라우저 안의 작은 저장 공간(localStorage)에 글자로 저장해요.
//    인터넷이 없어도 되고, 내 폰 밖으로 나가지 않아요.
//    저장 모양:
//    { profile: {내 정보}, entries: {기록id: {date, meal, name, grams, per100}}, customFoods: [...], recent: [...] }
// ---------------------------------------------------------------------
const STORE_KEY = "kkini-note.v2";
let data = null;

function loadData() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch {}
  data = {
    profile: { ...DEFAULT_PROFILE, ...(saved?.profile || {}) },
    entries: saved?.entries || {},
    customFoods: saved?.customFoods || [],
    recent: saved?.recent || [],
    profileSet: !!saved?.profileSet,   // 내 정보를 한 번이라도 저장했는지
  };
}
function saveData() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch { toast("폰에 저장하지 못했어요. 저장 공간을 확인해 주세요."); }
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------------
// 3. 음식 찾기
// ---------------------------------------------------------------------
// foods.js의 한 줄 [이름, 분류, 열량, ...]을 다루기 쉬운 모양 {name, per100: {...}}으로 바꿔요
const BUILTIN_FOODS = FOOD_ROWS.map((r) => ({
  id: "b:" + r[0], name: r[0], cat: r[1],
  per100: { kcal: r[2], carbs: r[3], protein: r[4], fat: r[5], sugar: r[6], fiber: r[7], sodium: r[8] },
  unit: { name: r[9], g: r[10] },
  alias: r[11] || "",
}));
const allFoods = () => [...data.customFoods.map((f) => ({ ...f, cat: "내가 등록한 음식", custom: true })), ...BUILTIN_FOODS];
const findFood = (id) => allFoods().find((f) => f.id === id);
const foodByName = (name) => BUILTIN_FOODS.find((f) => f.name === name);

// 초성 검색: "ㄷㄱㅅ"으로 "닭가슴살" 찾기
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s) => [...s].map((c) => { const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join("");
const squash = (s) => s.toLowerCase().replace(/\s+/g, "");

function searchFoods(query) {
  const q = squash(query);
  if (!q) return [];
  const onlyCho = /^[ㄱ-ㅎ]+$/.test(q);
  return allFoods()
    .filter((f) => { const hay = squash(f.name + " " + f.alias); return onlyCho ? chosung(hay).includes(q) : hay.includes(q); })
    .sort((a, b) => (squash(b.name).startsWith(q) ? 1 : 0) - (squash(a.name).startsWith(q) ? 1 : 0))
    .slice(0, 40);
}

// ---------------------------------------------------------------------
// 4. 메인 화면 그리기
// ---------------------------------------------------------------------
const state = { date: ymd(new Date()) };

function entriesOf(date) {
  return Object.entries(data.entries)
    .filter(([, e]) => e.date === date)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
function totalsOf(list) {
  const t = {};
  for (const n of NUTRIENTS) t[n.key] = list.reduce((sum, e) => sum + amountOf(e.per100, e.grams, n.key), 0);
  return t;
}

// 영양소 하나가 지금 "부족 / 충족 / 초과" 중 어디인지 판단
function statusOf(n, eaten, goal) {
  const pct = goal ? eaten / goal : 0;
  if (n.kind === "limit") {
    return eaten > goal
      ? { s: "over", tag: "초과", text: `${fmtBy(eaten - goal, n.unit)}${n.unit} 초과` }
      : { s: "ok", tag: "괜찮음", text: `${fmtBy(goal - eaten, n.unit)}${n.unit} 여유` };
  }
  // 열량·탄수화물·지방은 너무 많이 먹어도 알려줘요 (단백질·식이섬유는 넘쳐도 괜찮음)
  if (pct > 1.1 && ["kcal", "carbs", "fat"].includes(n.key)) return { s: "over", tag: "초과", text: `${fmtBy(eaten - goal, n.unit)}${n.unit} 초과` };
  if (pct >= 0.9) return { s: "ok", tag: "충족", text: "충족" };
  return { s: "low", tag: "부족", text: `${fmtBy(goal - eaten, n.unit)}${n.unit} 부족` };
}

// 부족한 양을 채우려면 추천 음식을 얼마나 먹으면 되는지
function suggestionText(key, missing) {
  const picks = (SUGGEST[key] || []).map(foodByName).filter(Boolean);
  const parts = [];
  for (const f of picks) {
    const per = f.per100[key];
    if (!per) continue;
    const grams = (missing / per) * 100;
    let howMuch = `${fmtInt(grams)}g`;
    if (f.unit.name !== "g") {
      const count = Math.max(0.5, Math.round((grams / f.unit.g) * 2) / 2);  // 0.5 단위로
      if (count > 4) continue;                        // 4개 넘게 먹어야 하면 추천 안 함
      howMuch = `${count}${f.unit.name}(${fmtInt(grams)}g)`;
    }
    if (grams > 600) continue;                        // 너무 많이 먹어야 하면 추천 안 함
    parts.push(`${f.name} ${howMuch}`);
    if (parts.length === 2) break;
  }
  if (parts.length) return `${parts.join(" 또는 ")}이면 채워져요.`;
  // 한 가지로 다 채우기 어려우면, 한 번 먹을 때 얼마나 채워지는지 알려줘요
  const f = picks[0];
  if (!f) return "";
  const unit = NUTRIENTS.find((n) => n.key === key).unit;
  return `${f.name} 1${f.unit.name}에 ${fmtNum(amountOf(f.per100, f.unit.g, key))}${unit}이 들어 있어요. 여러 가지를 나눠 먹어 보세요.`;
}

const TIPS = {
  sodium: "국·찌개 국물을 남기고, 김치·가공식품을 줄이면 도움이 돼요.",
  sugar: "단 음료와 과자를 줄여 보세요.",
  kcal: "남은 끼니는 가볍게 먹는 게 좋아요.",
  fat: "튀김·삼겹살 같은 기름진 음식은 다음 끼니에 줄여 보세요.",
  carbs: "다음 끼니는 밥이나 면 양을 조금 줄여 보세요.",
};

function render() {
  const goal = calcTargets(data.profile);
  const today = ymd(new Date());
  const d = parseYmd(state.date);
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
  $("dateLabel").textContent = state.date === today ? `오늘 · ${label}` : label;
  $("todayBtn").hidden = state.date === today;

  const list = entriesOf(state.date);
  const eaten = totalsOf(list);

  // (1) 열량 계기판
  $("totalKcal").innerHTML = `${fmtInt(eaten.kcal)}<small>kcal</small>`;
  $("kcalGoal").innerHTML = `목표 <b>${fmtInt(goal.kcal)}</b> kcal<br>${GOALS[data.profile.goal].label} 기준`;
  const pct = Math.min(100, (eaten.kcal / goal.kcal) * 100);
  $("meter").querySelector("i").style.width = pct + "%";
  $("meter").classList.toggle("over", eaten.kcal > goal.kcal * 1.1);
  const left = goal.kcal - eaten.kcal;
  $("remain").textContent = left >= 0 ? `앞으로 ${fmtInt(left)} kcal 더 먹을 수 있어요.` : `목표보다 ${fmtInt(-left)} kcal 더 먹었어요.`;

  // (2) 오늘 부족한 것: 부족한 영양소를 덜 채운 순서대로, 넘친 것은 경고로
  const rows = NUTRIENTS.map((n) => ({ n, eaten: eaten[n.key], goal: goal[n.key], st: statusOf(n, eaten[n.key], goal[n.key]) }));
  const lows = rows.filter((r) => r.st.s === "low" && r.n.key !== "kcal").sort((a, b) => a.eaten / a.goal - b.eaten / b.goal);
  const overs = rows.filter((r) => r.st.s === "over");
  let needsHtml = "";
  for (const r of overs) {
    needsHtml += `<div class="need over"><b>${r.n.label} ${r.st.text}</b><span>${TIPS[r.n.key] || ""}</span></div>`;
  }
  for (const r of lows.slice(0, 3)) {
    const missing = r.goal - r.eaten;
    needsHtml += `<div class="need"><b>${r.n.label} ${r.st.text}</b><span class="num">${fmtBy(r.eaten, r.n.unit)} / ${fmtBy(r.goal, r.n.unit)}${r.n.unit} (${Math.round((r.eaten / r.goal) * 100)}%)</span><span>${suggestionText(r.n.key, missing)}</span></div>`;
  }
  if (!list.length) {
    needsHtml = `<p class="hint">${state.date === today ? "아직 오늘 기록이 없어요." : "이날은 기록이 없어요."} 먹은 것을 적으면 무엇이 부족한지 바로 알려드려요.<br>오늘 목표: 단백질 ${goal.protein}g · 탄수화물 ${goal.carbs}g · 지방 ${goal.fat}g · 식이섬유 ${goal.fiber}g</p>`;
  } else if (!needsHtml) {
    needsHtml = `<div class="need good"><b>모든 영양소를 채웠어요</b><span>오늘 식단 잘 챙겼어요.</span></div>`;
  }
  $("needs").innerHTML = needsHtml;

  // (3) 영양소 충족도 막대
  $("factRows").innerHTML = rows.map((r) => `
    <div class="factrow ${r.st.s}">
      <span class="nm">${r.n.label}</span>
      <span class="bar"><i style="width:${Math.min(100, (r.eaten / r.goal) * 100)}%"></i></span>
      <span class="val">${fmtBy(r.eaten, r.n.unit)}<small>/${fmtBy(r.goal, r.n.unit)}${r.n.unit}</small><span class="chip-s ${r.st.s}">${r.n.kind === "limit" ? (r.st.s === "over" ? "초과" : "상한") : r.st.tag}</span></span>
    </div>`).join("");
  const p = data.profile;
  $("basis").innerHTML = `만 ${p.age}세 ${p.sex === "f" ? "여성" : "남성"} · ${p.height}cm · ${p.weight ? p.weight + "kg" : `몸무게 미입력(${guessWeight(p)}kg로 계산 중)`} · ${ACTIVITY.find((a) => a.value === p.activity)?.label || ""} 기준. <button class="linkbtn" data-open-settings>기준 바꾸기</button>`;

  // (4) 끼니별 기록
  $("meals").innerHTML = MEALS.map((m) => {
    const items = list.filter((e) => e.meal === m.key);
    const sub = items.reduce((s, e) => s + amountOf(e.per100, e.grams, "kcal"), 0);
    return `<section class="meal" style="margin-bottom:12px">
      <div class="mealhead">
        <div><h2>${m.label}</h2><span class="sub num">${items.length ? fmtInt(sub) + " kcal" : ""}</span></div>
        <button class="addmini" data-add="${m.key}">+ ${m.label}</button>
      </div>
      ${items.length ? `<ul class="items">${items.map((e) => `
        <li class="item">
          <button class="open" data-edit="${esc(e.id)}"><b>${esc(e.name)}</b><span class="num">${amountLabel(e)} · 단백질 ${fmtNum(amountOf(e.per100, e.grams, "protein"))}g</span></button>
          <div class="kc">${fmtInt(amountOf(e.per100, e.grams, "kcal"))}<small> kcal</small></div>
          <button class="del" data-del="${esc(e.id)}" aria-label="${esc(e.name)} 지우기">×</button>
        </li>`).join("")}</ul>` : `<p class="empty">아직 기록이 없어요.</p>`}
    </section>`;
  }).join("");
}

// 메인 화면 버튼들
$("prevDay").onclick = () => moveDay(-1);
$("nextDay").onclick = () => moveDay(1);
$("todayBtn").onclick = () => { state.date = ymd(new Date()); render(); };
function moveDay(n) { const d = parseYmd(state.date); d.setDate(d.getDate() + n); state.date = ymd(d); render(); }
$("fab").onclick = () => openSheet({ step: "search", meal: guessMeal() });
$("settingsBtn").onclick = () => openSheet({ step: "settings" });
document.addEventListener("click", (ev) => {
  if (ev.target.closest("[data-open-settings]")) openSheet({ step: "settings" });
});
$("meals").addEventListener("click", (ev) => {
  const add = ev.target.closest("[data-add]");
  if (add) return openSheet({ step: "search", meal: add.dataset.add });
  const edit = ev.target.closest("[data-edit]");
  if (edit) {
    const e = data.entries[edit.dataset.edit];
    if (!e) return;
    const food = { id: e.foodId, name: e.name, per100: e.per100, unit: e.unit || { name: "g", g: 100 } };
    const useUnit = food.unit.name !== "g" && Number.isInteger((e.grams / food.unit.g) * 2);
    return openSheet({ step: "amount", meal: e.meal, food, editId: edit.dataset.edit, mode: useUnit ? "unit" : "g", qty: String(useUnit ? r1(e.grams / food.unit.g) : e.grams) });
  }
  const del = ev.target.closest("[data-del]");
  if (del) {
    // 실수로 지우지 않게 한 번 더 눌러야 지워져요
    if (!del.classList.contains("armed")) {
      del.classList.add("armed"); del.textContent = "지우기";
      setTimeout(() => { if (del.isConnected) { del.classList.remove("armed"); del.textContent = "×"; } }, 3000);
      return;
    }
    delete data.entries[del.dataset.del];
    saveData(); render(); toast("지웠어요.");
  }
});

// ---------------------------------------------------------------------
// 5. 아래에서 올라오는 창(시트)
//    step: "search"(음식 고르기) → "amount"(양 입력) / "custom"(음식 등록) / "settings"(내 기준)
// ---------------------------------------------------------------------
let sh = {};

function openSheet(opts) {
  sh = { step: "search", meal: guessMeal(), query: "", food: null, mode: "unit", qty: "1", editId: null, error: "", ...opts };
  $("scrim").hidden = false;
  document.body.classList.add("locked");
  renderSheet();
  if (sh.step === "search") setTimeout(() => $("searchQ")?.focus(), 50);
}
function closeSheet() { $("scrim").hidden = true; document.body.classList.remove("locked"); }
$("scrim").addEventListener("click", (ev) => { if (ev.target === $("scrim")) closeSheet(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("scrim").hidden) closeSheet(); });

function sheetHead(title) {
  return `<div class="sheethead"><h3 id="sheetTitle">${title}</h3><button class="iconbtn" data-act="close" aria-label="닫기">×</button></div>`;
}
function mealChips() {
  return `<div class="chips" role="group" aria-label="끼니">${MEALS.map((m) => `<button class="chip" data-meal="${m.key}" aria-pressed="${sh.meal === m.key}">${m.label}</button>`).join("")}</div>`;
}
function foodButton(f) {
  return `<button class="food" data-food="${esc(f.id)}"><b>${esc(f.name)}</b><span>${fmtInt(f.per100.kcal)}kcal·단${fmtNum(f.per100.protein)}g /100g</span></button>`;
}

function renderSheet() {
  const s = $("sheet");
  if (sh.step === "search") s.innerHTML = sheetHead(`${mealLabel(sh.meal)}에 먹은 것`) + mealChips() + searchView();
  else if (sh.step === "amount") s.innerHTML = sheetHead(sh.editId ? "기록 고치기" : `${mealLabel(sh.meal)}에 기록`) + (sh.editId ? mealChips() : "") + amountView();
  else if (sh.step === "custom") s.innerHTML = sheetHead("목록에 없는 음식 등록") + customView();
  else if (sh.step === "settings") s.innerHTML = sheetHead("내 기준") + settingsView();
  if (sh.step === "amount") updateCalc();
  if (sh.step === "settings") updateSettingsPreview();
}

// --- 5-1. 음식 고르기 ---
function searchView() {
  return `<input class="search" id="searchQ" type="search" placeholder="음식 이름 (예: 닭가슴살, ㄷㄱㅅ)" value="${esc(sh.query)}" aria-label="음식 이름 검색" autocomplete="off">
    <div id="results">${resultsHtml()}</div>
    <button class="linkbtn" data-act="custom">+ 목록에 없는 음식 직접 등록하기</button>`;
}
function resultsHtml() {
  if (sh.query.trim()) {
    const found = searchFoods(sh.query);
    return found.length
      ? `<div class="foodlist">${found.map(foodButton).join("")}</div>`
      : `<p class="hint">"${esc(sh.query)}"에 맞는 음식이 없어요. 아래에서 직접 등록할 수 있어요.</p>`;
  }
  // 검색어가 없으면: 최근 먹은 음식 + 분류별 전체 목록
  const recent = data.recent.map(findFood).filter(Boolean).slice(0, 8);
  let html = recent.length ? `<p class="grouplabel">최근 먹은 음식</p><div class="foodlist">${recent.map(foodButton).join("")}</div>` : "";
  const cats = [...new Set(allFoods().map((f) => f.cat))];
  for (const c of cats) html += `<p class="grouplabel">${esc(c)}</p><div class="foodlist">${allFoods().filter((f) => f.cat === c).map(foodButton).join("")}</div>`;
  return html;
}

// --- 5-2. 양 입력 ---
function gramsNow() {
  const q = Number(sh.qty) || 0;
  return sh.mode === "unit" ? q * sh.food.unit.g : q;
}
function amountView() {
  const f = sh.food;
  const hasUnit = f.unit && f.unit.name !== "g";
  const quick = sh.mode === "unit" ? [0.5, 1, 1.5, 2, 3] : [50, 100, 150, 200, 300];
  return `<div class="panel">
    <p class="foodtitle">${esc(f.name)}</p>
    <p class="per100">100g당 ${fmtInt(f.per100.kcal)}kcal · 탄 ${fmtNum(f.per100.carbs)}g · 단 ${fmtNum(f.per100.protein)}g · 지 ${fmtNum(f.per100.fat)}g · 당 ${fmtNum(f.per100.sugar)}g · 섬유 ${fmtNum(f.per100.fiber)}g · 나트륨 ${fmtInt(f.per100.sodium)}mg</p>
    ${hasUnit ? `<div class="unitswitch" role="group" aria-label="단위"><button data-mode="unit" aria-pressed="${sh.mode === "unit"}">${esc(f.unit.name)} (${f.unit.g}g)</button><button data-mode="g" aria-pressed="${sh.mode === "g"}">g</button></div>` : ""}
    <div class="qtyrow">
      <div class="qtyin"><input id="qty" type="number" inputmode="decimal" min="0" step="any" value="${esc(sh.qty)}" aria-label="먹은 양"><span>${sh.mode === "unit" ? esc(f.unit.name) : "g"}</span></div>
      <div class="quick">${quick.map((v) => `<button data-q="${v}">${v}</button>`).join("")}</div>
    </div>
    <div class="calc" id="calc"></div>
    <div class="row">
      ${sh.editId ? `<button class="btn danger" data-act="delete-entry">지우기</button>` : `<button class="btn" data-act="back">← 다른 음식</button>`}
      <button class="btn primary" id="saveBtn" data-act="save">${sh.editId ? "고친 내용 저장" : `${mealLabel(sh.meal)}에 기록`}</button>
    </div>
  </div>`;
}
// 양을 바꿀 때마다 계산 결과를 다시 보여줘요. "이걸 먹으면 부족한 게 어떻게 바뀌는지"까지
function updateCalc() {
  const g = gramsNow();
  const f = sh.food;
  const calc = $("calc");
  $("saveBtn").disabled = g <= 0;
  if (g <= 0) { calc.innerHTML = `<span class="line">먹은 양을 적으면 계산해 드려요.</span>`; return; }
  const goal = calcTargets(data.profile);
  const others = entriesOf(state.date).filter((e) => e.id !== sh.editId);
  const before = totalsOf(others);
  const after = (k) => before[k] + amountOf(f.per100, g, k);
  const change = ["protein", "carbs", "fat", "fiber"].map((k) => {
    const n = NUTRIENTS.find((x) => x.key === k);
    return `${n.label} ${Math.round((after(k) / goal[k]) * 100)}%`;
  }).join(" · ");
  calc.innerHTML = `<span class="big">${fmtInt(amountOf(f.per100, g, "kcal"))}<small> kcal</small></span>
    <span class="line num">탄수화물 ${fmtNum(amountOf(f.per100, g, "carbs"))}g · 단백질 ${fmtNum(amountOf(f.per100, g, "protein"))}g · 지방 ${fmtNum(amountOf(f.per100, g, "fat"))}g · 나트륨 ${fmtInt(amountOf(f.per100, g, "sodium"))}mg</span>
    <span class="line">먹고 나면 오늘 ${change}</span>
    <span class="formula">${fmtNum(f.per100.kcal)}kcal × ${fmtNum(g)}g ÷ 100</span>`;
}
function saveEntry() {
  const g = r1(gramsNow());
  if (g <= 0) return;
  const f = sh.food;
  const entry = { date: state.date, meal: sh.meal, foodId: f.id, name: f.name, grams: g, per100: { ...f.per100 }, unit: f.unit, createdAt: Date.now() };
  if (sh.editId) {
    entry.createdAt = data.entries[sh.editId]?.createdAt || entry.createdAt;
    entry.date = data.entries[sh.editId]?.date || entry.date;
    data.entries[sh.editId] = entry;
  } else {
    data.entries[newId()] = entry;
  }
  // 최근 먹은 음식 맨 앞으로
  data.recent = [f.id, ...data.recent.filter((id) => id !== f.id)].slice(0, 12);
  saveData(); render(); closeSheet();
  toast(sh.editId ? "고쳤어요." : `${mealLabel(sh.meal)}에 ${f.name} ${fmtNum(g)}g 기록했어요.`);
}

// --- 5-3. 목록에 없는 음식 등록 (과자 봉지 뒤 영양성분표 보고 입력) ---
const CUSTOM_FIELDS = [
  ["kcal", "열량 (kcal)"], ["carbs", "탄수화물 (g)"], ["protein", "단백질 (g)"], ["fat", "지방 (g)"],
  ["sugar", "당류 (g)"], ["fiber", "식이섬유 (g)"], ["sodium", "나트륨 (mg)"],
];
function customView() {
  return `<p class="hint">포장지의 영양성분표를 그대로 옮겨 적으면 돼요. "총 내용량 40g당"처럼 적혀 있으면 기준량에 40을 넣으세요.</p>
    <form class="form" id="customForm">
      <label class="full">음식 이름<input id="c-name" required maxlength="40" value="${esc(sh.query)}" placeholder="예: 편의점 닭가슴살 도시락"></label>
      <label>기준량 (g)<input class="mono" id="c-base" type="number" inputmode="decimal" min="1" step="any" value="100" required></label>
      <label>&nbsp;<span class="hint" style="font-weight:400;padding-top:12px">이 양에 들어 있는 성분</span></label>
      ${CUSTOM_FIELDS.map(([k, l]) => `<label>${l}<input class="mono" id="c-${k}" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>`).join("")}
      <label>자주 먹는 단위 (선택)<input id="c-unit" maxlength="6" placeholder="예: 개, 봉지"></label>
      <label>그 단위 무게 (g)<input class="mono" id="c-unitg" type="number" inputmode="decimal" min="1" step="any" placeholder="예: 40"></label>
      <div class="row full" style="grid-column:1/-1"><button type="button" class="btn" data-act="back">← 돌아가기</button><button class="btn primary">등록하고 양 입력</button></div>
    </form>`;
}
function saveCustom() {
  const name = $("c-name").value.trim();
  const base = Number($("c-base").value);
  if (!name || !(base > 0)) return toast("이름과 기준량을 적어 주세요.");
  const per100 = {};
  for (const [k] of CUSTOM_FIELDS) per100[k] = r1(((Number($("c-" + k).value) || 0) * 100) / base);   // 기준량 → 100g당으로 바꾸기
  const unitName = $("c-unit").value.trim();
  const unitG = Number($("c-unitg").value);
  const food = { id: "c:" + newId(), name, per100, unit: unitName && unitG > 0 ? { name: unitName, g: unitG } : { name: "g", g: 100 } };
  data.customFoods.push(food);
  saveData();
  sh = { ...sh, step: "amount", food, mode: food.unit.name !== "g" ? "unit" : "g", qty: food.unit.name !== "g" ? "1" : "100" };
  renderSheet();
}

// --- 5-4. 내 기준 설정 ---
function settingsView() {
  const p = data.profile;
  return `<p class="hint">${data.profileSet ? "" : "처음 오셨네요. 내 정보를 넣으면 나에게 맞는 하루 목표를 계산해요. "}이 정보는 이 폰 안에만 저장되고 어디로도 보내지 않아요.</p>
    <form class="form" id="settingsForm">
      <label>몸무게 (kg)<input class="mono" id="s-weight" type="number" inputmode="decimal" min="30" max="200" step="0.1" value="${p.weight ?? ""}" placeholder="${guessWeight(p)} (미입력)"></label>
      <label>키 (cm)<input class="mono" id="s-height" type="number" inputmode="decimal" min="120" max="220" step="0.1" value="${p.height}"></label>
      <label>만 나이<input class="mono" id="s-age" type="number" inputmode="numeric" min="10" max="100" value="${p.age}"></label>
      <label>성별<select id="s-sex"><option value="m" ${p.sex === "m" ? "selected" : ""}>남성</option><option value="f" ${p.sex === "f" ? "selected" : ""}>여성</option></select></label>
      <label class="full">운동량<select id="s-activity">${ACTIVITY.map((a) => `<option value="${a.value}" ${a.value === p.activity ? "selected" : ""}>${a.label}</option>`).join("")}</select></label>
      <label>목표<select id="s-goal">${Object.entries(GOALS).map(([k, g]) => `<option value="${k}" ${k === p.goal ? "selected" : ""}>${g.label} (${g.delta > 0 ? "+" : ""}${g.delta}kcal)</option>`).join("")}</select></label>
      <label>단백질 (kg당)<select id="s-ppk">${[1.2, 1.6, 2.0, 2.2].map((v) => `<option value="${v}" ${v === p.proteinPerKg ? "selected" : ""}>${v}g</option>`).join("")}</select></label>
    </form>
    <p class="explain" id="settingsExplain"></p>
    <button class="btn primary" data-act="save-settings">저장</button>
    <div class="panel">
      <h4>백업</h4>
      <p class="hint">기록은 이 폰 안에만 저장돼요. 폰을 바꾸거나 앱을 지우기 전에 백업 파일을 저장해 두세요.</p>
      ${isInstallable
        ? `<div class="row"><button class="btn" data-act="export">백업 파일 저장</button><button class="btn" data-act="import">백업 불러오기</button></div>`
        : `<p class="hint">백업은 홈 화면에 설치한 앱에서 쓸 수 있어요.</p>`}
      ${sh.error ? `<p class="err">${esc(sh.error)}</p>` : ""}
    </div>`;
}
function readSettingsForm() {
  const w = Number($("s-weight").value);
  return {
    weight: w >= 30 && w <= 200 ? r1(w) : null,
    height: Number($("s-height").value) || DEFAULT_PROFILE.height,
    age: Number($("s-age").value) || DEFAULT_PROFILE.age,
    sex: $("s-sex").value,
    activity: Number($("s-activity").value),
    goal: $("s-goal").value,
    proteinPerKg: Number($("s-ppk").value),
  };
}
function updateSettingsPreview() {
  const p = readSettingsForm();
  const t = calcTargets(p);
  $("settingsExplain").innerHTML =
    `기초대사량 <b>${fmtInt(t.bmr)}</b> × 운동량 <b>${p.activity}</b> = 하루 소비 <b>${fmtInt(t.tdee)}</b>kcal<br>` +
    `${GOALS[p.goal].label} 목표 → <b>${fmtInt(t.kcal)}</b>kcal<br>` +
    `단백질 <b>${t.protein}</b>g (${t.weightUsed}kg × ${p.proteinPerKg}) · 지방 <b>${t.fat}</b>g (열량의 25%) · 탄수화물 <b>${t.carbs}</b>g (나머지)<br>` +
    `식이섬유 <b>${t.fiber}</b>g 이상 · 당류 <b>${t.sugar}</b>g 이하 · 나트륨 <b>${fmtInt(t.sodium)}</b>mg 이하`;
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `끼니노트-백업-${ymd(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("importInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d || typeof d.entries !== "object") throw new Error("bad");
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    loadData(); render(); closeSheet(); toast("백업을 불러왔어요.");
  } catch {
    sh.error = "끼니 노트 백업 파일이 아니에요."; renderSheet();
  }
});

// 시트 안의 버튼·입력 처리 (한 곳에서 모아서 처리해요)
$("sheet").addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "searchQ") { sh.query = t.value; $("results").innerHTML = resultsHtml(); }
  if (t.id === "qty") { sh.qty = t.value; updateCalc(); }
  if (t.closest("#settingsForm")) updateSettingsPreview();
});
$("sheet").addEventListener("change", (ev) => { if (ev.target.closest("#settingsForm")) updateSettingsPreview(); });
$("sheet").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (ev.target.id === "customForm") saveCustom();
});
$("sheet").addEventListener("click", (ev) => {
  const meal = ev.target.closest("[data-meal]");
  if (meal) { sh.meal = meal.dataset.meal; renderSheet(); return; }
  const food = ev.target.closest("[data-food]");
  if (food) {
    const f = findFood(food.dataset.food);
    const hasUnit = f.unit && f.unit.name !== "g";
    sh = { ...sh, step: "amount", food: f, mode: hasUnit ? "unit" : "g", qty: hasUnit ? "1" : "100" };
    renderSheet(); $("qty")?.select(); return;
  }
  const mode = ev.target.closest("[data-mode]");
  if (mode && mode.dataset.mode !== sh.mode) {
    // 단위를 바꿔도 같은 양이 되도록 숫자를 바꿔줘요 (1공기 → 210g)
    const g = gramsNow();
    sh.mode = mode.dataset.mode;
    sh.qty = String(sh.mode === "unit" ? r1(g / sh.food.unit.g) : r1(g));
    renderSheet(); return;
  }
  const q = ev.target.closest("[data-q]");
  if (q) { sh.qty = q.dataset.q; $("qty").value = sh.qty; updateCalc(); return; }

  const act = ev.target.closest("[data-act]")?.dataset.act;
  if (act === "close") closeSheet();
  else if (act === "back") { sh.step = "search"; renderSheet(); }
  else if (act === "custom") { sh.step = "custom"; renderSheet(); $("c-name")?.focus(); }
  else if (act === "save") saveEntry();
  else if (act === "delete-entry") { delete data.entries[sh.editId]; saveData(); render(); closeSheet(); toast("지웠어요."); }
  else if (act === "save-settings") { data.profile = readSettingsForm(); data.profileSet = true; saveData(); render(); closeSheet(); toast("내 기준을 저장했어요."); }
  else if (act === "export") exportBackup();
  else if (act === "import") $("importInput").click();
});

// ---------------------------------------------------------------------
// 6. 앱 시작 + 홈 화면 설치
// ---------------------------------------------------------------------
loadData();
render();
// 처음 연 날에는 내 정보부터 입력하게 "내 기준" 창을 열어줘요
if (!data.profileSet) openSheet({ step: "settings" });

// 날짜가 바뀌었는데 앱을 켜둔 채였으면, 다시 볼 때 오늘로 맞춰줘요
let lastToday = ymd(new Date());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const now = ymd(new Date());
  if (now !== lastToday) { if (state.date === lastToday) state.date = now; lastToday = now; render(); }
});

// 설치용 정보(manifest)가 있는 진짜 앱 주소에서만 동작해요
const isInstallable = !!document.querySelector('link[rel="manifest"]');
const isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
if (isInstallable && "serviceWorker" in navigator) {
  // 서비스 워커: 앱 파일을 폰에 보관해서 인터넷 없이도 열리게 해줘요 (sw.js 참고)
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (isInstallable) navigator.storage?.persist?.().catch(() => {});   // 폰이 기록을 함부로 지우지 않게 요청

let installEvent = null;
function showInstallBanner() {
  if (!isInstallable || isInstalled) return;
  try { if (localStorage.getItem("kkini-hide-install")) return; } catch {}
  const b = $("installBanner");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  b.innerHTML = installEvent
    ? `<span>홈 화면에 설치하면 앱처럼 쓸 수 있어요.</span><button id="installBtn">설치</button><button class="x" id="hideInstall" aria-label="닫기">×</button>`
    : `<span>${isIOS ? "Safari 아래쪽 공유 버튼 → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요." : "브라우저 메뉴(⋮) → <b>홈 화면에 추가</b>(또는 앱 설치)를 누르면 앱처럼 쓸 수 있어요."}</span><button class="x" id="hideInstall" aria-label="닫기">×</button>`;
  b.hidden = false;
  $("installBtn")?.addEventListener("click", async () => { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; b.hidden = true; });
  $("hideInstall").onclick = () => { b.hidden = true; try { localStorage.setItem("kkini-hide-install", "1"); } catch {} };
}
// 안드로이드 크롬은 "설치할 수 있어요" 신호를 보내줘요 → 설치 버튼으로 연결
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; showInstallBanner(); });
showInstallBanner();
