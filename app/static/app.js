"use strict";

const $ = (id) => document.getElementById(id);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NAMES_ES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
const BLACK = new Set([1, 3, 6, 8, 10]);
const LOW = 21, HIGH = 108; // teclado de piano de 88 teclas
const KEYS_W = 54, RULER_H = 22;

const noteName = (p) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const noteNameEs = (p) => `${NAMES_ES[p % 12]}${Math.floor(p / 12) - 1}`;
const fmt = (s) => {
  s = Math.max(0, s || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const fmtPrecise = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const MODE_LABEL = { separar: "Canción completa", piano: "Solo piano", instrumento: "Un instrumento" };

// --------------------------------------------------------------------------- //
// Estado
// --------------------------------------------------------------------------- //
const state = {
  file: null,
  jobId: null,
  job: null,
  pollTimer: null,
  tracks: [],          // [{...track, visible}]
  minVel: 0,
  pxPerSec: 120,
  viewStart: 0,        // segundo en el borde izquierdo del piano roll
  follow: true,
  pitchLo: 48, pitchHi: 84,
};

const audio = $("audio");

// --------------------------------------------------------------------------- //
// Subida
// --------------------------------------------------------------------------- //
function setFile(file) {
  state.file = file;
  $("dz-text").textContent = file ? file.name : "Arrastra un audio aquí o elige un archivo";
  $("dropzone").classList.toggle("has-file", !!file);
  $("upload-btn").disabled = !file;
}

$("file-input").addEventListener("change", (e) => setFile(e.target.files[0] || null));
const dz = $("dropzone");
["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => {
  e.preventDefault(); dz.classList.add("drag");
}));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
  e.preventDefault(); dz.classList.remove("drag");
}));
dz.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  $("piano-hq").closest("label").style.display = mode === "instrumento" ? "none" : "";
}));

$("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.file) return;
  const fd = new FormData();
  fd.append("file", state.file);
  fd.append("mode", document.querySelector('input[name="mode"]:checked').value);
  fd.append("piano_hq", $("piano-hq").checked);
  $("upload-btn").disabled = true;
  $("upload-btn").textContent = "Subiendo…";
  try {
    const res = await fetch("/api/jobs", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error al subir");
    setFile(null);
    $("file-input").value = "";
    openJob(data.id);
    loadHistory();
  } catch (err) {
    alert(err.message);
  } finally {
    $("upload-btn").textContent = "Convertir a MIDI";
    $("upload-btn").disabled = !state.file;
  }
});

// --------------------------------------------------------------------------- //
// Historial y trabajos
// --------------------------------------------------------------------------- //
async function loadHistory() {
  const jobs = await (await fetch("/api/jobs")).json();
  const ul = $("history");
  ul.innerHTML = "";
  if (!jobs.length) {
    ul.innerHTML = '<li class="h-empty">Todavía no hay canciones</li>';
    return;
  }
  for (const j of jobs) {
    const li = document.createElement("li");
    li.className = j.id === state.jobId ? "active" : "";
    const status = j.status === "listo" ? "" : j.status;
    li.innerHTML = `<span class="h-name"></span><span class="h-status">${status}</span>
      <button class="h-del" title="Borrar">✕</button>`;
    li.querySelector(".h-name").textContent = j.name;
    li.addEventListener("click", () => openJob(j.id));
    li.querySelector(".h-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`¿Borrar "${j.name}"?`)) return;
      const r = await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
      if (!r.ok) return alert((await r.json()).detail);
      if (state.jobId === j.id) showView("empty");
      loadHistory();
    });
    ul.appendChild(li);
  }
}

function showView(name) {
  for (const v of ["empty", "processing", "result"]) $(v).hidden = v !== name;
  if (name === "empty") {
    state.jobId = null;
    history.replaceState(null, "", location.pathname);
  }
}

