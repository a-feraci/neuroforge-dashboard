/* =========================================================
  NeuroForge // app.js

  Purpose:
    - Store baselines + session logs in localStorage
    - Run training modes (Daily / Tri / Full)
    - Mission Console:
        * paste challenge
        * write answers
        * add insights (separate)
        * add metrics (mood/sleep/difficulty/enjoyed)
        * mark complete to earn XP
        * save into the newest log entry
    - Session Log controls:
        * per-entry copy to clipboard
        * per-entry edit
        * per-entry delete
        * per-entry "Complete" toggle (earned XP model)

  Sections:
    01) Constants + Default State
    02) Storage + Helpers
    03) Derived Values (Earned XP, formatting)
    04) Rendering (UI)
    05) Modal System
    06) Core Actions (sessions, retest, export, reset)
    07) Mission Console Actions
    08) Session Log Actions (copy/edit/delete/complete)
    09) Event Wiring + Boot
========================================================= */

/* ---------------------------------------------------------
  01) CONSTANTS + DEFAULT STATE
--------------------------------------------------------- */
const STORAGE_KEY = "neuroforge_v1";

const DEFAULT_STATE = {
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

  todayFocus: "—",
  log: []
};

/* ---------------------------------------------------------
  02) STORAGE + HELPERS
--------------------------------------------------------- */
function structuredCloneSafe(x){
  return JSON.parse(JSON.stringify(x));
}

