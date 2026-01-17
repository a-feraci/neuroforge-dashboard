/* NeuroForge Dashboard v1.0
   - Baselines + Log stored in localStorage
   - Daily Roll / Tri Sprint / Full Circuit choose random categories
*/

const STORAGE_KEY = "neuroforge_v1";

const DEFAULT_STATE = {
  xp: 0,
  sessions: 0,
  todayFocus: "—",
  baselines: {
    "Focus & Attention": 6,
    "Working Memory": 8.5,
    "Logic & Reasoning": 6,
    "Comprehension & Synthesis": 7.5,
    "Vocabulary": 8,
    "Quick Math": 4.5,
    "Visualization": 8,
    "Spatial Awareness": 7,
    "Pattern Recognition": 9,
    "Decision-Making Under Uncertainty": 8.5
  },
  notes: {
    "Focus & Attention": "Rotation ≠ hierarchy change. Guard against assumption drift.",
    "Working Memory": "Strong filter under interference.",
    "Logic & Reasoning": "Needs formal rigor (syllogism overlap trap).",
    "Comprehension & Synthesis": "Good gist; add why/how for depth.",
    "Vocabulary": "Solid recognition; we’ll test active use later.",
    "Quick Math": "Accuracy under pressure is the XP farm.",
    "Visualization": "Strong mental imagery; keep sharpening transformations.",
    "Spatial Awareness": "Good directional reasoning; confidence wobble only.",
    "Pattern Recognition": "Standout strength. Use it everywhere.",
    "Decision-Making Under Uncertainty": "Good expected-value instincts."
  },
  log: []
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // merge for forward compatibility
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      baselines: { ...structuredClone(DEFAULT_STATE.baselines), ...(parsed.baselines || {}) },
      notes: { ...structuredClone(DEFAULT_STATE.notes), ...(parsed.notes || {}) },
      log: Array.isArray(parsed.log) ? parsed.log : []
    };
  }catch{
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function $(id){ return document.getElementById(id); }

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function scoreToPct(score){ return clamp((score/10)*100, 0, 100); }

function pickRandom(arr, count){
  const a = [...arr];
  const out = [];
  while(out.length < count && a.length){
    const i = Math.floor(Math.random()*a.length);
    out.push(a.splice(i,1)[0]);
  }
  return out;
}

function nowStamp(){
  const d = new Date();
  return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function addXP(amount){
  state.xp = Math.max(0, (state.xp || 0) + amount);
}

function addLogEntry({title, categories, body, xp}){
  state.sessions = (state.sessions || 0) + 1;
  if(typeof xp === "number") addXP(xp);

  const entry = {
    id: crypto.randomUUID(),
    time: nowStamp(),
    title,
    categories,
    body,
    xp: xp ?? 0
  };
  state.log.unshift(entry);
  saveState();
  render();
}

function renderTop(){
  $("todayFocus").textContent = state.todayFocus || "—";
  $("totalSessions").textContent = String(state.sessions || 0);
  $("xpTotal").textContent = String(state.xp || 0);
}

function renderSkills(){
  const grid = $("skillsGrid");
  grid.innerHTML = "";

  const entries = Object.entries(state.baselines);
  for(const [name, score] of entries){
    const pct = scoreToPct(score);

    const card = document.createElement("div");
    card.className = "skill";
    card.innerHTML = `
      <div class="skill-top">
        <div>
          <div class="skill-name">${escapeHtml(name)}</div>
          <div class="skill-meta">${escapeHtml(state.notes[name] || "—")}</div>
        </div>
        <div class="skill-score">${formatScore(score)} / 10</div>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    `;
    grid.appendChild(card);
  }
}

function renderLog(){
  const logEl = $("log");
  logEl.innerHTML = "";

  if(!state.log.length){
    const empty = document.createElement("div");
    empty.className = "entry";
    empty.innerHTML = `
      <div class="entry-top">
        <div class="entry-title">No sessions yet</div>
        <div class="entry-time">Start with 🎲 Daily Neural Roll</div>
      </div>
      <div class="entry-body">This is where your challenges and scores will live.</div>
    `;
    logEl.appendChild(empty);
    return;
  }

  for(const e of state.log){
    const entry = document.createElement("div");
    entry.className = "entry";
    entry.innerHTML = `
      <div class="entry-top">
        <div class="entry-title">${escapeHtml(e.title)}</div>
        <div class="entry-time">${escapeHtml(e.time)}</div>
      </div>
      <div class="entry-body">${escapeHtml(e.body || "")}</div>
      <div class="tagrow">
        ${(e.categories || []).map(c => `<span class="tag">#${escapeHtml(c)}</span>`).join("")}
        <span class="tag">+${Number(e.xp || 0)} XP</span>
      </div>
    `;
    logEl.appendChild(entry);
  }
}

function renderRetestOptions(){
  const sel = $("retestSelect");
  const cats = Object.keys(state.baselines);
  // only populate once
  if(sel.options.length > 1) return;
  for(const c of cats){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

function render(){
  renderTop();
  renderSkills();
  renderLog();
  renderRetestOptions();
}

function formatScore(n){
  // show .5 if present
  const s = Number(n);
  return Number.isInteger(s) ? String(s) : String(s.toFixed(1));
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* Modal helpers */
const modal = $("modal");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalConfirm = $("modalConfirm");

let modalOnConfirm = null;

function openModal({title, bodyHtml, confirmText="Confirm", onConfirm}){
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalConfirm.textContent = confirmText;
  modalOnConfirm = onConfirm;
  modal.showModal();
}

modal.addEventListener("close", () => {
  const returnValue = modal.returnValue;
  if(returnValue === "default" && typeof modalOnConfirm === "function"){
    modalOnConfirm();
  }
  modalOnConfirm = null;
});

/* Training actions */
function runSession(kind, count){
  const categories = Object.keys(state.baselines);
  const pick = pickRandom(categories, count);
  state.todayFocus = pick.join(" • ");

  const xp = kind === "Daily Neural Roll" ? 10 : kind === "Tri-Skill Sprint" ? 18 : 25;

  addLogEntry({
    title: kind,
    categories: pick,
    body: `Rolled: ${pick.join(", ")}. (Go back to Echo for the actual puzzles 😈)`,
    xp
  });
}

function quickRetest(category){
  // Minimal UI: user enters a new score, we store it as a log + (optional) baseline update
  openModal({
    title: `🔁 Re-test: ${category}`,
    confirmText: "Save",
    bodyHtml: `
      <p>Enter your new score (0–10). This will log a re-test entry. You can also overwrite the baseline.</p>
      <label style="display:block;margin:10px 0 6px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">New score</label>
      <input id="newScore" type="number" min="0" max="10" step="0.5"
        style="width:100%;padding:10px 12px;border-radius:16px;border:1px solid #ffffff1f;background:#0a0c22;color:#f6f3ff;font-family:var(--mono);">
      <label style="display:flex;gap:10px;align-items:center;margin-top:12px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        <input id="overwrite" type="checkbox">
        Overwrite baseline with this score
      </label>
    `,
    onConfirm: () => {
      const input = document.getElementById("newScore");
      const overwrite = document.getElementById("overwrite");
      const val = Number(input.value);
      if(Number.isNaN(val)) return;

      const score = clamp(val, 0, 10);
      const old = Number(state.baselines[category]);

      if(overwrite && overwrite.checked){
        state.baselines[category] = score;
      }

      addLogEntry({
        title: "Re-test",
        categories: [category],
        body: `Re-test score: ${formatScore(score)} / 10 (was ${formatScore(old)}). ${overwrite && overwrite.checked ? "Baseline updated." : "Baseline unchanged."}`,
        xp: 6
      });
    }
  });
}

function editBaselines(){
  const json = JSON.stringify(state.baselines, null, 2);
  openModal({
    title: "📌 Edit Baselines (JSON)",
    confirmText: "Apply",
    bodyHtml: `
      <p>Edit your baselines (0–10). Keep valid JSON. Example: <code>{"Working Memory": 8.5}</code></p>
      <textarea id="baselineEditor">${escapeHtml(json)}</textarea>
      <p style="margin-top:10px;font-size:12px;color:#c7c2ffcc;font-family:var(--mono);">
        Pro tip: decimals allowed (step 0.5).
      </p>
    `,
    onConfirm: () => {
      const txt = document.getElementById("baselineEditor").value;
      try{
        const obj = JSON.parse(txt);
        // minimal validation
        for(const [k,v] of Object.entries(obj)){
          const num = Number(v);
          if(Number.isNaN(num)) throw new Error("Non-number score found.");
          obj[k] = clamp(num, 0, 10);
        }
        state.baselines = obj;
        saveState();
        render();
      }catch(e){
        addLogEntry({
          title: "⚠️ Baseline Edit Failed",
          categories: [],
          body: `Could not parse JSON: ${String(e.message || e)}`,
          xp: 0
        });
      }
    }
  });
}

function exportData(){
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "neuroforge-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetAll(){
  openModal({
    title: "Reset NeuroForge?",
    confirmText: "Yes, reset",
    bodyHtml: `<p>This will wipe local baselines and logs on <b>this device/browser</b>.</p><p>Are you sure?</p>`,
    onConfirm: () => {
      state = structuredClone(DEFAULT_STATE);
      saveState();
      render();
    }
  });
}

/* Wire up */
let state = loadState();

$("btnDaily").addEventListener("click", () => runSession("Daily Neural Roll", 1));
$("btnTri").addEventListener("click", () => runSession("Tri-Skill Sprint", 3));
$("btnFull").addEventListener("click", () => runSession("Full Circuit", 5));

$("btnRetest").addEventListener("click", () => {
  const cat = $("retestSelect").value;
  if(!cat) return;
  quickRetest(cat);
});

$("btnEditBaseline").addEventListener("click", editBaselines);

$("btnClearLog").addEventListener("click", () => {
  openModal({
    title: "Clear session log?",
    confirmText: "Clear",
    bodyHtml: `<p>This removes all session entries (baselines remain).</p>`,
    onConfirm: () => {
      state.log = [];
      saveState();
      render();
    }
  });
});

$("btnExport").addEventListener("click", exportData);
$("btnReset").addEventListener("click", resetAll);

render();