function openJob(id) {
  clearTimeout(state.pollTimer);
  stopPlayback();
  state.jobId = id;
  history.replaceState(null, "", `#${id}`);
  document.querySelectorAll("#history li").forEach((li) => li.classList.remove("active"));
  poll();
}

async function poll() {
  const id = state.jobId;
  const res = await fetch(`/api/jobs/${id}`);
  if (id !== state.jobId) return;
  if (!res.ok) { showView("empty"); return; }
  const job = await res.json();
  state.job = job;

  if (job.status === "listo") {
    showResult(job);
    loadHistory();
    return;
  }
  showView("processing");
  $("proc-title").textContent = job.name;
  $("proc-step").textContent = job.step;
  const pct = Math.round((job.progress || 0) * 100);
  $("proc-bar").style.width = `${pct}%`;
  $("proc-pct").textContent = job.status === "error" ? "" : `${pct}%`;
  if (job.status !== "error") state.pollTimer = setTimeout(poll, 1000);
  else loadHistory();
}

// --------------------------------------------------------------------------- //
// Resultado
// --------------------------------------------------------------------------- //
function showResult(job) {
  showView("result");
  const r = job.result;
  state.tracks = r.tracks.map((t) => ({ ...t, visible: t.notes.length > 0 }));
  state.viewStart = 0;

  const total = state.tracks.reduce((a, t) => a + t.notes.length, 0);
  $("res-title").textContent = job.name;
  let meta = `${MODE_LABEL[job.mode]} · ${fmt(r.duration)} · ${total.toLocaleString("es")} notas`;
  if (job.elapsed) meta += ` · procesado en ${Math.round(job.elapsed)} s`;
  if (r.skipped.length) meta += ` · sin sonido: ${r.skipped.join(", ")}`;
  $("res-meta").textContent = meta;
  $("dl-all").disabled = total === 0;

  renderTracks();

  const sel = $("listen");
  sel.innerHTML = '<option value="original.mp3">Canción original</option>';
  for (const t of state.tracks) {
    const o = document.createElement("option");
    o.value = t.audio;
    o.textContent = `Solo ${t.label.toLowerCase()}`;
    sel.appendChild(o);
  }
  if (job.mode !== "separar") sel.innerHTML = '<option value="original.mp3">Canción original</option>';
  audio.src = fileUrl("original.mp3");
  audio.volume = +$("vol-audio").value;

  refreshNotes();
}

const fileUrl = (name) => `/files/${state.jobId}/${name}`;

function renderTracks() {
  const box = $("tracks");
  box.innerHTML = "";
  for (const t of state.tracks) {
    const el = document.createElement("div");
    el.className = "track" + (t.visible ? "" : " off");
    const sub = t.transcribed
      ? `${t.notes.length.toLocaleString("es")} notas · ${t.engine}`
      : "Percusión: sin notas afinadas";
    el.innerHTML = `
      <span class="dot" style="background:${t.color}"></span>
      <div class="info"><div class="name"></div><div class="sub">${sub}</div></div>
      ${t.notes.length ? '<button class="dl" title="Descargar MIDI de esta pista">⬇</button>' : ""}
      <input type="checkbox" title="Mostrar / ocultar" ${t.visible ? "checked" : ""} ${t.notes.length ? "" : "disabled"}>`;
    el.querySelector(".name").textContent = t.label;
    el.querySelector("input").addEventListener("change", (e) => {
      t.visible = e.target.checked;
      el.classList.toggle("off", !t.visible);
      refreshNotes();
    });
    const dl = el.querySelector(".dl");
    if (dl) dl.addEventListener("click", () => downloadMidi([t], `${state.job.name} - ${t.label}.mid`));
    box.appendChild(el);
  }
}

$("dl-all").addEventListener("click", () => {
  const tracks = state.tracks.filter((t) => t.visible && t.notes.length);
  if (!tracks.length) return alert("No hay pistas visibles con notas.");
  downloadMidi(tracks, `${state.job.name}.mid`);
});

