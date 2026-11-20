/* USMCA / CUSMA Certification of Origin tool — front end
 * Set CONFIG.API_URL to your Cloudflare Worker URL after deploying worker/worker.js.
 * Add ?demo=1 to the page URL to see a sample result without the AI service.
 */
const CONFIG = {
  API_URL: "", // e.g. "https://usmca-origin.YOUR-SUBDOMAIN.workers.dev"
  TURNSTILE_SITEKEY: "", // optional: Cloudflare Turnstile site key (bot protection)
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  SITE: "jeonghiykang-tech.github.io",
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DEMO = new URLSearchParams(location.search).has("demo");
const state = { bomRows: [], bomPdf: null, lastResult: null, lastInput: null, goods: [] };

/* ---------------- storage (parties only, best effort) ---------------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function setStatus(el, msg, kind = "info", spin = false) {
  el.className = "status " + kind;
  el.innerHTML = (spin ? '<span class="spinner"></span>' : "") + msg;
}
function hsDigits(h) { return String(h || "").replace(/\D/g, ""); }

/* ---------------- stepper ---------------- */
function goto(n) {
  if (n >= 3 && !validateStep2()) return;
  if (n === 4 && !validateStep3()) return;
  for (let i = 1; i <= 4; i++) $("#step" + i).classList.toggle("hidden", i !== n);
  $$("#stepper li").forEach(li => {
    const s = +li.dataset.step;
    li.classList.toggle("active", s === n);
    li.classList.toggle("done", s < n);
  });
  if (n === 4) prefillSign();
  window.scrollTo({ top: $("#stepper").offsetTop - 10, behavior: "smooth" });
}
$$("[data-goto]").forEach(b => b.addEventListener("click", () => goto(+b.dataset.goto)));

/* ---------------- BOM table ---------------- */
const E = window.USMCA_ENGINE;
const BOM_COLS = [
  ["line", "Line", 50], ["part", "Part no.", 90], ["description", "Description", 200], ["hts", "HTS code", 100],
  ["origin", "Country of origin", 70], ["orig", "USMCA originating?", 90], ["value", "Value per unit", 85], ["weight", "Weight per unit (kg)", 85],
];
state.bomRows = [];

function renderBom() {
  const tb = $("#bomTable tbody");
  tb.innerHTML = state.bomRows.map((r, i) => `<tr data-i="${i}">` + BOM_COLS.map(([k]) => {
    if (k === "orig") return `<td><select data-k="orig">${["", "Y", "N"].map(o => `<option value="${o}"${String(r.orig || "").toUpperCase() === o ? " selected" : ""}>${o === "" ? "?" : o === "Y" ? "Yes" : "No"}</option>`).join("")}</select></td>`;
    const type = k === "value" || k === "weight" ? ' type="number" step="any" min="0"' : "";
    return `<td><input data-k="${k}"${type} value="${esc(r[k] ?? "")}"></td>`;
  }).join("") + `<td class="del"><button class="x" title="Remove" data-bomdel="${i}">&times;</button></td></tr>`).join("");
  $("#bomEmpty").classList.toggle("hidden", state.bomRows.length > 0);
}
$("#bomTable").addEventListener("input", e => {
  const k = e.target.dataset.k, tr = e.target.closest("tr");
  if (k && tr) state.bomRows[+tr.dataset.i][k] = e.target.value;
});
$("#bomTable").addEventListener("click", e => {
  if (e.target.dataset.bomdel !== undefined) { state.bomRows.splice(+e.target.dataset.bomdel, 1); renderBom(); }
});
$("#bomAdd").addEventListener("click", () => { state.bomRows.push({ line: String(state.bomRows.length + 1) }); renderBom(); });
$("#bomClear").addEventListener("click", () => { state.bomRows = []; state.bomPdf = null; $("#fileName").textContent = ""; fileInput.value = ""; renderBom(); });

/* map spreadsheet headers to BOM fields */
function mapHeaders(hdr) {
  const used = new Set(), map = {};
  const pick = (key, re) => { const i = hdr.findIndex((h, j) => !used.has(j) && re.test(h)); if (i >= 0) { map[key] = i; used.add(i); } };
  pick("orig", /usmca|cusma|t-mec|originating|qualif/i);
  pick("hts", /\bhts\b|\bhs\b|hs code|tariff|classification/i);
  pick("origin", /country|origin|\bcoo\b/i);
  pick("description", /desc/i);
  pick("part", /part|item no|sku|material no/i);
  pick("line", /^(line|item|#|no\.?|seq)/i);
  pick("weight", /weight|\bkg\b|mass/i);
  pick("value", /extended|ext\.? ?cost|total cost|line value|value|amount/i);
  pick("unitCost", /unit cost|unit price|price|cost/i);
  pick("qty", /qty|quantity|usage/i);
  return map;
}
function rowsFromSheet(rows) {
  const hi = rows.findIndex(r => r.filter(Boolean).length >= 2 && r.some(c => /desc|hts|hs code|part|origin/i.test(String(c))));
  if (hi < 0) throw new Error("Could not find a header row (Description, HTS, Country of origin...).");
  const map = mapHeaders(rows[hi].map(String));
  const out = [];
  rows.slice(hi + 1).forEach(r => {
    const g = k => (map[k] != null ? r[map[k]] : "");
    if (!String(g("description") || g("part") || g("hts")).trim()) return;
    let value = g("value");
    if ((value === "" || value == null) && g("unitCost") !== "" && g("qty") !== "") value = (+g("unitCost") || 0) * (+g("qty") || 0);
    let orig = String(g("orig") || "").trim().toUpperCase();
    orig = /^(Y|YES|TRUE|1)$/.test(orig) ? "Y" : /^(N|NO|FALSE|0)$/.test(orig) ? "N" : "";
    out.push({ line: String(g("line") || out.length + 1), part: String(g("part") || ""), description: String(g("description") || ""), hts: String(g("hts") || ""),
      origin: String(g("origin") || "").trim().toUpperCase().slice(0, 20), orig, value: value === "" || value == null ? "" : +(+value).toFixed(4), weight: g("weight") === "" || g("weight") == null ? "" : +g("weight") });
  });
  return { rows: out, mapped: Object.keys(map) };
}

/* ---------------- BOM file ---------------- */
const dz = $("#dropzone"), fileInput = $("#bomFile");
dz.addEventListener("click", () => fileInput.click());
dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", e => { if (e.dataTransfer.files[0]) loadBom(e.dataTransfer.files[0]); });
fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadBom(fileInput.files[0]); });

async function loadBom(file) {
  const st = $("#analyzeStatus");
  $("#fileName").textContent = "";
  if (file.size > CONFIG.MAX_FILE_BYTES) return setStatus(st, "File is larger than 5 MB. Please reduce it or split the BOM.", "error");
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".pdf")) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      state.bomPdf = { name: file.name, base64: btoa(bin) };
      $("#fileName").textContent = "✓ " + file.name;
      setStatus(st, "The free checker cannot read PDF tables. Please type the BOM lines in the table below (or upload Excel/CSV), or use “Check with my Claude” and attach the PDF there.", "info");
      return;
    }
    if (!/\.(xlsx|xls|csv)$/.test(name)) return setStatus(st, "Please upload Excel (.xlsx/.xls), CSV or PDF.", "error");
    if (!window.XLSX) throw new Error("Spreadsheet reader did not load.");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
    const res = rowsFromSheet(rows);
    if (!res.rows.length) throw new Error("No BOM lines found under the header row.");
    state.bomRows = res.rows; state.bomPdf = null;
    renderBom();
    $("#fileName").textContent = `✓ ${file.name} — ${res.rows.length} lines imported`;
    const miss = ["hts", "origin", "value"].filter(k => !res.mapped.includes(k) && !(k === "value" && res.mapped.includes("unitCost")));
    setStatus(st, miss.length ? `Imported. Column(s) not found: ${miss.join(", ")} — please fill them in the table.` : "Imported. Please check the table, especially the USMCA originating column.", miss.length ? "error" : "info");
  } catch (e) {
    setStatus(st, "Could not read the file: " + esc(e.message), "error");
  }
}

