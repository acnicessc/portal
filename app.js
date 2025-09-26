/* =========================================================
   AI Marketplace — app.js (full drop-in)
   - Catalog → Details → Request → Review → Workspace
   - Gateway (routes/policies), My Services (keys)
   - NEW: Usage (mock telemetry, charts, tables, exports, alerts)
   - NEW: Governance (export charter)
   ========================================================= */
"use strict";

/* ================ DOM helpers ================ */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
const fmtNum = (n) => (Number.isFinite(+n) ? (+n).toLocaleString() : "—");
const fmtPct = (n, d = 1) => (Number.isFinite(+n) ? `${(+n).toFixed(d)}%` : "—");
const fmtMs  = (n) => (Number.isFinite(+n) ? `${Math.round(n)} ms` : "—");

/* ================ Minimal state ================ */
const STORAGE = "aimkt_requests_v1";

const state = {
  currentView: "catalog",
  currentModel: null,

  // Requests flow
  requests: loadRequests(), // [{id, model, dept, status, submitted}]

  // Gateway settings
  keys: [
    { dept: "IRCC", created: "2025-09-01", status: "Active", quota: "100,000 / 50 RPS" },
    { dept: "ESDC", created: "2025-09-05", status: "Active", quota: "80,000 / 30 RPS" }
  ],
  policies: { size: "1 MB", timeout: "60 s", concurrency: 50 },

  // Drawer (My Services → Manage key)
  svcPendingKey: null,
  svcRevealed: false,
  currentService: "CANChat",

  // ===== Usage (mock) =====
  usage: {
    timeRange: "24h",             // 24h | 7d | 30d
    dim: "dept",                  // dept | service | route | key | env
    legends: { CANChat: true, Cohere: true },
    tokenShow: { in: true, out: true, avg: false },
    alerts: { err: 2, p95: 1500, spend: 500 },
    series: null,                 // generated on boot / filter apply
    kpis: null,                   // computed KPIs
    breakdowns: null,             // tables data
    heat: null,                   // 7x24
    errors: null,                 // top error classes + failure timeline
    spend: null,                  // spend table
    quotas: null,                 // quotas table
    safety: null,                 // safety categories
    promptHist: null              // prompt length distribution
  }
};

/* ================ Storage ================ */
function loadRequests() {
  try { return JSON.parse(localStorage.getItem(STORAGE)) || []; }
  catch { return []; }
}
function saveRequests(list) {
  localStorage.setItem(STORAGE, JSON.stringify(list));
}

/* =========================================================
   Router (top nav + in-page route buttons)
   ========================================================= */
function setView(view) {
  state.currentView = view;
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = $(`.view[data-view="${view}"]`);
  if (target) target.classList.add("active");

  $$("header nav a").forEach(a => a.classList.remove("active"));
  const nav = $(`header nav a[data-route="${view}"]`);
  if (nav) nav.classList.add("active");

  // Lazy render
  if (view === "requests") renderRequests();
  if (view === "gateway")  renderKeysTable();
  if (view === "usage")    renderUsageAll();
}
function wireRoutes() {
  $$('a[data-route], button[data-route]').forEach(el => {
    on(el, "click", (e) => {
      e.preventDefault();
      const r = el.getAttribute("data-route");
      if (r) setView(r);
    });
  });
}

/* =========================================================
   Catalog → Details → Request
   (cards/buttons defined in index.html)
   ========================================================= */
function wireCatalog() {
  $$('[data-view-model]').forEach(btn => {
    on(btn, "click", () => openDetails(btn.getAttribute("data-view-model")));
  });
  $$('[data-quick-request]').forEach(btn => {
    on(btn, "click", () => {
      const model = btn.getAttribute("data-quick-request");
      openDetails(model);
      setView("request");
      $("#reqModelHeader").textContent = model;
    });
  });
}
function openDetails(modelName) {
  state.currentModel = modelName;
  $("#detailsTitle").textContent = modelName;
  $("#reqModelHeader").textContent = modelName;
  // Simple mock meta
  $("#detailsMeta").textContent = (modelName.includes("Cohere")
    ? "Provider: Cohere · API · Unclassified/PBMM"
    : "Provider: SSC · Hosted · Protected B (pilot)");
  $("#detailsDesc").textContent = "Instruction-tuned model for chat/RAG. Bilingual. Department-scoped logging.";
  setView("details");
}

/* ===== Request form ===== */
function wireRequestForm() {
  on($("#btnSubmitRequest"), "click", () => {
    const dept = $("#dept").value.trim() || "SSC";
    const model = state.currentModel || $("#reqModelHeader").textContent || "Model";
    const id = `REQ-${String(state.requests.length + 1).padStart(4, "0")}`;
    const now = new Date();
    state.requests.unshift({
      id,
      model,
      dept,
      status: "Submitted",
      submitted: now.toISOString().slice(0, 10)
    });
    saveRequests(state.requests);
    $("#reqMsg").textContent = `Request ${id} submitted. Proceed to Governance review.`;
    setView("requests");
  });
}