// Notas visibles (filtradas) usadas por el piano roll, el teclado, la lista y el sintetizador.
let shown = [];
function refreshNotes() {
  shown = [];
  for (const t of state.tracks) {
    if (!t.visible) continue;
    for (const n of t.notes) {
      if (n.velocity >= state.minVel) shown.push({ ...n, color: t.color, track: t.label });
    }
  }
  shown.sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  if (shown.length) {
    let lo = 127, hi = 0;
    for (const n of shown) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
    lo -= 2; hi += 2;
    while (hi - lo < 24) { lo--; hi++; }
    state.pitchLo = Math.max(0, lo);
    state.pitchHi = Math.min(127, hi);
  }
  renderList();
  resetSynth();
}

// --------------------------------------------------------------------------- //
// Lista de notas
// --------------------------------------------------------------------------- //
const LIST_LIMIT = 2000;
function renderList() {
  if ($("tab-list").hidden) return;
  const rows = shown.slice(0, LIST_LIMIT).map((n, i) => `
    <tr data-i="${i}">
      <td>${fmtPrecise(n.start)}</td>
      <td><b>${noteName(n.pitch)}</b> <span class="muted">(${noteNameEs(n.pitch)})</span></td>
      <td>${n.pitch}</td>
      <td>${(n.end - n.start).toFixed(2)} s</td>
      <td>${n.velocity}</td>
      <td><span class="sw" style="background:${n.color}"></span>${n.track}</td>
    </tr>`);
  $("note-rows").innerHTML = rows.join("");
  $("list-more").textContent = shown.length > LIST_LIMIT
    ? `Mostrando las primeras ${LIST_LIMIT.toLocaleString("es")} de ${shown.length.toLocaleString("es")} notas. Descarga el MIDI para verlas todas.`
    : "";
}
$("note-rows").addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (tr) seek(shown[+tr.dataset.i].start);
});

document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
  $("tab-roll").hidden = b.dataset.tab !== "roll";
  $("tab-list").hidden = b.dataset.tab !== "list";
  renderList();
}));

$("min-vel").addEventListener("input", (e) => {
  state.minVel = +e.target.value;
  $("min-vel-val").textContent = e.target.value;
  refreshNotes();
});
$("zoom").addEventListener("input", (e) => { state.pxPerSec = +e.target.value; });
$("follow").addEventListener("change", (e) => { state.follow = e.target.checked; });

// --------------------------------------------------------------------------- //
// Reproducción
// --------------------------------------------------------------------------- //
const duration = () => state.job?.result?.duration || audio.duration || 0;

$("play").addEventListener("click", togglePlay);
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !$("result").hidden && !/INPUT|SELECT|BUTTON/.test(e.target.tagName)) {
    e.preventDefault();
    togglePlay();
  }
});

function togglePlay() {
  if (audio.paused) {
    ensureAudioCtx();
    audio.play();
  } else {
    audio.pause();
  }
}
function stopPlayback() {
  audio.pause();
  resetSynth();
}
audio.addEventListener("play", () => { $("play").textContent = "❚❚"; resetSynth(); });
audio.addEventListener("pause", () => { $("play").textContent = "▶"; resetSynth(); });
audio.addEventListener("seeked", resetSynth);

function seek(t) {
  audio.currentTime = Math.max(0, Math.min(t, duration()));
  if (!state.follow || audio.paused) centerView(audio.currentTime);
}
$("seek").addEventListener("input", (e) => seek((e.target.value / 1000) * duration()));

$("listen").addEventListener("change", (e) => {
  const t = audio.currentTime, playing = !audio.paused;
  audio.src = fileUrl(e.target.value);
  audio.addEventListener("loadedmetadata", () => {
    audio.currentTime = t;
    if (playing) audio.play();
  }, { once: true });
});
$("vol-audio").addEventListener("input", (e) => { audio.volume = +e.target.value; });
$("vol-synth").addEventListener("input", (e) => {
  ensureAudioCtx();
  if (synth.master) synth.master.gain.value = +e.target.value * 0.5;
  resetSynth();
});