function $(id){
  return document.getElementById(id);
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredCloneSafe(DEFAULT_STATE);

    const parsed = JSON.parse(raw);

    const st = {
      ...structuredCloneSafe(DEFAULT_STATE),
      ...parsed,
      baselines: { ...structuredCloneSafe(DEFAULT_STATE.baselines), ...(parsed.baselines || {}) },
      notes: { ...structuredCloneSafe(DEFAULT_STATE.notes), ...(parsed.notes || {}) },
      log: Array.isArray(parsed.log) ? parsed.log : []
    };

    // MIGRATION / NORMALIZATION
    st.log = st.log.map(e => {
      const out = { ...e };

      if(typeof out.xpPotential !== "number" && typeof out.xp === "number"){
        out.xpPotential = out.xp;
      }

      if(typeof out.completed !== "boolean"){
        out.completed = true;
      }

      delete out.xp;

      out.xpPotential = typeof out.xpPotential === "number" ? out.xpPotential : 0;

      out.mood ??= "";
      out.sleepHrs ??= "";
      out.difficulty ??= "";
      out.liked ??= "";

      out.challengeText ??= "";
      out.answerText ??= "";
      out.insightText ??= ""; // NEW: Insights field

      return out;
    });

    return st;
  }catch{
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function scoreToPct(score){
  return clamp((score / 10) * 100, 0, 100);
}

function pickRandom(arr, count){
  const a = [...arr];
  const out = [];

  while(out.length < count && a.length){
    const i = Math.floor(Math.random() * a.length);
    out.push(a.splice(i, 1)[0]);
  }

  return out;
}

function nowStamp(){
  const d = new Date();
  return d.toLocaleString(undefined, {
    year:"numeric",
    month:"short",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function formatScore(n){
  const s = Number(n);
  return Number.isInteger(s) ? String(s) : String(s.toFixed(1));
}

/* ---------------------------------------------------------
  03) DERIVED VALUES (EARNED XP, etc.)
--------------------------------------------------------- */
function calcXP(){
  return state.log.reduce((sum, e) => {
    const earned = e.completed ? (Number(e.xpPotential) || 0) : 0;
    return sum + earned;
  }, 0);
}

function setSaveStatus(msg){
  const el = $("saveStatus");
  if(!el) return;
  el.textContent = msg || "";
}

function pulseSaveButton(){
  const btn = $("btnSaveConsole");
  if(!btn) return;

  btn.classList.add("btn-saved");
  window.setTimeout(() => btn.classList.remove("btn-saved"), 180);
}

/* ---------------------------------------------------------
  04) RENDERING (UI)
--------------------------------------------------------- */
function setTopStats(){
  $("todayFocus").textContent = state.todayFocus || "—";
  $("totalSessions").textContent = String(state.log.length || 0);
  $("xpTotal").textContent = String(calcXP());
}

function renderSkills(){
  const grid = $("skillsGrid");
  grid.innerHTML = "";

  for(const [name, score] of Object.entries(state.baselines)){
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

/**
 * Convert one entry into a nice clipboard-friendly text block
 */
function entryToClipboardText(e){
  const cats = (e.categories || []).join(", ");
  const earned = e.completed ? (Number(e.xpPotential) || 0) : 0;

  const lines = [
    `${e.title}`,
    `${e.time}`,
    `Rolled: ${cats}`,
    `Completed: ${e.completed ? "Yes" : "No"}`,
    `XP: ${earned} / ${Number(e.xpPotential) || 0}`,
    e.mood ? `Mood: ${e.mood}` : "",
    e.sleepHrs !== "" ? `Sleep: ${e.sleepHrs} hrs` : "",
    e.difficulty ? `Difficulty: ${e.difficulty}` : "",
    e.liked ? `Enjoyed: ${e.liked}` : "",
    e.challengeText ? `\nChallenge:\n${e.challengeText}` : "",
    e.answerText ? `\nAnswers / Notes:\n${e.answerText}` : "",
    e.insightText ? `\nInsights:\n${e.insightText}` : ""
  ].filter(Boolean);

  return lines.join("\n");
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
    const cats = (e.categories || []);
    const earned = e.completed ? (Number(e.xpPotential) || 0) : 0;

    const metricTags = [
      e.mood ? `<span class="tag tag-metric">Mood: ${escapeHtml(e.mood)}</span>` : "",
      e.sleepHrs !== "" ? `<span class="tag tag-metric">Sleep: ${escapeHtml(e.sleepHrs)}h</span>` : "",
      e.difficulty ? `<span class="tag tag-metric">Diff: ${escapeHtml(e.difficulty)}</span>` : "",
      e.liked ? `<span class="tag tag-metric">Enjoyed: ${escapeHtml(e.liked)}</span>` : ""
    ].filter(Boolean).join("");

    entry.innerHTML = `
      <div class="entry-top">
        <div>
          <div class="entry-title">${escapeHtml(e.title)}</div>
          <div class="entry-time">${escapeHtml(e.time)}</div>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label class="tag" style="cursor:pointer;">
            <input
              data-action="toggleComplete"
              data-id="${e.id}"
              type="checkbox"
              ${e.completed ? "checked" : ""}
              style="margin-right:8px;"
            >
            Complete
          </label>

          <button class="btn btn-ghost" data-action="copy" data-id="${e.id}">Copy</button>
          <button class="btn btn-ghost" data-action="edit" data-id="${e.id}">Edit</button>
          <button class="btn btn-ghost" data-action="delete" data-id="${e.id}">🗑️</button>
        </div>
      </div>

      <div class="entry-body">
        ${cats.length ? `Rolled: ${escapeHtml(cats.join(", "))}` : ""}

        ${e.challengeText ? `
          <div class="entry-section">
            <div class="entry-label">🛰️ Challenge</div>
            <div class="entry-text">${escapeHtml(e.challengeText)}</div>
          </div>` : ""}

        ${e.answerText ? `
          <div class="entry-section">
            <div class="entry-label">✍️ Answers / Notes</div>
            <div class="entry-text">${escapeHtml(e.answerText)}</div>
          </div>` : ""}

        ${e.insightText ? `
          <div class="entry-section">
            <div class="entry-label">🔎 Insights</div>
            <div class="entry-text">${escapeHtml(e.insightText)}</div>
          </div>` : ""}
      </div>

      <div class="tagrow">
        ${cats.map(c => `<span class="tag">#${escapeHtml(c)}</span>`).join("")}
        ${metricTags}
        <span class="tag">${"+" + earned} XP</span>
      </div>
    `;

    logEl.appendChild(entry);
  }
}

function renderRetestOptions(){
  const sel = $("retestSelect");
  if(sel.options.length > 1) return;

  for(const c of Object.keys(state.baselines)){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

function renderConsole(){
  const sub = $("consoleSub");

  sub.textContent =
    state.todayFocus && state.todayFocus !== "—"
      ? `Loaded: ${state.todayFocus}`
      : "No roll yet. Tap a mode above.";

  if(state.log.length){
    const latest = state.log[0];

    // Keep console checkbox in sync
    $("completeToggle").checked = !!latest.completed;

    // Populate console fields from latest entry (so save/edit feels real)
    $("challengeText").value = latest.challengeText || "";
    $("answerText").value = latest.answerText || "";
    const insightEl = $("insightText");
    if(insightEl) insightEl.value = latest.insightText || "";

    $("moodSel").value = latest.mood || "";
    $("sleepHrs").value = latest.sleepHrs ?? "";
    $("diffSel").value = latest.difficulty || "";
    $("likeSel").value = latest.liked || "";
  }else{
    $("completeToggle").checked = false;
    setSaveStatus("");
  }
}

/**
 * Master render:
 * - updates UI
 * - persists to localStorage
 */
function render(){
  setTopStats();
  renderSkills();
  renderLog();
  renderRetestOptions();
  renderConsole();
  saveState();
}

/* ---------------------------------------------------------
  05) MODAL SYSTEM
--------------------------------------------------------- */
const modal = $("modal");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalConfirm = $("modalConfirm");
let modalOnConfirm = null;

function openModal({ title, bodyHtml, confirmText = "Confirm", onConfirm }){
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalConfirm.textContent = confirmText;
  modalOnConfirm = onConfirm;
  modal.showModal();
}

modal.addEventListener("close", () => {
  if(modal.returnValue === "default" && typeof modalOnConfirm === "function"){
    modalOnConfirm();
  }
  modalOnConfirm = null;
});

/* ---------------------------------------------------------
  06) CORE ACTIONS
--------------------------------------------------------- */
function addLogEntry({ title, categories, xpPotential }){
  const entry = {
    id: crypto.randomUUID(),
    time: nowStamp(),
    title,
    categories,
    xpPotential: Number(xpPotential || 0),
    completed: false,

    mood: "",
    sleepHrs: "",
    difficulty: "",
    liked: "",
    challengeText: "",
    answerText: "",
    insightText: "" // NEW
  };

  state.log.unshift(entry);
  render();
}

function runSession(kind, count){
  const categories = Object.keys(state.baselines);
  const pick = pickRandom(categories, count);
  state.todayFocus = pick.join(" • ");

  const xpPotential =
    kind === "Daily Neural Roll" ? 10 :
    kind === "Tri-Skill Sprint" ? 18 :
    25;

  addLogEntry({ title: kind, categories: pick, xpPotential });
}

function quickRetest(category){
  openModal({
    title: `🔁 Re-test: ${category}`,
    confirmText: "Save",
    bodyHtml: `
      <p>Enter a new score (0–10). This logs a re-test entry. Optional baseline overwrite.</p>

      <label style="display:block;margin:10px 0 6px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        New score
      </label>

      <input
        id="newScore"
        type="number"
        min="0"
        max="10"
        step="0.5"
        style="width:100%;padding:10px 12px;border-radius:16px;border:1px solid #ffffff1f;background:#0a0c22;color:#f6f3ff;font-family:var(--mono);"
      >

      <label style="display:flex;gap:10px;align-items:center;margin-top:12px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        <input id="overwrite" type="checkbox">
        Overwrite baseline with this score
      </label>
    `,
    onConfirm: () => {
      const val = Number(document.getElementById("newScore").value);
      const overwrite = document.getElementById("overwrite").checked;
      if(Number.isNaN(val)) return;

      const score = clamp(val, 0, 10);
      const old = Number(state.baselines[category]);

      if(overwrite) state.baselines[category] = score;

      addLogEntry({
        title: "Re-test",
        categories: [category],
        xpPotential: 6
      });

      state.log[0].answerText =
        `Re-test score: ${formatScore(score)} / 10 (was ${formatScore(old)}). ` +
        (overwrite ? "Baseline updated." : "Baseline unchanged.");
      state.log[0].completed = true;

      render();
    }
  });
}

function editBaselines(){
  const json = JSON.stringify(state.baselines, null, 2);

  openModal({
    title: "📌 Edit Baselines (JSON)",
    confirmText: "Apply",
    bodyHtml: `
      <p>Edit baselines (0–10). Keep valid JSON.</p>
      <textarea id="baselineEditor">${escapeHtml(json)}</textarea>
    `,
    onConfirm: () => {
      const txt = document.getElementById("baselineEditor").value;

      try{
        const obj = JSON.parse(txt);

        for(const [k, v] of Object.entries(obj)){
          const num = Number(v);
          if(Number.isNaN(num)) throw new Error("Non-number score found.");
          obj[k] = clamp(num, 0, 10);
        }

        state.baselines = obj;
        render();
      }catch(e){
        alert("Could not parse JSON: " + String(e.message || e));
      }
    }
  });
}

function exportData(){
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "neuroforge-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function resetMenu(){
  openModal({
    title: "Reset options",
    confirmText: "Apply",
    bodyHtml: `
      <p>Choose what to reset:</p>

      <label style="display:flex;gap:10px;align-items:center;margin:10px 0;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        <input id="rLog" type="checkbox"> Reset session log only
      </label>

      <label style="display:flex;gap:10px;align-items:center;margin:10px 0;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        <input id="rBase" type="checkbox"> Reset baselines only
      </label>

      <label style="display:flex;gap:10px;align-items:center;margin:10px 0;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
        <input id="rAll" type="checkbox"> Reset EVERYTHING
      </label>

      <p style="font-size:12px;color:#c7c2ffcc;font-family:var(--mono);">
        This affects only this browser/device.
      </p>
    `,
    onConfirm: () => {
      const rLog = document.getElementById("rLog").checked;
      const rBase = document.getElementById("rBase").checked;
      const rAll = document.getElementById("rAll").checked;

      if(rAll){
        state = structuredCloneSafe(DEFAULT_STATE);
        render();
        return;
      }

      if(rLog) state.log = [];

      if(rBase){
        state.baselines = structuredCloneSafe(DEFAULT_STATE.baselines);
        state.notes = structuredCloneSafe(DEFAULT_STATE.notes);
      }

      render();
    }
  });
}

/* ---------------------------------------------------------
  07) MISSION CONSOLE ACTIONS
--------------------------------------------------------- */
function saveConsoleToLatest(){
  if(!state.log.length){
    alert("No session entry yet. Roll a mode first.");
    return;
  }

  const latest = state.log[0];

  latest.challengeText = $("challengeText").value || "";
  latest.answerText = $("answerText").value || "";
  latest.insightText = $("insightText") ? ($("insightText").value || "") : "";

  latest.mood = $("moodSel").value || "";
  latest.sleepHrs = $("sleepHrs").value || "";
  latest.difficulty = $("diffSel").value || "";
  latest.liked = $("likeSel").value || "";

  latest.completed = $("completeToggle").checked;

  // Immediate feedback
  pulseSaveButton();
  setSaveStatus("Saved ✅");

  // Clear the console inputs after save (as requested)
  $("answerText").value = "";
  if($("insightText")) $("insightText").value = "";
  $("moodSel").value = "";
  $("sleepHrs").value = "";
  $("diffSel").value = "";
  $("likeSel").value = "";

  // Keep challenge text (usually you want it there while working),
  // but you can clear it too if you'd rather:
  // $("challengeText").value = "";

  render();
}

/* ---------------------------------------------------------
  08) SESSION LOG ACTIONS (COPY / EDIT / DELETE / COMPLETE)
--------------------------------------------------------- */
function handleLogAction(ev){
  const btn = ev.target.closest("[data-action]");
  if(!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  const entry = state.log.find(e => e.id === id);
  if(!entry) return;

  if(action === "copy"){
    const text = entryToClipboardText(entry);

    navigator.clipboard?.writeText(text).then(
      () => alert("Copied to clipboard ✅"),
      () => alert("Clipboard blocked by browser 😤 (try https or allow permissions)")
    );
    return;
  }

  if(action === "delete"){
    openModal({
      title: "Delete this entry?",
      confirmText: "Delete",
      bodyHtml: `<p>This removes only this one session log item.</p>`,
      onConfirm: () => {
        state.log = state.log.filter(e => e.id !== id);
        render();
      }
    });
    return;
  }

  if(action === "edit"){
    openModal({
      title: "Edit Entry (Challenge / Notes / Insights / Metrics)",
      confirmText: "Save",
      bodyHtml: `
        <p>Edit this session entry:</p>

        <label style="display:block;margin:10px 0 6px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
          Challenge
        </label>
        <textarea id="editChallenge">${escapeHtml(entry.challengeText || "")}</textarea>

        <label style="display:block;margin:10px 0 6px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
          Answers / Notes
        </label>
        <textarea id="editNotes">${escapeHtml(entry.answerText || "")}</textarea>

        <label style="display:block;margin:10px 0 6px;color:#c7c2ffcc;font-family:var(--mono);font-size:12px;">
          Insights
        </label>
        <textarea id="editInsights">${escapeHtml(entry.insightText || "")}</textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div>
            <div style="color:#c7c2ffcc;font-family:var(--mono);font-size:12px;margin-bottom:6px;">Mood</div>
            <input id="editMood" class="miniInput" value="${escapeHtml(entry.mood || "")}" placeholder="😈 / 🙂 / etc">
          </div>

          <div>
            <div style="color:#c7c2ffcc;font-family:var(--mono);font-size:12px;margin-bottom:6px;">Sleep (hrs)</div>
            <input id="editSleep" class="miniInput" value="${escapeHtml(entry.sleepHrs ?? "")}" placeholder="7.5">
          </div>

          <div>
            <div style="color:#c7c2ffcc;font-family:var(--mono);font-size:12px;margin-bottom:6px;">Difficulty</div>
            <input id="editDiff" class="miniInput" value="${escapeHtml(entry.difficulty || "")}" placeholder="Easy/Hard/Boss Fight">
          </div>

          <div>
            <div style="color:#c7c2ffcc;font-family:var(--mono);font-size:12px;margin-bottom:6px;">Enjoyed</div>
            <input id="editLike" class="miniInput" value="${escapeHtml(entry.liked || "")}" placeholder="Yes/Neutral/No">
          </div>
        </div>
      `,
      onConfirm: () => {
        entry.challengeText = document.getElementById("editChallenge").value || "";
        entry.answerText = document.getElementById("editNotes").value || "";
        entry.insightText = document.getElementById("editInsights").value || "";
        entry.mood = document.getElementById("editMood").value || "";
        entry.sleepHrs = document.getElementById("editSleep").value || "";
        entry.difficulty = document.getElementById("editDiff").value || "";
        entry.liked = document.getElementById("editLike").value || "";
        render();
      }
    });
  }
}

function handleCompleteToggle(ev){
  const cb = ev.target;
  if(!(cb instanceof HTMLInputElement)) return;
  if(cb.dataset.action !== "toggleComplete") return;

  const id = cb.dataset.id;
  const entry = state.log.find(e => e.id === id);
  if(!entry) return;

  entry.completed = cb.checked;
  render();
}

/* ---------------------------------------------------------
  09) EVENT WIRING + BOOT
--------------------------------------------------------- */
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
    bodyHtml: `<p>This clears only the session log. Baselines remain.</p>`,
    onConfirm: () => {
      state.log = [];
      render();
    }
  });
});

$("btnExport").addEventListener("click", exportData);
$("btnReset").addEventListener("click", resetMenu);

$("btnSaveConsole").addEventListener("click", saveConsoleToLatest);

$("log").addEventListener("click", handleLogAction);
$("log").addEventListener("change", handleCompleteToggle);

render();