/* ===== Requests view + Governance review / Workspace demo ===== */
function renderRequests() {
  const tbody = $("#requestsTbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!state.requests.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No requests yet.</td></tr>`;
    return;
  }
  state.requests.forEach(req => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${req.id}</td>
      <td>${req.model}</td>
      <td>${req.dept}</td>
      <td>${req.status}</td>
      <td>${req.submitted}</td>
      <td>
        <button class="btn ghost" data-open-review="${req.id}">Review</button>
      </td>`;
    tbody.appendChild(tr);
  });
  $$('[data-open-review]').forEach(b => {
    on(b, "click", () => {
      $("#revRef").textContent = b.getAttribute("data-open-review");
      setView("review");
    });
  });

  on($("#btnApproveProvision"), "click", () => {
    const ref = $("#revRef").textContent;
    // Mark request as approved
    const req = state.requests.find(r => r.id === ref);
    if (req) req.status = "Approved";
    saveRequests(state.requests);

    // Move to workspace demo
    $("#wsModel").textContent = req?.model || "CANChat (SSC-Hosted)";
    $("#wsEndpoint").textContent = (req?.model && req.model.includes("Cohere"))
      ? "https://api.ssc.gc.ca/ai/provider/v1/chat"
      : "https://api.ssc.gc.ca/ai/canchat/v1/chat";
    $("#wsKey").textContent = "gcai_********************************";
    setView("workspace");
  });
}

/* =========================================================
   Gateway (routes & policies) + Keys (My Services)
   ========================================================= */
function wireGatewayPolicies() {
  on($("#btnSavePolicies"), "click", () => {
    state.policies.size = $("#limitSize").value.trim();
    state.policies.timeout = $("#limitTimeout").value.trim();
    state.policies.concurrency = +$("#limitConc").value || state.policies.concurrency;
    $("#policiesMsg").textContent = "Saved.";
    setTimeout(() => $("#policiesMsg").textContent = "", 1500);
  });
}
function renderKeysTable() {
  const tbody = $("#keysTbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  state.keys.forEach(k => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${k.dept}</td>
      <td>${k.created}</td>
      <td>${k.status}</td>
      <td>${k.quota}</td>
      <td>
        <button class="btn ghost" data-manage-key data-dept="${k.dept}" data-service="CANChat">Manage</button>
      </td>`;
    tbody.appendChild(tr);
  });
  $$('[data-manage-key]').forEach(b => on(b, "click", () => openKeyDrawer(b)));
}
function wireKeyIssue() {
  on($("#btnIssueKey"), "click", () => {
    const dept = $("#deptSelect").value;
    const calls = $("#quotaCalls").value;
    const rps = $("#quotaRps").value;
    const key = `gcai_${crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 24)}`;
    state.svcPendingKey = key;
    $("#issueMsg").textContent = `Key created for ${dept}. Reveal once below.`;
    $("#keyReveal").style.display = "flex";
    $("#secretMask").textContent = "••••••••••••••••••••••••••••••••••••••••";
    state.keys.unshift({
      dept,
      created: new Date().toISOString().slice(0,10),
      status: "Active",
      quota: `${fmtNum(calls)} / ${fmtNum(rps)} RPS`
    });
    renderKeysTable();
  });
  on($("#revealBtn"), "click", () => {
    if (!state.svcPendingKey) return;
    $("#secretMask").textContent = state.svcPendingKey;
    // One-time reveal
    state.svcPendingKey = null;
  });
  on($("#copyBtn"), "click", async () => {
    const text = $("#secretMask").textContent;
    try { await navigator.clipboard.writeText(text); $("#issueMsg").textContent = "Copied."; }
    catch { $("#issueMsg").textContent = "Copy failed."; }
    setTimeout(() => $("#issueMsg").textContent = "", 1500);
  });
}
function openKeyDrawer(btn) {
  const dept = btn.getAttribute("data-dept");
  const svc  = btn.getAttribute("data-service");
  $("#drawerTitle").textContent = `${dept} — ${svc}`;
  $("#endpoint").textContent = (svc === "Cohere") ? "/v1/provider/chat" : "/v1/canchat/chat";
  $("#quota").textContent = (svc === "Cohere") ? "80k calls / 30 RPS" : "100k calls / 50 RPS";
  $("#secret").textContent = "••••••••••••••••••••••••••••••••••••••••";
  $("#keyDrawer").classList.add("open");
  $("#keyDrawer").setAttribute("aria-hidden", "false");
}
function wireKeyDrawer() {
  on($("#btnCloseDrawer"), "click", () => {
    $("#keyDrawer").classList.remove("open");
    $("#keyDrawer").setAttribute("aria-hidden", "true");
  });
  on($("#svcRevealBtn"), "click", () => {
    if (state.svcRevealed) { $("#opMsg").textContent = "Key already revealed once."; return; }
    const k = `gcai_${crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 28)}`;
    $("#secret").textContent = k;
    $("#opMsg").textContent = "Copy this key now; it won't be shown again.";
    state.svcRevealed = true;
  });
  on($("#svcCopyBtn"), "click", async () => {
    try { await navigator.clipboard.writeText($("#secret").textContent); $("#opMsg").textContent = "Copied."; }
    catch { $("#opMsg").textContent = "Copy failed."; }
    setTimeout(() => $("#opMsg").textContent = "", 1500);
  });
  on($("#svcRotateBtn"), "click", () => { $("#opMsg").textContent = "Key rotated."; setTimeout(()=>$("#opMsg").textContent="",1200); });
  on($("#svcRevokeBtn"), "click", () => { $("#opMsg").textContent = "Key revoked."; setTimeout(()=>$("#opMsg").textContent="",1200); });
}

/* =========================================================
   USAGE — mock generator
   ========================================================= */
function rng(seed = 1) { return () => (seed = (seed * 9301 + 49297) % 233280) / 233280; }