// --------------------------------------------------------------------------- //
// Sintetizador simple para escuchar las notas detectadas
// --------------------------------------------------------------------------- //
const synth = { ctx: null, master: null, voices: new Set(), until: 0 };

function ensureAudioCtx() {
  if (synth.ctx) return;
  synth.ctx = new AudioContext();
  synth.master = synth.ctx.createGain();
  synth.master.gain.value = +$("vol-synth").value * 0.5;
  synth.master.connect(synth.ctx.destination);
}

function resetSynth() {
  for (const v of synth.voices) { try { v.stop(); } catch (_) { /* ya parada */ } }
  synth.voices.clear();
  synth.until = audio.currentTime;
}

function scheduleSynth() {
  if (!synth.ctx || audio.paused || +$("vol-synth").value === 0) return;
  const now = audio.currentTime, ahead = now + 0.25;
  if (synth.until >= ahead) return;
  const ctx = synth.ctx;
  for (const n of shown) {
    if (n.start < synth.until) continue;
    if (n.start >= ahead) break;
    const when = ctx.currentTime + Math.max(0, n.start - now);
    const len = Math.min(Math.max(n.end - n.start, 0.08), 4);
    const freq = 440 * 2 ** ((n.pitch - 69) / 12);
    const g = ctx.createGain();
    const peak = 0.05 + 0.25 * (n.velocity / 127);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.4, when + Math.min(len, 0.4));
    g.gain.setValueAtTime(peak * 0.4, when + len);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.15);
    g.connect(synth.master);
    for (const [type, mult, amp] of [["triangle", 1, 1], ["sine", 2, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(when);
      o.stop(when + len + 0.2);
      synth.voices.add(o);
      o.onended = () => synth.voices.delete(o);
    }
  }
  synth.until = ahead;
}

// --------------------------------------------------------------------------- //
// Piano roll + teclado
// --------------------------------------------------------------------------- //
const roll = $("roll"), kb = $("keyboard");
const rctx = roll.getContext("2d"), kctx = kb.getContext("2d");

function fitCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return dpr;
}

function centerView(t) {
  const w = roll.clientWidth - KEYS_W;
  state.viewStart = Math.max(0, t - (w / state.pxPerSec) * 0.25);
}