$("#dlTemplate").addEventListener("click", e => {
  e.preventDefault();
  const csv = [
    "Line,Part Number,Description,HTS Code,Country of Origin,USMCA Originating (Y/N),Supplier,Qty per Unit,Unit,Unit Cost,Extended Cost per Unit,Currency,Weight per Unit (kg)",
    "1,ST-1001,Cold-rolled steel coil,7209.17,US,Y,ABC Steel,2.4,kg,1.10,2.64,USD,2.4",
    "2,FS-2002,Hex flange bolt M8,7318.15,CN,N,XYZ Fasteners,4,pcs,0.05,0.20,USD,0.04",
    "3,PT-3003,E-coat primer,3208.90,CA,,Paint Co,0.05,L,8.00,0.40,USD,0.05",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "USMCA_BOM_template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

/* ---------------- rule panel ---------------- */
state.ruleOpts = {};
function currentRule() {
  const hs = E.digits($("#prodHts").value);
  if (hs.length < 6) return { kind: "none" };
  const base = E.findRule(hs);
  if (base && E.covered(hs)) {
    const resolved = E.resolveRule(base, state.ruleOpts);
    return { kind: "db", base, resolved, citation: (base.auto ? "USMCA Appendix to Annex 4-B (Automotive Goods), " : "USMCA Annex 4-B, ") + (base.from === base.to ? E.fmtHS(base.from) : E.fmtHS(base.from) + "-" + E.fmtHS(base.to)) };
  }
  // manual rule for chapters not in the database
  const m = state.manual || {};
  const alts = [];
  if (m.ts) alts.push({ ts: m.ts === "NONE" ? null : m.ts, except: m.except && m.except.length ? m.except : undefined,
    rvc: m.tsRvc && (m.tv || m.nc) ? { tv: m.tv || undefined, nc: m.nc || undefined } : undefined });
  if (m.alt2 && (m.tv2 || m.nc2)) alts.push({ ts: null, rvc: { tv: m.tv2 || undefined, nc: m.nc2 || undefined } });
  const text = alts.map(a => E.describeAlt(a));
  return { kind: "manual", resolved: { alts, text, notes: [], warnings: [] }, base: { from: hs.slice(0, 6), to: hs.slice(0, 6) }, citation: "Rule entered by user for " + E.fmtHS(hs.slice(0, 6)) };
}

function renderRulePanel() {
  const p = $("#rulePanel"), cr = currentRule();
  if (cr.kind === "none") { p.classList.add("hidden"); return; }
  p.classList.remove("hidden");
  const src = `<a href="${USMCA_RULES.source}" target="_blank" rel="noopener">official text</a>`;
  if (cr.kind === "db") {
    const r = cr.resolved, b = cr.base, o = state.ruleOpts;
    let ctl = "";
    if (b.auto) {
      ctl += `<div class="grid3">
        <label>Vehicle use <select id="ruleCtx"><option value="">Select&hellip;</option>
          <option value="pvlt"${o.context === "pvlt" ? " selected" : ""}>Passenger vehicle / light truck</option>
          <option value="ht"${o.context === "ht" ? " selected" : ""}>Heavy truck</option>
          <option value="other"${o.context === "other" ? " selected" : ""}>Other (other vehicles, aftermarket)</option></select></label>`;
      if (r.variants) ctl += `<label>Type of good <select id="ruleVar"><option value="">Select&hellip;</option>${r.variants.map(v => `<option value="${v.key}"${o.variant === v.key ? " selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>`;
      if (o.context === "pvlt" || o.context === "ht") {
        const tabs = o.context === "pvlt" ? ["A1", "B", "C"] : ["D", "E"];
        ctl += `<label>Appendix table <select id="ruleTable"><option value="">Not listed / not sure</option>${tabs.map(t => `<option value="${t}"${o.table === t ? " selected" : ""}>${esc(USMCA_RULES.appendix[t].label)}</option>`).join("")}</select></label>`;
      }
      ctl += "</div>";
    }
    const body = r.unsupported
      ? `<div class="warn-box">${esc(r.notes.join(" "))}</div>`
      : r.needs.length ? `<div class="muted small">Select the ${r.needs.join(" and ")} to see the rule that applies.</div>`
      : `<ol class="rule-text">${r.text.map(t => `<li>${esc(t)}</li>`).join("")}</ol>${r.notes.concat(r.warnings).map(n => `<div class="warn-box small">${esc(n)}</div>`).join("")}`;
    p.innerHTML = `<div class="rule-head"><strong>Product-specific rule found:</strong> ${esc(cr.citation)} <span class="tag y">built-in</span></div>${ctl}${body}
      <div class="small muted">Source: ${src} (CUSMA consolidation, Global Affairs Canada). Rules currently in force only.</div>`;
    const bind = (id, k) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { state.ruleOpts[k] = el.value; if (k === "context") { state.ruleOpts.variant = ""; state.ruleOpts.table = ""; } renderRulePanel(); }); };
    bind("ruleCtx", "context"); bind("ruleVar", "variant"); bind("ruleTable", "table");
  } else {
    const m = state.manual || {};
    p.innerHTML = `<div class="rule-head"><strong>HS chapter ${esc(E.digits($("#prodHts").value).slice(0, 2))} is not in the free rule database yet</strong> (built-in: chapters 72, 73 and 87).</div>
      <p class="small">Look up your rule in Annex 4-B (${src}) and enter it below, or use “Check with my Claude”.</p>
      <div class="grid3">
        <label>Alternative 1 — tariff change <select id="mTs">
          <option value="">Select&hellip;</option><option value="CC">Change of chapter (from any other chapter)</option>
          <option value="CTH">Change of heading (from any other heading)</option><option value="CTSH">Change of subheading (from any other subheading)</option>
          <option value="NONE">No change required (RVC only)</option></select></label>
        <label>Except from (HS codes, comma separated) <input id="mExcept" placeholder="e.g. 7208-7229, 7318"></label>
        <label class="check-inline"><input type="checkbox" id="mTsRvc"> also requires RVC</label>
        <label>RVC % (transaction value) <input id="mTv" type="number" min="0" max="100"></label>
        <label>RVC % (net cost) <input id="mNc" type="number" min="0" max="100"></label>
        <span></span>
        <label class="check-inline"><input type="checkbox" id="mAlt2"> Alternative 2: no change required, RVC only</label>
        <label>Alt 2 RVC % (TV) <input id="mTv2" type="number" min="0" max="100"></label>
        <label>Alt 2 RVC % (NC) <input id="mNc2" type="number" min="0" max="100"></label>
      </div>`;
    const set = () => {
      state.manual = { ts: $("#mTs").value, except: $("#mExcept").value.split(/[,;\s]+/).map(s => s.replace(/[^\d-]/g, "")).filter(Boolean),
        tsRvc: $("#mTsRvc").checked, tv: +$("#mTv").value || 0, nc: +$("#mNc").value || 0, alt2: $("#mAlt2").checked, tv2: +$("#mTv2").value || 0, nc2: +$("#mNc2").value || 0 };
    };
    $("#mTs").value = m.ts || ""; $("#mExcept").value = (m.except || []).join(", "); $("#mTsRvc").checked = !!m.tsRvc;
    $("#mTv").value = m.tv || ""; $("#mNc").value = m.nc || ""; $("#mAlt2").checked = !!m.alt2; $("#mTv2").value = m.tv2 || ""; $("#mNc2").value = m.nc2 || "";
    $$("#rulePanel input, #rulePanel select").forEach(el => el.addEventListener("change", set));
  }
}
$("#prodHts").addEventListener("input", () => { state.ruleOpts = {}; renderRulePanel(); });

/* ---------------- analysis ---------------- */
function productInput() {
  return {
    productDescription: $("#prodDesc").value.trim(),
    hts: $("#prodHts").value.trim(),
    productionCountry: $("#prodCountry").value,
    transactionValue: $("#prodTV").value === "" ? null : +$("#prodTV").value,
    netCost: $("#prodNC").value === "" ? null : +$("#prodNC").value,
    totalCost: $("#prodTC").value === "" ? null : +$("#prodTC").value,
    currency: $("#prodCur").value,
    notes: $("#prodNotes").value.trim(),
  };
}
function checkBasics(input, needBom = true) {
  const missing = [];
  if (!input.productDescription) missing.push("final product description");
  if (hsDigits(input.hts).length < 6) missing.push("HTS code (at least 6 digits)");
  if (!input.productionCountry) missing.push("production country");
  if (needBom && !state.bomRows.length) missing.push("bill of materials lines");
  return missing;
}
function bomCsv() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["Line,Part,Description,HTS,Country of origin,USMCA originating (Y/N/?),Value per unit,Weight per unit (kg)"]
    .concat(state.bomRows.map(r => [r.line, r.part, r.description, r.hts, r.origin, r.orig || "?", r.value, r.weight].map(q).join(","))).join("\n");
}

$("#freeCheckBtn").addEventListener("click", () => {
  const st = $("#analyzeStatus"), input = productInput();
  const missing = checkBasics(input);
  if (missing.length) return setStatus(st, "Please provide: " + missing.join(", ") + ".", "error");
  const cr = currentRule();
  if (cr.kind === "db" && cr.resolved.needs.length) return setStatus(st, `Please select the ${cr.resolved.needs.join(" and ")} in the rule box.`, "error");
  if (cr.kind === "manual" && !cr.resolved.alts.length) return setStatus(st, "Please enter the product-specific rule in the rule box (or use “Check with my Claude”).", "error");
  const result = E.evaluate({ ...input, bom: state.bomRows, rule: cr.resolved, ruleBase: cr.base, citation: cr.citation, manual: cr.kind === "manual" });
  state.lastResult = result; state.lastInput = input;
  setStatus(st, "", "info");
  renderResult(result, input);
});

$("#claudeBtn").addEventListener("click", async () => {
  const st = $("#analyzeStatus"), input = productInput();
  const missing = checkBasics(input, false);
  if (missing.length) return setStatus(st, "Please provide: " + missing.join(", ") + ".", "error");
  const cr = currentRule();
  const ruleTxt = cr.kind === "db" && cr.resolved.text.length ? cr.resolved.text.map(t => "- " + t).join("\n") : "(not provided — please identify the rule in USMCA Annex 4-B yourself)";
  const free = state.lastResult && state.lastResult.engine === "free" ? `\nA free rule-based checker gave this preliminary result: ${state.lastResult.status}, criterion ${state.lastResult.origin_criterion || "-"}, method ${state.lastResult.method_of_qualification || "-"}. Verify it independently.\n` : "";
  const prompt = `You are a North American customs compliance analyst. Make a PRELIMINARY USMCA/CUSMA origin determination (Chapter 4, Annex 4-B, Appendix for automotive goods, Article 4.12 de minimis).

FINAL GOOD
Description: ${input.productDescription}
HTS code: ${input.hts}
Produced in: ${input.productionCountry}
Transaction value per unit (FOB): ${input.transactionValue ?? "not provided"}
Net cost per unit: ${input.netCost ?? "not provided"}
Total cost per unit: ${input.totalCost ?? "not provided"}
Currency: ${input.currency}
Notes: ${input.notes || "none"}

PRODUCT-SPECIFIC RULE (from the USMCA text)
${ruleTxt}

BILL OF MATERIALS${state.bomRows.length ? " (CSV)\n" + bomCsv() : "\n(I have attached the BOM file.)"}
${free}
Please:
1. Check whether the HTS code fits the description (do not change it silently).
2. Confirm the applicable Annex 4-B rule (quote it; say if you are unsure).
3. Test each non-originating material against the tariff shift; apply de minimis (Art. 4.12) and RVC (TV/NC) where relevant, showing calculations.
4. Give: Origin criterion (A/B/C/D), Method of qualification (TS/TV/NC/NO), Country of origin (US/CA/MX).
5. If it does not qualify, explain each reason in plain English and what would need to change.
6. List missing information and points a compliance professional should verify.`;
  try { await navigator.clipboard.writeText(prompt); }
  catch { const ta = document.createElement("textarea"); ta.value = prompt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  setStatus(st, `Prompt copied. Open <a href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a>, paste it (Ctrl/Cmd+V)${state.bomPdf ? " and attach your BOM PDF" : ""}. Then enter the result in Step 3 using “Skip &mdash; I already know the origin”.`, "info");
});

$("#aiBtn").addEventListener("click", aiAnalyze);
$("#skipBtn").addEventListener("click", () => { if (!state.goods.length) addGood({}); goto(2); });

async function aiAnalyze() {
  const st = $("#analyzeStatus"), input = productInput();
  const missing = checkBasics(input, !state.bomPdf);
  if (missing.length) return setStatus(st, "Please provide: " + missing.join(", ") + ".", "error");
  if (state.bomPdf && !state.bomRows.length) input.bomPdfBase64 = state.bomPdf.base64; else input.bomText = bomCsv();
  if (CONFIG.TURNSTILE_SITEKEY && !DEMO) {
    const tok = window.turnstile ? turnstile.getResponse() : "";
    if (!tok) return setStatus(st, "Please complete the security check above the button.", "error");
    input.turnstileToken = tok;
  }
  const btn = $("#aiBtn");
  btn.disabled = true;
  $("#result").classList.add("hidden");
  setStatus(st, "Reviewing the rule of origin and your BOM&hellip; this can take up to a minute.", "info", true);
  try {
    let result;
    if (DEMO) { await new Promise(r => setTimeout(r, 900)); result = demoResult(input); }
    else {
      const res = await fetch(CONFIG.API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.result) {
        if (["IP_LIMIT", "DAILY_LIMIT", "BUDGET", "TOO_LARGE"].includes(data.code)) {
          throw new Error(esc(data.error) + ' You can still use the free checker, or <a href="#contact">contact me for a professional origin review</a>.');
        }
        if (window.turnstile) try { turnstile.reset(); } catch {}
        throw new Error(esc(data.error || "The analysis failed (" + res.status + "). Please try again."));
      }
      result = data.result;
    }
    state.lastResult = result; state.lastInput = input;
    renderResult(result, input);
    setStatus(st, "", "info");
  } catch (e) {
    setStatus(st, e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function list(items) {
  return items && items.length ? "<ul>" + items.map(i => `<li>${esc(i)}</li>`).join("") + "</ul>" : "";
}
function tag(v, yes = "Yes", no = "No") {
  if (v === true) return `<span class="tag y">${yes}</span>`;
  if (v === false) return `<span class="tag n">${no}</span>`;
  return '<span class="tag u">?</span>';
}

function renderResult(r, input) {
  const box = $("#result");
  const status = r.status || "INSUFFICIENT_INFORMATION";
  const head = {
    QUALIFIES: ["ok", "✓ Preliminary result: QUALIFIES as USMCA originating"],
    DOES_NOT_QUALIFY: ["bad", "✗ Preliminary result: DOES NOT QUALIFY"],
    INSUFFICIENT_INFORMATION: ["info", "! More information needed to determine origin"],
  }[status] || ["info", "Result"];

  const rvc = r.rvc || {};
  const rvcHtml = rvc.required
    ? `<h4>Regional value content (${esc(rvc.method || "")})</h4><div>${esc(rvc.calculation || "")}
       ${rvc.result_pct != null ? ` &rarr; <strong>${(+rvc.result_pct).toFixed(1)}%</strong>` : ""}
       ${rvc.threshold_pct != null ? ` (required: ${esc(rvc.threshold_pct)}%)` : ""} ${rvc.pass == null ? "" : tag(rvc.pass, "Pass", "Fail")}</div>` : "";
  const d = r.de_minimis || {};
  let dm = "";
  if (d.tested || d.applied || (d.result && d.result !== "NOT_APPLICABLE")) {
    const resTag = { PASS: '<span class="tag y">Within limit</span>', FAIL: '<span class="tag n">Exceeds limit</span>', CANNOT_TEST: '<span class="tag u">Cannot test</span>' }[d.result] || "";
    const typeTxt = { TARIFF_SHIFT: "tariff-shift tolerance", RVC: "RVC waiver", TEXTILE_WEIGHT: "textile weight test" }[d.type] || "";
    const baseTxt = { TV: "transaction value (FOB)", TOTAL_COST: "total cost", WEIGHT: "weight of the good" }[d.base] || "";
    dm = `<h4>De minimis (USMCA Article 4.12)${typeTxt ? " — " + typeTxt : ""} ${resTag}</h4>
      <div>${d.percentage != null ? `Non-originating value failing the rule: <strong>${(+d.percentage).toFixed(2)}%</strong> of ${esc(baseTxt)} (limit ${esc(d.limit_pct ?? 10)}%)` : ""}
      ${d.exception ? `<div><span class="tag n">Exception</span> ${esc(d.exception)}</div>` : ""}
      ${d.calculation ? `<div class="small">${esc(d.calculation)}</div>` : ""}
      ${d.comment ? `<div class="small muted">${esc(d.comment)}</div>` : ""}</div>`;
  }

  const mats = (r.materials || []).map(m => `<tr>
      <td>${esc(m.line)}</td><td>${esc(m.part_number)}</td><td>${esc(m.description)}</td><td>${esc(m.hts)}</td>
      <td>${esc(m.origin)}</td><td>${m.value ?? ""}</td><td>${tag(m.originating)}</td>
      <td>${m.originating === true ? '<span class="tag u">n/a</span>' : tag(m.tariff_shift_ok, "Met", "Not met")}</td><td>${esc(m.note)}</td></tr>`).join("");

  box.innerHTML = `
    ${DEMO && r.engine !== "free" ? '<div class="demo-flag">DEMO MODE — sample output for testing the layout. This is not a real determination.</div>' : ""}
    <div class="result-head ${head[0]}">${head[1]}</div>
    <div class="result-body">
      <p>${esc(r.summary)}</p>
      <div class="kv">
        <div><div class="k">8. Origin criterion</div><div class="v">${esc(r.origin_criterion || "—")}</div></div>
        <div><div class="k">10. Method of qualification</div><div class="v">${esc(r.method_of_qualification || "—")}</div></div>
        <div><div class="k">11. Country of origin</div><div class="v">${esc(r.country_of_origin || "—")}</div></div>
      </div>
      <h4>Classification check</h4>
      <div>HS6 ${esc(r.hs_check?.hs6)} ${tag(r.hs_check?.consistent, "Consistent", "Check")} — ${esc(r.hs_check?.comment)}</div>
      <h4>Applicable rule</h4>
      <div><strong>${esc(r.applicable_rule?.citation)}</strong>${r.applicable_rule?.certainty === "uncertain" ? ' <span class="tag n">verify rule text</span>' : ""}<br>${esc(r.applicable_rule?.rule_text_summary)}</div>
      ${rvcHtml}${dm}
      ${(r.disqualification_reasons || []).length ? "<h4>Why it does not qualify</h4>" + list(r.disqualification_reasons) : ""}
      ${(r.reasons || []).length ? "<h4>How the determination was made</h4>" + list(r.reasons) : ""}
      ${(r.missing_information || []).length ? "<h4>Information needed</h4>" + list(r.missing_information) : ""}
      ${(r.warnings || []).length ? "<h4>Points to verify</h4>" + list(r.warnings) : ""}
      ${mats ? `<h4>Bill of materials review</h4><div class="table-wrap"><table class="mat-table"><thead><tr>
          <th>Line</th><th>Part</th><th>Description</th><th>HTS</th><th>Origin</th><th>Value</th><th>Originating</th><th>Tariff shift</th><th>Note</th>
        </tr></thead><tbody>${mats}</tbody></table></div>` : ""}
      <p class="small muted">${r.engine === "free" ? "Free rule-based calculation using the built-in USMCA rule text. It does not check your HTS classification or supplier origin claims." : "Confidence: " + esc(r.confidence || "—") + ". Preliminary AI-assisted analysis."} Please have a customs compliance professional review before signing.</p>
      <div class="actions">
        ${status === "QUALIFIES"
          ? '<button class="btn primary" id="useResult">Use this result in the certificate &rarr;</button>'
          : '<a class="btn primary" href="#contact">Ask for a professional review</a>'}
      </div>
    </div>`;
  box.classList.remove("hidden");
  const useBtn = $("#useResult");
  if (useBtn) useBtn.addEventListener("click", () => {
    addGood({
      description: input.productDescription,
      hts: input.hts,
      criterion: r.origin_criterion || "",
      method: r.method_of_qualification || "",
      country: r.country_of_origin || input.productionCountry,
    });
    goto(2);
  });
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function demoResult(input) {
  return {
    status: "QUALIFIES",
    summary: "Sample: the non-originating fastener changes tariff classification as required, so the good would qualify under criterion B by tariff shift. Replace this demo with the live AI service.",
    hs_check: { hs6: hsDigits(input.hts).slice(0, 4) + "." + hsDigits(input.hts).slice(4, 6), user_hts: input.hts, consistent: true, comment: "Sample comment." },
    applicable_rule: { citation: "USMCA Annex 4-B (sample citation)", rule_text_summary: "Sample rule summary for layout testing.", certainty: "uncertain" },
    origin_criterion: "B", method_of_qualification: "TS", country_of_origin: input.productionCountry,
    rvc: { required: false },
    de_minimis: { tested: true, applied: true, type: "TARIFF_SHIFT", base: "TV", base_value: 12.5, failing_value: 0.4, percentage: 3.2, limit_pct: 10, exception: null, result: "PASS", calculation: "Sample: 0.40 / 12.50 x 100 = 3.20% <= 10%", comment: "Sample comment." },
    materials: [
      { line: "1", part_number: "ST-1001", description: "Cold-rolled steel coil", hts: "7209.17", origin: "US", value: 2.64, originating: true, tariff_shift_ok: null, note: "Supplier certification on file" },
      { line: "2", part_number: "FS-2002", description: "Hex flange bolt M8", hts: "7318.15", origin: "CN", value: 0.2, originating: false, tariff_shift_ok: true, note: "Sample" },
    ],
    reasons: ["Sample reason."], disqualification_reasons: [], missing_information: [],
    warnings: ["Demo mode output."], confidence: "low",
  };
}

/* ---------------- parties ---------------- */
function partyData(p) {
  const fs = $(`.party[data-party="${p}"]`), o = {};
  $$("[data-f]", fs).forEach(i => (o[i.dataset.f] = i.value.trim()));
  return o;
}
function setParty(p, o) {
  const fs = $(`.party[data-party="${p}"]`);
  $$("[data-f]", fs).forEach(i => { if (o[i.dataset.f] !== undefined) i.value = o[i.dataset.f]; });
}
$$("[data-copy]").forEach(b => b.addEventListener("click", () => {
  const c = partyData("certifier"); delete c.title;
  setParty(b.dataset.copy, c);
}));
$$("[data-special]").forEach(s => s.addEventListener("change", () => {
  if (!s.value) return;
  setParty(s.dataset.special, { name: s.value, address: "", country: "", phone: "", email: "", taxid: "" });
  s.value = "";
}));
function certType() { const r = $('input[name="certType"]:checked'); return r ? r.value : ""; }
$$('input[name="certType"]').forEach(r => r.addEventListener("change", () => {
  const yn = certType() === "PRODUCER" ? "YES" : "NO";
  state.goods.forEach(g => (g.producer = yn));
  renderGoods();
}));

function savePartiesLocal() {
  const o = { certType: certType() };
  ["certifier", "exporter", "producer", "importer"].forEach(p => (o[p] = partyData(p)));
  store.set("usmca_parties", o);
}
(function restoreParties() {
  const o = store.get("usmca_parties");
  if (!o) return;
  ["certifier", "exporter", "producer", "importer"].forEach(p => o[p] && setParty(p, o[p]));
  if (o.certType) { const r = $(`input[name="certType"][value="${o.certType}"]`); if (r) r.checked = true; }
})();

function validateBlanket() {
  const f = $("#blanketFrom").value, t = $("#blanketTo").value, m = $("#blanketMsg");
  m.textContent = "";
  if (!f && !t) return true;
  if (!f || !t) { m.textContent = "Enter both dates, or leave both empty."; return false; }
  const df = new Date(f + "T00:00:00"), dt = new Date(t + "T00:00:00");
  if (dt < df) { m.textContent = "'To' date must be after 'From' date."; return false; }
  const limit = new Date(df); limit.setFullYear(limit.getFullYear() + 1);
  if (dt >= limit) { m.textContent = "A blanket period cannot exceed 12 months."; return false; }
  return true;
}
["#blanketFrom", "#blanketTo"].forEach(s => $(s).addEventListener("change", validateBlanket));

function validateStep2() {
  const msg = $("#step2Msg"), problems = [];
  if (!certType()) problems.push("select the certifier type (field 1)");
  const c = partyData("certifier");
  if (!c.name) problems.push("certifier name");
  if (!c.address) problems.push("certifier address");
  if (!c.email && !c.phone) problems.push("certifier phone or email");
  if (!validateBlanket()) problems.push("a valid blanket period");
  if (!partyData("importer").name) problems.push('importer (or select "Various" / "Unknown")');
  if (problems.length) {
    if ($("#step2").classList.contains("hidden")) goto2Direct();
    setStatus(msg, "Please complete: " + problems.join(", ") + ".", "error");
    return false;
  }
  setStatus(msg, "", "info");
  savePartiesLocal();
  return true;
}
function goto2Direct() {
  for (let i = 1; i <= 4; i++) $("#step" + i).classList.toggle("hidden", i !== 2);
  $$("#stepper li").forEach(li => { const s = +li.dataset.step; li.classList.toggle("active", s === 2); li.classList.toggle("done", s < 2); });
}

/* ---------------- goods ---------------- */
function addGood(g) {
  state.goods.push({
    description: g.description || "", hts: g.hts || "", criterion: g.criterion || "",
    producer: certType() === "PRODUCER" ? "YES" : "NO", method: g.method || "", country: g.country || "",
  });
  renderGoods();
}
function opts(list, v) { return list.map(o => `<option${o === v ? " selected" : ""}>${o}</option>`).join(""); }
function renderGoods() {
  const tb = $("#goodsTable tbody");
  tb.innerHTML = state.goods.map((g, i) => `<tr data-i="${i}">
    <td><textarea data-k="description" rows="2">${esc(g.description)}</textarea></td>
    <td><input data-k="hts" value="${esc(g.hts)}" style="min-width:110px"></td>
    <td><select data-k="criterion">${opts(["", "A", "B", "C", "D"], g.criterion)}</select></td>
    <td><select data-k="producer">${opts(["YES", "NO"], g.producer)}</select></td>
    <td><select data-k="method">${opts(["", "TS", "TV", "NC", "NO"], g.method)}</select></td>
    <td><select data-k="country">${opts(["", "US", "CA", "MX"], g.country)}</select></td>
    <td class="del"><button class="x" title="Remove" data-del="${i}">&times;</button></td></tr>`).join("");
}
$("#goodsTable").addEventListener("input", e => {
  const k = e.target.dataset.k, tr = e.target.closest("tr");
  if (k && tr) state.goods[+tr.dataset.i][k] = e.target.value;
});
$("#goodsTable").addEventListener("click", e => {
  if (e.target.dataset.del !== undefined) { state.goods.splice(+e.target.dataset.del, 1); renderGoods(); }
});
$("#addRow").addEventListener("click", () => addGood({}));
$("#anotherCheck").addEventListener("click", () => {
  ["#prodDesc", "#prodHts", "#prodTV", "#prodNC", "#prodTC", "#prodNotes"].forEach(s => ($(s).value = ""));
  $("#prodCountry").value = ""; state.bomRows = []; state.bomPdf = null; state.ruleOpts = {}; state.manual = null; renderBom(); renderRulePanel(); $("#fileName").textContent = ""; fileInput.value = "";
  $("#result").classList.add("hidden");
  goto(1);
});

function validateStep3() {
  const msg = $("#step3Msg"), p = [];
  if (!state.goods.length) p.push("add at least one good");
  state.goods.forEach((g, i) => {
    const n = i + 1;
    if (!g.description.trim()) p.push(`row ${n}: description`);
    if (hsDigits(g.hts).length < 6) p.push(`row ${n}: HTS (6+ digits)`);
    if (!g.criterion) p.push(`row ${n}: origin criterion`);
    if (!g.method) p.push(`row ${n}: method of qualification`);
    if (!g.country) p.push(`row ${n}: country of origin`);
    if ((g.criterion === "A" || g.criterion === "C") && g.method && g.method !== "NO") p.push(`row ${n}: criterion ${g.criterion} uses method "NO"`);
    if (g.criterion === "D" && g.method && !["TV", "NC"].includes(g.method)) p.push(`row ${n}: criterion D requires an RVC method (TV or NC)`);
  });
  if (p.length) {
    if ($("#step3").classList.contains("hidden")) {
      for (let i = 1; i <= 4; i++) $("#step" + i).classList.toggle("hidden", i !== 3);
      $$("#stepper li").forEach(li => { const s = +li.dataset.step; li.classList.toggle("active", s === 3); li.classList.toggle("done", s < 3); });
    }
    setStatus(msg, "Please fix: " + p.join("; ") + ".", "error");
    return false;
  }
  setStatus(msg, "", "info");
  return true;
}

/* ---------------- signature ---------------- */
const pad = $("#sigPad"), ctx = pad.getContext("2d");
let drawing = false, hasSig = false;
function padPos(e) {
  const r = pad.getBoundingClientRect();
  return [(e.clientX - r.left) * (pad.width / r.width), (e.clientY - r.top) * (pad.height / r.height)];
}
pad.addEventListener("pointerdown", e => { drawing = true; pad.setPointerCapture(e.pointerId); const [x, y] = padPos(e); ctx.beginPath(); ctx.moveTo(x, y); });
pad.addEventListener("pointermove", e => {
  if (!drawing) return;
  const [x, y] = padPos(e);
  ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b1f3a";
  ctx.lineTo(x, y); ctx.stroke(); hasSig = true;
});
["pointerup", "pointercancel", "pointerleave"].forEach(ev => pad.addEventListener(ev, () => (drawing = false)));
$("#sigClear").addEventListener("click", () => { ctx.clearRect(0, 0, pad.width, pad.height); hasSig = false; });

function prefillSign() {
  const c = partyData("certifier");
  if (!$("#signTitle").value) $("#signTitle").value = c.title || "";
  if (!$("#signCompany").value) $("#signCompany").value = c.name || "";
  if (!$("#signPhone").value) $("#signPhone").value = c.phone || "";
  if (!$("#signEmail").value) $("#signEmail").value = c.email || "";
  if (!$("#signDate").value) {
    const d = new Date();
    $("#signDate").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

/* ---------------- PDF ---------------- */
$("#previewPdf").addEventListener("click", () => buildPdf(false));
$("#makePdf").addEventListener("click", () => buildPdf(true));

function mdy(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; }
function clean(s) {
  return String(s ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/…/g, "...").replace(/\r/g, "").replace(/\t/g, " ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}
function wrap(text, font, size, maxW) {
  const out = [];
  clean(text).split("\n").forEach(para => {
    let line = "";
    para.split(/\s+/).filter(Boolean).forEach(word => {
      while (font.widthOfTextAtSize(word, size) > maxW) { // break very long words
        let k = word.length;
        while (k > 1 && font.widthOfTextAtSize(word.slice(0, k), size) > maxW) k--;
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, k)); word = word.slice(k);
      }
      const t = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(t, size) <= maxW) line = t; else { out.push(line); line = word; }
    });
    out.push(line);
  });
  return out.length ? out : [""];
}

async function buildPdf(signed) {
  const msg = $("#step4Msg");
  if (!validateStep2() || !validateStep3()) return;
  if (signed) {
    const p = [];
    if (!$("#signName").value.trim()) p.push("authorized name");
    if (!$("#signDate").value) p.push("date");
    if (!hasSig) p.push("signature");
    if (!$("#ackReview").checked) p.push("the acknowledgement checkbox");
    if (p.length) return setStatus(msg, "Please complete: " + p.join(", ") + ".", "error");
  }
  setStatus(msg, "Creating PDF&hellip;", "info", true);
  try {
    const bytes = await renderPdf(signed);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (signed) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `USMCA_Certification_of_Origin_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setStatus(msg, "PDF downloaded. Keep it with your supporting records.", "info");
    } else {
      window.open(url, "_blank");
      setStatus(msg, "Draft opened in a new tab.", "info");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error(e);
    setStatus(msg, "Could not create the PDF: " + esc(e.message), "error");
  }
}

async function renderPdf(signed) {
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle("USMCA Certification of Origin");
  doc.setCreator(CONFIG.SITE);
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = 612, H = 792, M = 32, CW = W - 2 * M;
  const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35), fill = rgb(0.86, 0.9, 0.97);
  const pages = [];

  const newPage = () => { const p = doc.addPage([W, H]); pages.push(p); return p; };
  const T = (p, s, x, y, o = {}) => p.drawText(clean(s), { x, y: H - y, size: o.size || 8, font: o.font || F, color: o.color || black });
  const R = (p, x, y, w, h, o = {}) => p.drawRectangle({ x, y: H - y - h, width: w, height: h, borderColor: black, borderWidth: o.bw ?? 0.8, color: o.fill });
  const L = (p, x1, y1, x2, y2) => p.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: 0.6, color: black });
  const centered = (p, s, y, font, size) => T(p, s, (W - font.widthOfTextAtSize(clean(s), size)) / 2, y, { font, size });

  const ct = certType();
  const parties = { certifier: partyData("certifier"), exporter: partyData("exporter"), producer: partyData("producer"), importer: partyData("importer") };

  /* ---- page 1 header ---- */
  let p = newPage();
  let y = M;
  R(p, M, y, CW, 40);
  centered(p, "UNITED STATES MEXICO CANADA AGREEMENT (USMCA)", y + 16, FB, 12);
  centered(p, "CERTIFICATION OF ORIGIN", y + 32, FB, 12);
  y += 40;

  // Field 1 + blanket period
  const w1 = CW * 0.66;
  R(p, M, y, w1, 44); R(p, M + w1, y, CW - w1, 44);
  T(p, '1. CERTIFIER TYPE (INDICATE "X")', M + 4, y + 11, { size: 7.5 });
  ["IMPORTER", "EXPORTER", "PRODUCER"].forEach((t, i) => {
    const bx = M + 8 + i * (w1 / 3);
    R(p, bx, y + 20, 14, 14, { fill });
    if (ct === t) T(p, "X", bx + 3.6, y + 31, { font: FB, size: 11 });
    T(p, t, bx + 20, y + 30.5, { size: 8.5, font: FB });
  });
  const bxX = M + w1;
  T(p, "BLANKET PERIOD", bxX + 4, y + 16, { size: 7.5 });
  T(p, "(MM/DD/YYYY)", bxX + 4, y + 26, { size: 7.5 });
  T(p, "FROM:", bxX + 82, y + 16, { size: 7.5 });
  T(p, "TO:", bxX + 82, y + 36, { size: 7.5 });
  T(p, mdy($("#blanketFrom").value), bxX + 110, y + 16, { size: 9 });
  T(p, mdy($("#blanketTo").value), bxX + 110, y + 36, { size: 9 });
  L(p, bxX + 78, y + 22, M + CW, y + 22);
  y += 44;

  // Parties 2-5
  const half = CW / 2, pbH = 104;
  const partyBox = (title, d, x, yy, withTitle) => {
    R(p, x, yy, half, pbH);
    T(p, title, x + 4, yy + 10, { size: 7.5, font: FB });
    const rows = [["NAME", d.name], ["ADDRESS", d.address], ["COUNTRY", d.country], ["PHONE", d.phone], ["EMAIL", d.email], ["TAX IDENTIFICATION NUMBER", d.taxid]];
    if (withTitle && d.title) rows.splice(1, 0, ["TITLE", d.title]);
    let ly = yy + 22;
    rows.forEach(([lab, val]) => {
      const labW = lab.startsWith("TAX") ? 112 : 46;
      T(p, lab, x + 4, ly, { size: 6.5, font: FI, color: grey });
      const lines = wrap(val || "", F, 8, half - labW - 10);
      const maxLines = lab === "ADDRESS" ? 2 : 1;
      lines.slice(0, maxLines).forEach((ln, k) => T(p, ln, x + labW + 4, ly + k * 9, { size: 8 }));
      ly += 9 * Math.min(maxLines, lines.length) + 3;
    });
  };
  partyBox("2. CERTIFIER NAME, ADDRESS, PHONE, AND EMAIL", parties.certifier, M, y, true);
  partyBox("3. EXPORTER NAME, ADDRESS, PHONE, AND EMAIL", parties.exporter, M + half, y);
  y += pbH;
  partyBox("4. PRODUCER NAME, ADDRESS, PHONE, AND EMAIL", parties.producer, M, y);
  partyBox("5. IMPORTER NAME, ADDRESS, PHONE, AND EMAIL", parties.importer, M + half, y);
  y += pbH;

  // Goods table
  const cols = [
    { k: "description", t: ["6.", "DESCRIPTION OF GOOD(S)"], w: CW * 0.37 },
    { k: "hts", t: ["7.", "HTS"], w: CW * 0.14 },
    { k: "criterion", t: ["8.", "ORIGIN", "CRITERION"], w: CW * 0.1 },
    { k: "producer", t: ["9.", "PRODUCER", "(YES/NO)"], w: CW * 0.1 },
    { k: "method", t: ["10.", "METHOD OF", "QUALIFICATION"], w: CW * 0.15 },
    { k: "country", t: ["11.", "COUNTRY", "OF ORIGIN"], w: CW * 0.14 },
  ];
  const headerH = 34;
  const drawGoodsHeader = (pg, yy) => {
    let x = M;
    cols.forEach(c => {
      R(pg, x, yy, c.w, headerH);
      c.t.forEach((s, i) => { const tw = F.widthOfTextAtSize(s, 7); pg.drawText(s, { x: x + (c.w - tw) / 2, y: H - (yy + 10 + i * 9), size: 7, font: F }); });
      x += c.w;
    });
    return yy + headerH;
  };
  const SIG_BLOCK_H = 168;
  y = drawGoodsHeader(p, y);
  const rowsLaid = state.goods.map(g => {
    const descLines = wrap(g.description, F, 8, cols[0].w - 8);
    return { g, descLines, h: Math.max(18, descLines.length * 9.5 + 8) };
  });

  let idx = 0;
  const pageBottom = (isFirst) => H - M - (isFirst ? SIG_BLOCK_H : 24);
  // Rows on page 1, leaving room for the signature block; overflow goes to continuation sheets
  const drawRow = (pg, yy, rl) => {
    let x = M;
    cols.forEach((c, ci) => {
      R(pg, x, yy, c.w, rl.h);
      if (ci === 0) rl.descLines.forEach((ln, k) => pg.drawText(ln, { x: x + 4, y: H - (yy + 11 + k * 9.5), size: 8, font: F }));
      else {
        const v = clean(rl.g[c.k] || ""); const tw = FB.widthOfTextAtSize(v, 9);
        pg.drawText(v, { x: x + (c.w - tw) / 2, y: H - (yy + 12), size: 9, font: c.k === "hts" ? F : FB });
      }
      x += c.w;
    });
    return yy + rl.h;
  };
  while (idx < rowsLaid.length && y + rowsLaid[idx].h <= pageBottom(true)) y = drawRow(p, y, rowsLaid[idx++]);
  const continuation = idx < rowsLaid.length;
  if (continuation) {
    R(p, M, y, CW, 16);
    centered(p, "SEE ATTACHED CONTINUATION SHEET(S)", y + 11, F, 7.5);
    y += 16;
  } else if (y + 16 <= pageBottom(true)) {
    // pad with one empty row line for a cleaner look
    let x = M; cols.forEach(c => { R(p, x, y, c.w, 14); x += c.w; }); y += 14;
  }

  // Certification + signature block (always on page 1)
  y = Math.max(y + 8, H - M - SIG_BLOCK_H + 8);
  const sigTop = y, sigH = H - M - sigTop;
  R(p, M, sigTop, CW, sigH);
  T(p, "12. CERTIFICATION", M + 4, sigTop + 11, { size: 7.5, font: FB });
  const stmt = "I certify that the goods described in this document qualify as originating and the information contained in this document is true and accurate. I assume responsibility for proving such representations and agree to maintain and present upon request or to make available during a verification visit, documentation necessary to support this certification.";
  wrap(stmt, F, 8, CW - 10).forEach((ln, k) => T(p, ln, M + 5, sigTop + 23 + k * 10, { size: 8 }));
  const gy = sigTop + 58, colW = CW / 2;
  // signature cell
  R(p, M, gy, colW, sigH - (gy - sigTop)); R(p, M + colW, gy, colW, sigH - (gy - sigTop));
  T(p, "AUTHORIZED SIGNATURE", M + 4, gy + 10, { size: 6.5, font: FI, color: grey });
  if (signed && hasSig) {
    const png = await doc.embedPng(pad.toDataURL("image/png"));
    const maxW = colW - 20, maxH = 50, sc = Math.min(maxW / png.width, maxH / png.height);
    p.drawImage(png, { x: M + 10, y: H - (gy + 14 + png.height * sc), width: png.width * sc, height: png.height * sc });
  }
  const info = [
    ["NAME", $("#signName").value], ["TITLE", $("#signTitle").value], ["COMPANY", $("#signCompany").value],
  ];
  let iy = gy + 74;
  info.forEach(([k, v]) => { T(p, k, M + 4, iy, { size: 6.5, font: FI, color: grey }); T(p, wrap(v, F, 8.5, colW - 60)[0], M + 52, iy, { size: 8.5 }); iy += 11; });
  const info2 = [["PHONE", $("#signPhone").value], ["EMAIL", $("#signEmail").value], ["DATE (MM/DD/YYYY)", mdy($("#signDate").value)]];
  iy = gy + 16;
  info2.forEach(([k, v]) => { T(p, k, M + colW + 4, iy, { size: 6.5, font: FI, color: grey }); T(p, wrap(v, F, 8.5, colW - 90)[0], M + colW + 82, iy, { size: 8.5 }); iy += 14; });

  /* ---- continuation sheets ---- */
  while (idx < rowsLaid.length) {
    const pg = newPage();
    let yy = M;
    R(pg, M, yy, CW, 30);
    T(pg, "USMCA CERTIFICATION OF ORIGIN - CONTINUATION SHEET", M + 8, yy + 13, { font: FB, size: 10 });
    T(pg, "Certifier: " + (parties.certifier.name || ""), M + 8, yy + 25, { size: 8 });
    yy = drawGoodsHeader(pg, yy + 30);
    while (idx < rowsLaid.length && yy + rowsLaid[idx].h <= pageBottom(false)) yy = drawRow(pg, yy, rowsLaid[idx++]);
  }

  /* ---- footer, page numbers, draft watermark ---- */
  pages.forEach((pg, i) => {
    pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: M - 18 > 6 ? 14 : 14, size: 7.5, font: F, color: grey });
    pg.drawText("USMCA Annex 5-A minimum data elements. Prepared with the free tool at " + CONFIG.SITE, { x: M, y: 14, size: 6.5, font: F, color: grey });
    if (!signed) {
      pg.drawText("DRAFT - NOT SIGNED", { x: 120, y: 300, size: 54, font: FB, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(35) });
    }
  });
  return doc.save();
}

/* ---------------- init ---------------- */
if (!CONFIG.API_URL && !DEMO) $("#aiBtn").classList.add("hidden");
renderBom();
if (CONFIG.TURNSTILE_SITEKEY && !DEMO) {
  const box = $("#turnstileBox");
  box.innerHTML = `<div class="cf-turnstile" data-sitekey="${esc(CONFIG.TURNSTILE_SITEKEY)}"></div>`;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true; s.defer = true;
  document.head.appendChild(s);
}
$("#yr").textContent = new Date().getFullYear();
if (DEMO) setStatus($("#analyzeStatus"), "Demo mode is on (sample results, no AI call).", "info");