function genUsage(range = "24h", legends = { CANChat: true, Cohere: true }) {
  const steps = (range === "24h" ? 24 : range === "7d" ? 7 * 24 : 30 * 24);
  const stepHours = 1;
  const r = rng(42);
  const mk = (base, wobble = 0.25) => Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    const wave = 1 + 0.6 * Math.sin(t * 6.28 * 2) + 0.3 * Math.sin(t * 6.28 * 7);
    const noise = (r() - 0.5) * wobble;
    return Math.max(0, Math.round(base * wave * (1 + noise)));
  });

  // Requests per step (service legend)
  const canchat = mk(range === "24h" ? 20 : 200);
  const cohere  = mk(range === "24h" ? 14 : 150);

  // Latency percentiles
  const p50 = mk(450, 0.18).map(v => v + 200);
  const p95 = mk(900, 0.22).map(v => v + 600);

  // Tokens per step (total platform)
  const tokIn  = mk(range === "24h" ? 5000 : 50000, 0.3);
  const tokOut = mk(range === "24h" ? 4000 : 40000, 0.3);

  // Failures + reasons
  const fails    = mk(range === "24h" ? 1 : 8, 0.7);
  const timeouts = mk(range === "24h" ? 0.4 : 3, 0.8);
  const sizelim  = mk(range === "24h" ? 0.3 : 2.5, 0.8);

  // Throughput (RPS)
  const rps = mk(range === "24h" ? 2.2 : 1.6, 0.4).map(v => +(v / 10).toFixed(2));

  // Cost model
  const rateIn  = { CANChat: 0.0000005, Cohere: 0.0000010 };
  const rateOut = { CANChat: 0.0000015, Cohere: 0.0000020 };

  const callsCAN = canchat.reduce((a, b) => a + b, 0);
  const callsCOH = cohere.reduce((a, b) => a + b, 0);

  // Split token totals by legend (55/45)
  const tokens = {
    CANChat: { in: Math.round(tokIn.reduce((a, b) => a + b, 0) * 0.55), out: Math.round(tokOut.reduce((a, b) => a + b, 0) * 0.55) },
    Cohere:  { in: Math.round(tokIn.reduce((a, b) => a + b, 0) * 0.45), out: Math.round(tokOut.reduce((a, b) => a + b, 0) * 0.45) }
  };
  const spendCAN = tokens.CANChat.in * rateIn.CANChat + tokens.CANChat.out * rateOut.CANChat;
  const spendCOH = tokens.Cohere.in  * rateIn.Cohere  + tokens.Cohere.out  * rateOut.Cohere;

  const kpis = {
    calls: callsCAN + callsCOH,
    callsDelta: +((r() - 0.5) * 12).toFixed(1),
    activeKeys: 28,
    latencyP50: Math.round(p50.reduce((a, b) => a + b, 0) / p50.length),
    latencyP95: Math.round(p95.reduce((a, b) => a + b, 0) / p95.length),
    errRate: +((fails.reduce((a, b) => a + b, 0) / (callsCAN + callsCOH)) * 100).toFixed(2),
    tokensIn: tokens.CANChat.in + tokens.Cohere.in,
    tokensOut: tokens.CANChat.out + tokens.Cohere.out,
    spend: +(spendCAN + spendCOH).toFixed(2),
    quotaMaxPct: 72,
    rpsPeak: Math.max(...rps.map(v => v)),
    ragHit: 0.63,
    citeCoverage: 0.48
  };

  // Heatmap (7 × 24) from request steps
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  [...canchat.map((v, i) => ({ v, i })), ...cohere.map((v, i) => ({ v, i }))].forEach(({ v, i }) => {
    const d = Math.floor(i / 24) % 7;
    const h = i % 24;
    heat[d][h] += v;
  });

  // Errors & reliability tables
  const totalFails = fails.reduce((a, b) => a + b, 0);
  const failTimeline = fails; // reuse for mini chart
  const errTop = [
    { route: "/v1/canchat/chat", pct: +((totalFails * 0.56) / Math.max(totalFails, 1) * 100).toFixed(1), sample: "413 Payload too large" },
    { route: "/v1/provider/chat", pct: +((totalFails * 0.44) / Math.max(totalFails, 1) * 100).toFixed(1), sample: "504 Upstream timeout" }
  ];

  // Spend & quotas tables
  const spendTbl = [
    { pr: "CANChat /v1/canchat/chat", calls: callsCAN, tok: `${fmtNum(tokens.CANChat.in)} / ${fmtNum(tokens.CANChat.out)}`, cost: `$${spendCAN.toFixed(2)}` },
    { pr: "Cohere /v1/provider/chat", calls: callsCOH, tok: `${fmtNum(tokens.Cohere.in)} / ${fmtNum(tokens.Cohere.out)}`, cost: `$${spendCOH.toFixed(2)}` }
  ];
  const quotasTbl = [
    { dept: "IRCC", calls: Math.round(kpis.calls * 0.34), rps: +(kpis.rpsPeak * 0.8).toFixed(2), used: 73 },
    { dept: "ESDC", calls: Math.round(kpis.calls * 0.26), rps: +(kpis.rpsPeak * 0.7).toFixed(2), used: 64 },
    { dept: "CRA",  calls: Math.round(kpis.calls * 0.22), rps: +(kpis.rpsPeak * 0.6).toFixed(2), used: 51 },
    { dept: "HC",   calls: Math.round(kpis.calls * 0.10), rps: +(kpis.rpsPeak * 0.4).toFixed(2), used: 37 },
    { dept: "TBS",  calls: Math.round(kpis.calls * 0.08), rps: +(kpis.rpsPeak * 0.3).toFixed(2), used: 29 }
  ];

  // Breakdown tables
  const breakdowns = {
    dept: [
      { dept: "IRCC", calls: Math.round(kpis.calls * 0.34), p95: 1700, err: 1.2, tokens: "42M / 30M", cost: `$${(kpis.spend * 0.33).toFixed(2)}`, quota: "73%" },
      { dept: "ESDC", calls: Math.round(kpis.calls * 0.26), p95: 1600, err: 0.9, tokens: "31M / 22M", cost: `$${(kpis.spend * 0.26).toFixed(2)}`, quota: "64%" },
      { dept: "CRA",  calls: Math.round(kpis.calls * 0.22), p95: 1680, err: 1.5, tokens: "26M / 19M", cost: `$${(kpis.spend * 0.22).toFixed(2)}`, quota: "51%" },
      { dept: "HC",   calls: Math.round(kpis.calls * 0.10), p95: 1750, err: 1.0, tokens: "12M / 8M",  cost: `$${(kpis.spend * 0.10).toFixed(2)}`, quota: "37%" },
      { dept: "TBS",  calls: Math.round(kpis.calls * 0.08), p95: 1620, err: 0.8, tokens: "10M / 7M",  cost: `$${(kpis.spend * 0.09).toFixed(2)}`, quota: "29%" }
    ],
    service: [
      { service: "CANChat", calls: callsCAN, p95: 1650, err: 1.1, tokens: `${fmtNum(tokens.CANChat.in)} / ${fmtNum(tokens.CANChat.out)}`, sensitivity: "Protected B (pilot)" },
      { service: "Cohere Command A", calls: callsCOH, p95: 1720, err: 1.3, tokens: `${fmtNum(tokens.Cohere.in)} / ${fmtNum(tokens.Cohere.out)}`, sensitivity: "Unclassified/PBMM" }
    ],
    route: [
      { route: "/v1/canchat/chat", calls: callsCAN, p95: 1650, throttles: 23, breaches: 8 },
      { route: "/v1/provider/chat", calls: callsCOH, p95: 1720, throttles: 14, breaches: 11 }
    ],
    key: [
      { key: "IRCC-prod-A…", dept: "IRCC", scope: "canchat:chat", calls: Math.round(callsCAN * 0.22), last: "2025-09-25 09:41" },
      { key: "IRCC-pilot-B…", dept: "IRCC", scope: "provider:chat", calls: Math.round(callsCOH * 0.12), last: "2025-09-25 09:05" },
      { key: "ESDC-prod-A…", dept: "ESDC", scope: "canchat:chat", calls: Math.round(callsCAN * 0.18), last: "2025-09-25 08:44" }
    ]
  };

  // Safety / content signals
  const safetyCats = [
    { cat: "PII detected", count: Math.round(totalFails * 1.3 + 9) },
    { cat: "Unsafe content", count: Math.round(totalFails * 0.8 + 6) },
    { cat: "Policy redactions", count: Math.round(totalFails * 0.5 + 4) }
  ];
  const promptHist = [
    { bucket: "<200", count: Math.round(kpis.calls * 0.21) },
    { bucket: "200–500", count: Math.round(kpis.calls * 0.38) },
    { bucket: "500–1000", count: Math.round(kpis.calls * 0.27) },
    { bucket: "1000+", count: Math.round(kpis.calls * 0.14) }
  ];

  // Return shaped series for charts
  return {
    steps,
    labels: Array.from({ length: steps }, (_, i) => i), // hour index
    req: { CANChat: canchat, Cohere: cohere },
    p50, p95,
    rps,
    tokIn, tokOut,
    timeouts, sizelim,
    errors: { errTop, failTimeline, retries: Math.round(totalFails * 4.2 + 17), throttles: Math.round(totalFails * 3.1 + 12) },
    kpis,
    heat,
    spend: spendTbl,
    quotas: quotasTbl,
    breakdowns,
    safety: safetyCats,
    promptHist
  };
}