function drawRoll(t) {
  const dpr = fitCanvas(roll);
  const W = roll.clientWidth, H = roll.clientHeight;
  const ctx = rctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const lo = state.pitchLo, hi = state.pitchHi, rows = hi - lo + 1;
  const rowH = (H - RULER_H) / rows;
  const pps = state.pxPerSec;
  const v0 = state.viewStart, v1 = v0 + (W - KEYS_W) / pps;
  const yOf = (p) => RULER_H + (hi - p) * rowH;
  const xOf = (s) => KEYS_W + (s - v0) * pps;

  // Fondo por filas
  for (let p = lo; p <= hi; p++) {
    ctx.fillStyle = BLACK.has(p % 12) ? "#13151b" : "#191b22";
    ctx.fillRect(KEYS_W, yOf(p), W - KEYS_W, rowH);
    if (p % 12 === 0) {
      ctx.fillStyle = "#2a2e39";
      ctx.fillRect(KEYS_W, yOf(p) + rowH - 1, W - KEYS_W, 1);
    }
  }

  // Líneas de tiempo
  const step = pps > 200 ? 0.5 : pps > 60 ? 1 : pps > 30 ? 2 : 5;
  ctx.fillStyle = "#101116";
  ctx.fillRect(KEYS_W, 0, W - KEYS_W, RULER_H);
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  for (let s = Math.floor(v0 / step) * step; s <= v1; s += step) {
    const x = xOf(s);
    if (x < KEYS_W) continue;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x, RULER_H, 1, H - RULER_H);
    ctx.fillStyle = "#8b8f9c";
    ctx.fillText(fmt(s) + (step < 1 && s % 1 ? ".5" : ""), x + 3, RULER_H / 2);
  }

  // Notas
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEYS_W, RULER_H, W - KEYS_W, H - RULER_H);
  ctx.clip();
  for (const n of shown) {
    if (n.start > v1) break;
    if (n.end < v0) continue;
    const x = xOf(n.start), w = Math.max(2, (n.end - n.start) * pps - 1);
    const y = yOf(n.pitch) + 1, h = Math.max(2, rowH - 2);
    const active = t >= n.start && t < n.end;
    ctx.globalAlpha = active ? 1 : 0.35 + 0.6 * (n.velocity / 127);
    ctx.fillStyle = n.color;
    ctx.fillRect(x, y, w, h);
    if (active) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Teclado vertical
  const activeColors = activeMap(t);
  for (let p = lo; p <= hi; p++) {
    const black = BLACK.has(p % 12);
    const y = yOf(p);
    ctx.fillStyle = activeColors.get(p) || (black ? "#2b2d35" : "#d9dbe2");
    ctx.fillRect(0, y, KEYS_W - (black ? 16 : 0), rowH);
    ctx.fillStyle = "#0e0f13";
    ctx.fillRect(0, y + rowH - 0.5, KEYS_W, 0.5);
    if (p % 12 === 0 && rowH >= 7) {
      ctx.fillStyle = activeColors.has(p) ? "#fff" : "#444";
      ctx.font = `${Math.min(10, rowH)}px -apple-system, sans-serif`;
      ctx.fillText(noteName(p), KEYS_W - 26, y + rowH / 2);
    }
  }
  ctx.fillStyle = "#101116";
  ctx.fillRect(0, 0, KEYS_W, RULER_H);
  ctx.fillStyle = "#2a2e39";
  ctx.fillRect(KEYS_W - 1, 0, 1, H);

  // Cabezal de reproducción
  const px = xOf(t);
  if (px >= KEYS_W && px <= W) {
    ctx.fillStyle = "#ff5c7a";
    ctx.fillRect(px - 1, 0, 2, H);
  }
}

function activeMap(t) {
  const m = new Map();
  for (const n of shown) {
    if (n.start > t) break;
    if (n.end > t) m.set(n.pitch, n.color);
  }
  return m;
}

function drawKeyboard(t) {
  const dpr = fitCanvas(kb);
  const W = kb.clientWidth, H = kb.clientHeight;
  const ctx = kctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0e0f13";
  ctx.fillRect(0, 0, W, H);

  const active = activeMap(t);
  const whites = [];
  for (let p = LOW; p <= HIGH; p++) if (!BLACK.has(p % 12)) whites.push(p);
  const ww = W / whites.length;
  const xWhite = new Map(whites.map((p, i) => [p, i * ww]));

  for (const p of whites) {
    const x = xWhite.get(p);
    ctx.fillStyle = active.get(p) || "#e9eaef";
    ctx.fillRect(x + 0.5, 0, ww - 1, H);
    if (p % 12 === 0) {
      ctx.fillStyle = active.has(p) ? "#fff" : "#777";
      ctx.font = `${Math.min(10, ww * 0.6)}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(noteName(p), x + ww / 2, H - 8);
      ctx.textAlign = "left";
    }
  }
  const bw = ww * 0.62, bh = H * 0.62;
  for (let p = LOW; p <= HIGH; p++) {
    if (!BLACK.has(p % 12)) continue;
    const x = xWhite.get(p - 1) + ww - bw / 2;
    ctx.fillStyle = active.get(p) || "#1b1c22";
    ctx.fillRect(x, 0, bw, bh);
  }
}

function frame() {
  requestAnimationFrame(frame);
  if (!$("result").hidden) {
    const t = audio.currentTime || 0;
    const dur = duration();
    if (state.follow && !audio.paused) {
      const w = roll.clientWidth - KEYS_W;
      const rel = (t - state.viewStart) * state.pxPerSec;
      if (rel > w * 0.75 || rel < 0) centerView(t);
    }
    if (!$("tab-roll").hidden) drawRoll(t);
    drawKeyboard(t);
    $("time").textContent = `${fmt(t)} / ${fmt(dur)}`;
    if (document.activeElement !== $("seek")) $("seek").value = dur ? (t / dur) * 1000 : 0;
    scheduleSynth();
  }
}
requestAnimationFrame(frame);

// Interacción con el piano roll: clic = ir a ese momento, rueda/arrastre = desplazar.
let drag = null;
roll.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, start: state.viewStart, moved: false };
  roll.setPointerCapture(e.pointerId);
});
roll.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 3) drag.moved = true;
  if (drag.moved) state.viewStart = Math.max(0, drag.start - dx / state.pxPerSec);
});
roll.addEventListener("pointerup", (e) => {
  if (drag && !drag.moved) {
    const x = e.clientX - roll.getBoundingClientRect().left;
    if (x > KEYS_W) seek(state.viewStart + (x - KEYS_W) / state.pxPerSec);
  }
  drag = null;
});
roll.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    state.pxPerSec = Math.min(400, Math.max(20, state.pxPerSec * (e.deltaY > 0 ? 0.9 : 1.1)));
    $("zoom").value = state.pxPerSec;
  } else {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    state.viewStart = Math.max(0, state.viewStart + d / state.pxPerSec);
  }
}, { passive: false });

// --------------------------------------------------------------------------- //
// Exportar MIDI (respeta el filtro de notas débiles y las pistas visibles)
// --------------------------------------------------------------------------- //
function downloadMidi(tracks, filename) {
  const PPQ = 480, TEMPO = 500000;               // 120 BPM → 960 ticks por segundo
  const ticks = (s) => Math.round(s * PPQ * 1e6 / TEMPO);
  const vlq = (n) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (id, data) => [...str(id), ...u32(data.length), ...data];

  const tempoTrack = [0, 0xff, 0x51, 3, (TEMPO >> 16) & 255, (TEMPO >> 8) & 255, TEMPO & 255,
                      0, 0xff, 0x2f, 0];
  const chunks = [chunk("MTrk", tempoTrack)];

  tracks.forEach((t, i) => {
    const ch = i >= 9 ? i + 1 : i;                // el canal 10 (9) es de percusión
    const events = [];
    for (const n of t.notes) {
      if (n.velocity < state.minVel) continue;
      events.push([ticks(n.start), 1, 0x90 | ch, n.pitch, n.velocity]);
      events.push([ticks(n.end), 0, 0x80 | ch, n.pitch, 0]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const name = unescape(encodeURIComponent(t.label));
    const data = [0, 0xff, 0x03, ...vlq(name.length), ...str(name), 0, 0xc0 | ch, t.program & 127];
    let last = 0;
    for (const [tick, , status, a, b] of events) {
      data.push(...vlq(tick - last), status, a, b);
      last = tick;
    }
    data.push(0, 0xff, 0x2f, 0);
    chunks.push(chunk("MTrk", data));
  });

  const header = chunk("MThd", [0, 1, 0, chunks.length, (PPQ >> 8) & 255, PPQ & 255]);
  const bytes = new Uint8Array([...header, ...chunks.flat()]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --------------------------------------------------------------------------- //
// Inicio
// --------------------------------------------------------------------------- //
(async () => {
  try {
    const info = await (await fetch("/api/info")).json();
    $("device-badge").textContent = info.device === "mps" ? "GPU Apple (Metal) activa" : "CPU";
    if (!info.piano_hq) {
      $("piano-hq").checked = false;
      $("piano-hq").disabled = true;
      $("piano-hq").closest("label").title = "Falta descargar el modelo de ByteDance (ejecuta instalar.sh)";
    }
  } catch (_) { /* el servidor responde abajo */ }
  await loadHistory();
  const id = location.hash.slice(1);
  if (/^[a-f0-9]{12}$/.test(id)) openJob(id);
})();