/* =========================================================
   USAGE — rendering
   (tiny canvas helpers; no external libs)
   ========================================================= */
function pxCanvas(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = canvas.getAttribute("width") | 0;
  const h = canvas.getAttribute("height") | 0;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  return { ctx, w, h };
}
function drawAxes(ctx, w, h, pad = 24) {
  ctx.strokeStyle = "#e6edf3"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad); ctx.stroke();
  return { x0: pad, y0: h - pad, x1: w - pad, y1: pad };
}
function scaleY(v, min, max, y0, y1) {
  if (max <= min) max = min + 1;
  const t = (v - min) / (max - min);
  return y0 - (y0 - y1) * t;
}
function drawLine(ctx, pts, color = "#335075") {
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}
function drawAreaStack(ctx, series, color = "#dfe8f5") {
  // series: [{x, yBottom, yTop}]
  ctx.fillStyle = color; ctx.beginPath();
  series.forEach((p, i) => (i ? ctx.lineTo(p.x, p.yTop) : ctx.moveTo(p.x, p.yTop)));
  for (let i = series.length - 1; i >= 0; i--) ctx.lineTo(series[i].x, series[i].yBottom);
  ctx.closePath(); ctx.fill();
}
function drawBars(ctx, xValues, yValues, rect, color = "#cfe0ff") {
  const { x0, x1, y0, y1 } = rect;
  const n = xValues.length, bw = Math.max(1, (x1 - x0) / n * 0.6);
  ctx.fillStyle = color;
  xValues.forEach((_, i) => {
    const x = x0 + (i + 0.2) * ((x1 - x0) / n);
    const y = scaleY(yValues[i], 0, Math.max(...yValues)*1.1, y0, y1);
    ctx.fillRect(x, y, bw, y0 - y);
  });
}
function drawHeatmap(ctx, grid, rect) {
  const rows = grid.length, cols = grid[0].length;
  const { x0, x1, y0, y1 } = rect;
  const cw = (x1 - x0) / cols, ch = (y0 - y1) / rows;
  const max = Math.max(...grid.flat());
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = grid[r][c] / (max || 1);
    const shade = Math.round(255 - v * 140); // light→darker blue
    ctx.fillStyle = `rgb(${shade},${shade+8},255)`;
    ctx.fillRect(x0 + c * cw, y1 + r * ch, cw - 1, ch - 1);
  }
  ctx.strokeStyle = "#e6edf3"; ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
}

/* ===== Usage: main render orchestrator ===== */
function renderUsageAll() {
  // If no series yet, generate with defaults
  if (!state.usage.series) {
    state.usage.series = genUsage(state.usage.timeRange, state.usage.legends);
  }
  const u = state.usage.series;
  state.usage.kpis = u.kpis;

  renderKpis();
  renderTrafficCharts();
  renderErrorsReliability();
  renderCostQuotas();
  renderBreakdowns();
  renderSafety();

  // Set exports/cURL counters
  wireUsageExports();
}

/* ===== KPI strip ===== */
function kpiCard(cap, val, extra = "", status = "") {
  const pill = status ? `<span class="status-pill ${status}">${status.toUpperCase()}</span>` : "";
  return `<div class="kpi">
    <div class="row" style="justify-content:space-between;gap:6px"><div class="cap">${cap}</div>${pill}</div>
    <div class="val">${val}</div>
    ${extra ? `<div class="delta muted">${extra}</div>` : ""}
  </div>`;
}
function renderKpis() {
  const k = state.usage.kpis;
  const a = state.usage.alerts;
  const breachErr = k.errRate > a.err ? "warn" : "";
  const breachP95 = k.latencyP95 > a.p95 ? "bad" : "";
  const breachSpend = k.spend > a.spend ? "warn" : "";
  const quotaWarn = k.quotaMaxPct > 80 ? "warn" : "";

  $("#kpiStrip").innerHTML = [
    kpiCard("Calls", fmtNum(k.calls), (k.callsDelta >= 0 ? "▲ " : "▼ ") + Math.abs(k.callsDelta) + "% vs prior", ""),
    kpiCard("Active keys", fmtNum(k.activeKeys), "", ""),
    kpiCard("Latency (p50/p95)", `${fmtMs(k.latencyP50)} / ${fmtMs(k.latencyP95)}`, "", breachP95),
    kpiCard("Error rate", fmtPct(k.errRate, 2), "", breachErr),
    kpiCard("Tokens (in/out)", `${fmtNum(k.tokensIn)} / ${fmtNum(k.tokensOut)}`, "", ""),
    kpiCard("Est. cost", `$${k.spend.toFixed(2)}`, "chargeback/provider estimate", breachSpend),
    kpiCard("Quota usage (max)", fmtPct(k.quotaMaxPct, 0), "peak dept", quotaWarn),
    kpiCard("RPS peak", k.rpsPeak.toFixed(2), "", "")
  ].join("");
}

/* ===== Charts: Requests/Latency/RPS/Tokens/Heatmap ===== */
function activeReqSeries(u) {
  // merge only active legends
  const act = Object.entries(state.usage.legends).filter(([k, v]) => v).map(([k]) => k);
  const out = {};
  act.forEach(name => out[name] = u.req[name]);
  return out;
}
function renderTrafficCharts() {
  const u = state.usage.series;
  // Requests stacked area
  (function () {
    const { ctx, w, h } = pxCanvas($("#chReq"));
    const rect = drawAxes(ctx, w, h);
    const series = activeReqSeries(u);
    const all = Object.values(series);
    const n = u.labels.length;
    const max = Math.max(1, ...Array.from({ length: n }, (_, i) => Object.values(series).reduce((s, arr) => s + (arr?.[i] || 0), 0)));
    const x = (i) => rect.x0 + (i / (n - 1)) * (rect.x1 - rect.x0);

    // Build stacked bands CANChat then Cohere (order for visual)
    const order = ["CANChat", "Cohere"].filter(k => series[k]);
    let bottom = Array(n).fill(0);
    order.forEach((name, idx) => {
      const arr = series[name];
      const band = Array.from({ length: n }, (_, i) => bottom[i] + (arr?.[i] || 0));
      const areaPts = band.map((v, i) => ({
        x: x(i),
        yTop: scaleY(v, 0, max, rect.y0, rect.y1),
        yBottom: scaleY(bottom[i], 0, max, rect.y0, rect.y1)
      }));
      drawAreaStack(ctx, areaPts, idx === 0 ? "#e2efff" : "#cfe0ff");
      bottom = band;
    });
    // small gridline
    ctx.fillStyle = "#6b85a6"; ctx.fillText("Requests", rect.x0 + 4, rect.y1 + 12);
  })();

  // Latency lines
  (function () {
    const { ctx, w, h } = pxCanvas($("#chLat"));
    const rect = drawAxes(ctx, w, h);
    const max = Math.max(...u.p95) * 1.1;
    const n = u.labels.length;
    const x = (i) => rect.x0 + (i / (n - 1)) * (rect.x1 - rect.x0);
    const p50 = u.p50.map((v, i) => ({ x: x(i), y: scaleY(v, 0, max, rect.y0, rect.y1) }));
    const p95 = u.p95.map((v, i) => ({ x: x(i), y: scaleY(v, 0, max, rect.y0, rect.y1) }));
    drawLine(ctx, p50, "#5f7fa4");
    drawLine(ctx, p95, "#335075");
    ctx.fillStyle = "#6b85a6"; ctx.fillText("ms", rect.x0 + 4, rect.y1 + 12);
  })();

  // RPS line
  (function () {
    const { ctx, w, h } = pxCanvas($("#chRps"));
    const rect = drawAxes(ctx, w, h);
    const max = Math.max(...u.rps) * 1.2;
    const n = u.labels.length; const x = (i) => rect.x0 + (i / (n - 1)) * (rect.x1 - rect.x0);
    const pts = u.rps.map((v, i) => ({ x: x(i), y: scaleY(v, 0, max, rect.y0, rect.y1) }));
    drawLine(ctx, pts, "#4a6a90");
    ctx.fillStyle = "#6b85a6"; ctx.fillText("RPS", rect.x0 + 4, rect.y1 + 12);
  })();

  // Tokens (in/out, optional avg/req)
  (function () {
    const { ctx, w, h } = pxCanvas($("#chTok"));
    const rect = drawAxes(ctx, w, h);
    const n = u.labels.length; const x = (i) => rect.x0 + (i / (n - 1)) * (rect.x1 - rect.x0);

    // If avg per request toggle is on
    const callsPerStep = Array.from({ length: n }, (_, i) =>
      Object.entries(state.usage.legends).filter(([k, v]) => v).reduce((s, [name, v]) => s + (v ? u.req[name][i] : 0), 0) || 1
    );

    const show = state.usage.tokenShow;
    const tokIn = show.avg ? u.tokIn.map((v, i) => v / Math.max(1, callsPerStep[i])) : u.tokIn;
    const tokOut = show.avg ? u.tokOut.map((v, i) => v / Math.max(1, callsPerStep[i])) : u.tokOut;

    const max = Math.max(...tokIn, ...tokOut) * 1.2;
    if (show.in)  drawLine(ctx, tokIn.map((v, i) => ({ x: x(i), y: scaleY(v, 0, max, rect.y0, rect.y1) })), "#4a6a90");
    if (show.out) drawLine(ctx, tokOut.map((v, i) => ({ x: x(i), y: scaleY(v, 0, max, rect.y0, rect.y1) })), "#26374a");
    ctx.fillStyle = "#6b85a6"; ctx.fillText(show.avg ? "avg tokens/req" : "tokens", rect.x0 + 4, rect.y1 + 12);
  })();

  // Heatmap
  (function () {
    const { ctx, w, h } = pxCanvas($("#chHeat"));
    const rect = drawAxes(ctx, w, h, 34);
    drawHeatmap(ctx, u.heat, rect);
    ctx.fillStyle = "#6b85a6";
    // axis labels
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((d,i)=>ctx.fillText(d, 6, rect.y1 + 14 + (i*((rect.y0-rect.y1)/7))));
    for (let h=0; h<24; h+=4) ctx.fillText(String(h).padStart(2,"0"), rect.x0 + h*((rect.x1-rect.x0)/24)+2, rect.y0+14);
  })();

  // Legend chips (mini + left panel) sync
  $$(".mini-legend [data-legend], #legendChips [data-legend]").forEach(ch => {
    const name = ch.getAttribute("data-legend");
    ch.classList.toggle("active", !!state.usage.legends[name]);
  });
}

/* ===== Errors & reliability ===== */
function renderErrorsReliability() {
  const u = state.usage.series;
  // Top error classes
  const tbody = $("#tblErrTop");
  tbody.innerHTML = "";
  u.errors.errTop.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.route}</td><td>${r.pct}%</td><td class="muted">${r.sample}</td>`;
    tbody.appendChild(tr);
  });
  // Failure timeline
  (function () {
    const { ctx, w, h } = pxCanvas($("#chFail"));
    const rect = drawAxes(ctx, w, h);
    drawBars(ctx, u.labels, u.errors.failTimeline, rect, "#ffd0d0");
  })();
  // Timeouts vs size limits
  (function () {
    const { ctx, w, h } = pxCanvas($("#chTimeSize"));
    const rect = drawAxes(ctx, w, h);
    drawBars(ctx, [0,1], [
      u.timeouts.reduce((a,b)=>a+b,0),
      u.sizelim.reduce((a,b)=>a+b,0)
    ], rect, "#ffe7bf");
  })();
  $("#kvRetries").textContent = fmtNum(u.errors.retries);
  $("#kvThrottles").textContent = fmtNum(u.errors.throttles);
}

/* ===== Cost & quotas ===== */
function renderCostQuotas() {
  const u = state.usage.series;
  const spendBody = $("#tblSpend"); spendBody.innerHTML = "";
  u.spend.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.pr}</td><td>${fmtNum(r.calls)}</td><td>${r.tok}</td><td>${r.cost}</td>`;
    spendBody.appendChild(tr);
  });
  const qBody = $("#tblQuota"); qBody.innerHTML = "";
  u.quotas.forEach(r => {
    const tr = document.createElement("tr");
    const pill = r.used > 80 ? `<span class="status-pill warn">HIGH</span>` : "";
    tr.innerHTML = `<td>${r.dept}</td><td>${fmtNum(r.calls)}</td><td>${r.rps}</td><td>${fmtPct(r.used,0)} ${pill}</td>`;
    qBody.appendChild(tr);
  });
}

/* ===== Breakdowns (sortable/drillable—simple mock) ===== */
function renderBreakdowns(current = "dept") {
  const u = state.usage.series;
  const head = $("#tblBreakHead");
  const body = $("#tblBreakBody");
  const tabBtns = $$("#bdTabs [data-bd]");
  tabBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-bd") === current));

  let rows = [];
  if (current === "dept") {
    head.innerHTML = `<tr><th>Department</th><th>Calls</th><th>p95</th><th>Error%</th><th>Tokens</th><th>Est. cost</th><th>Quota used</th></tr>`;
    rows = state.usage.series.breakdowns.dept.map(d => `<tr>
      <td>${d.dept}</td><td>${fmtNum(d.calls)}</td><td>${d.p95}</td><td>${fmtPct(d.err,1)}</td>
      <td>${d.tokens}</td><td>${d.cost}</td><td>${d.quota}</td></tr>`);
  } else if (current === "service") {
    head.innerHTML = `<tr><th>Service/Model</th><th>Calls</th><th>p95</th><th>Error%</th><th>Tokens</th><th>Sensitivity</th></tr>`;
    rows = state.usage.series.breakdowns.service.map(d => `<tr>
      <td>${d.service}</td><td>${fmtNum(d.calls)}</td><td>${d.p95}</td><td>${fmtPct(d.err,1)}</td>
      <td>${d.tokens}</td><td>${d.sensitivity}</td></tr>`);
  } else if (current === "route") {
    head.innerHTML = `<tr><th>Route</th><th>Calls</th><th>p95</th><th>Throttles</th><th>Policy breaches</th></tr>`;
    rows = state.usage.series.breakdowns.route.map(d => `<tr>
      <td>${d.route}</td><td>${fmtNum(d.calls)}</td><td>${d.p95}</td><td>${d.throttles}</td><td>${d.breaches}</td></tr>`);
  } else if (current === "key") {
    head.innerHTML = `<tr><th>Key</th><th>Dept</th><th>Scope</th><th>Calls</th><th>Last used</th><th>Action</th></tr>`;
    rows = state.usage.series.breakdowns.key.map(d => `<tr>
      <td>${d.key}</td><td>${d.dept}</td><td>${d.scope}</td><td>${fmtNum(d.calls)}</td><td>${d.last}</td>
      <td><button class="btn ghost" data-manage-key data-dept="${d.dept}" data-service="${d.scope.includes("provider")?"Cohere":"CANChat"}">Manage key</button></td></tr>`);
  }
  body.innerHTML = rows.join("");

  // Re-wire any action buttons in table (Manage key deep-link)
  $$('[data-manage-key]').forEach(b => on(b, "click", () => openKeyDrawer(b)));

  // Tab clicks
  $$("#bdTabs [data-bd]").forEach(b => on(b, "click", () => renderBreakdowns(b.getAttribute("data-bd"))));
}

/* ===== Safety / content signals ===== */
function renderSafety() {
  const u = state.usage.series;
  // Prompt length distribution (bars)
  (function () {
    const { ctx, w, h } = pxCanvas($("#chPromptLen"));
    const rect = drawAxes(ctx, w, h);
    const xs = u.promptHist.map(x => x.bucket);
    const ys = u.promptHist.map(x => x.count);
    drawBars(ctx, xs, ys, rect, "#e2efff");
  })();
  // Safety table
  const tb = $("#tblSafety"); tb.innerHTML = "";
  u.safety.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.cat}</td><td>${fmtNum(s.count)}</td>`;
    tb.appendChild(tr);
  });
  $("#kvRagHit").textContent = fmtPct(state.usage.kpis.ragHit*100, 0);
  $("#kvCite").textContent = fmtPct(state.usage.kpis.citeCoverage*100, 0);
}

/* ===== Filters, legends, token toggles, alerts ===== */
function wireUsageControls() {
  on($("#btnApplyUsage"), "click", () => {
    state.usage.timeRange = $("#fTime").value;
    state.usage.dim = $("#fDim").value;
    // sensitivity and result type chips are visual only in mock
    state.usage.series = genUsage(state.usage.timeRange, state.usage.legends);
    renderUsageAll();
  });
  on($("#btnResetUsage"), "click", () => {
    state.usage.timeRange = "24h";
    state.usage.dim = "dept";
    state.usage.legends = { CANChat: true, Cohere: true };
    state.usage.tokenShow = { in: true, out: true, avg: false };
    $("#fTime").value = "24h"; $("#fDim").value = "dept";
    $$("#legendChips .chip").forEach(c => c.classList.add("active"));
    state.usage.series = genUsage("24h", state.usage.legends);
    renderUsageAll();
  });
  // Legend toggles (left + mini legends)
  const toggleLegend = (name) => {
    state.usage.legends[name] = !state.usage.legends[name];
    // re-render all widgets for cross-filter behavior
    renderUsageAll();
  };
  $$("#legendChips [data-legend]").forEach(ch => on(ch, "click", () => toggleLegend(ch.getAttribute("data-legend"))));
  $$(".mini-legend [data-legend]").forEach(ch => on(ch, "click", () => toggleLegend(ch.getAttribute("data-legend"))));

  // Token toggles
  $$('#chTok + .nothing'); // placeholder
  $$('[data-token]').forEach(b => on(b, "click", () => {
    const t = b.getAttribute("data-token");
    b.classList.toggle("active");
    state.usage.tokenShow[t] = b.classList.contains("active");
    renderTrafficCharts();
  }));
  on($("#btnAvgPerReq"), "click", (e) => {
    e.target.classList.toggle("active");
    state.usage.tokenShow.avg = e.target.classList.contains("active");
    renderTrafficCharts();
  });

  // Alerts thresholds
  on($("#btnSaveAlerts"), "click", () => {
    state.usage.alerts.err = +$("#alertErr").value || state.usage.alerts.err;
    state.usage.alerts.p95 = +$("#alertP95").value || state.usage.alerts.p95;
    state.usage.alerts.spend = +$("#alertSpend").value || state.usage.alerts.spend;
    renderKpis();
  });
}

/* ===== Exports (CSV / JSON / cURL) ===== */
function wireUsageExports() {
  // JSON KPIs
  on($("#btnExportJSON"), "click", () => {
    const blob = new Blob([JSON.stringify(state.usage.kpis, null, 2)], { type: "application/json" });
    downloadBlob(blob, "usage_kpis.json");
  });
  // CSV (Breakdowns current tab + spend + quotas)
  on($("#btnExportCSV"), "click", () => {
    const activeTab = $("#tblBreakHead th")?.textContent || "Department";
    const rows = [];
    // Spend
    rows.push("Spend Table");
    rows.push("Provider/Route,Calls,Tokens (in/out),Est. spend");
    state.usage.series.spend.forEach(r => rows.push([r.pr, r.calls, `"${r.tok}"`, r.cost].join(",")));
    rows.push("");
    // Quotas
    rows.push("Quota Table");
    rows.push("Department,Calls used,RPS peak,Quota used");
    state.usage.series.quotas.forEach(r => rows.push([r.dept, r.calls, r.rps, r.used + "%"].join(",")));
    rows.push("");
    // Current breakdown table
    rows.push(`Breakdown — ${activeTab}`);
    const head = $("#tblBreakHead").innerText.replace(/\s+/g, " ").trim();
    rows.push(head.split(" ").join(","));
    $$("#tblBreakBody tr").forEach(tr => {
      const cols = Array.from(tr.children).map(td => `"${td.innerText.replaceAll('"','""')}"`);
      rows.push(cols.join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    downloadBlob(blob, "usage_tables.csv");
  });
  // Copy cURL (API)
  on($("#btnCopyCurl"), "click", async () => {
    const qs = new URLSearchParams({
      time: state.usage.timeRange,
      dim: state.usage.dim,
      legends: Object.entries(state.usage.legends).filter(([k,v])=>v).map(([k])=>k).join(",")
    }).toString();
    const curl = `curl -s "https://api.marketplace.internal/usage?${qs}" -H "Authorization: Bearer <KEY>"`;
    try { await navigator.clipboard.writeText(curl); toast("Copied cURL."); }
    catch { toast("Copy failed."); }
  });
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
function toast(msg) {
  const d = document.createElement("div");
  d.textContent = msg;
  Object.assign(d.style, { position:"fixed", bottom:"18px", right:"18px", background:"#26374a", color:"#fff", padding:"8px 10px", borderRadius:"8px", zIndex:9999 });
  document.body.appendChild(d);
  setTimeout(()=>d.remove(), 1200);
}

/* =========================================================
   GOVERNANCE — content + export (Markdown)
   ========================================================= */
function wireGovernance() {
  on($("#btnGovExport"), "click", () => {
    const md = `# AI Marketplace — Governance & Operating Model (MVP)

**Scope:** Catalog, Gateway, My Services, Usage  
**Data:** Unclassified/PBMM; Protected B (pilot)  
**Controls:** ITSG-33, DADM, departmental TRAs

## Charter
Set guardrails to enable rapid, compliant AI adoption. Balance innovation, cost control, privacy, and security.

## Roles & RACI
- **Platform (SSC):** Own routes, policies, quotas, billing; monitor usage; manage incidents.
- **Departments:** Own keys; ensure app-level safety; steward data.
- **Security & Privacy:** Approve sensitivity & use; oversee audits & exemptions.

## Policies (examples)
- Request size ≤ 1MB; timeout ≤ 60s; concurrency caps at edge.
- Quotas: monthly calls + burst RPS per key.
- Safety: PII detection, unsafe-content flagging, redaction.

## Workflow
1. Request → Automated checks (privacy, threat, licensing, finance)
2. Provision workspace + key
3. Observe in **Usage**; tune policies (Gateway)
4. Quarterly review & renewal

## Change Log
- 2025-09-25: Added Usage dashboard and alerts
- 2025-09-18: Enabled Protected B pilot
`;
    const blob = new Blob([md], { type: "text/markdown" });
    downloadBlob(blob, "governance_charter.md");
  });
}

/* =========================================================
   Boot
   ========================================================= */
function boot() {
  wireRoutes();
  wireCatalog();
  wireRequestForm();
  wireGatewayPolicies();
  wireKeyIssue();
  wireKeyDrawer();
  wireUsageControls();
  wireGovernance();

  // Initial render
  renderKeysTable();          // for Gateway
  state.usage.series = genUsage(state.usage.timeRange, state.usage.legends);
  // Sync alert inputs to defaults
  $("#alertErr").value = state.usage.alerts.err;
  $("#alertP95").value = state.usage.alerts.p95;
  $("#alertSpend").value = state.usage.alerts.spend;

  // Landing view stays as set in HTML (catalog)
}
document.addEventListener("DOMContentLoaded", boot);

// Catalog view toggle (Cards <-> List) with saved preference
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("catalogGrid");
  const btnCards = document.getElementById("viewCards");
  const btnList  = document.getElementById("viewList");
  if (!grid || !btnCards || !btnList) return;

  const setMode = (mode) => {
    grid.setAttribute("data-mode", mode);
    btnCards.setAttribute("aria-pressed", String(mode === "cards"));
    btnList.setAttribute("aria-pressed",  String(mode === "list"));
    try { localStorage.setItem("catalogMode", mode); } catch {}
  };

  // restore preference
  const saved = (localStorage.getItem("catalogMode") || "cards");
  setMode(saved);

  btnCards.addEventListener("click", () => setMode("cards"));
  btnList .addEventListener("click", () => setMode("list"));
});

