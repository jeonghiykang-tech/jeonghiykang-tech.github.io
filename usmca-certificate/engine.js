/* USMCA / CUSMA free rule engine — runs in the browser, no AI, no cost.
 * Produces the same result shape as the AI service so the page can show either.
 */
(function () {
  const PARTIES = ["US", "CA", "MX"];
  const digits = s => String(s || "").replace(/\D/g, "");
  const fmtHS = d => (d.length >= 6 ? d.slice(0, 4) + "." + d.slice(4, 6) : d.length >= 4 ? d.slice(0, 2) + "." + d.slice(2, 4) : d);
  const money = n => (n == null || !isFinite(n) ? "?" : (+n).toFixed(2));
  const pct = n => (+n).toFixed(1) + "%";

  function inRange(code, r) {
    const [a, b] = r.split("-");
    const lo = a, hi = b || a, len = lo.length;
    if (code.length < len) return null; // not enough digits to tell
    const c = code.slice(0, len);
    return c >= lo && c <= hi;
  }
  const inAny = (code, list) => {
    let unknown = false;
    for (const r of list || []) { const v = inRange(code, r); if (v === true) return true; if (v === null) unknown = true; }
    return unknown ? null : false;
  };

  function findRule(hs) {
    const d = digits(hs).slice(0, 6);
    if (d.length < 6) return null;
    if (!window.USMCA_RULES) return null;
    const list = window.USMCA_RULES.list;
    // a subheading-level rule wins over a heading-level rule
    let best = null;
    for (const r of list) {
      const len = r.from.length;
      const c = d.slice(0, len);
      if (c >= r.from && c <= r.to && (!best || len > best.from.length)) best = r;
    }
    return best;
  }
  const covered = hs => !!window.USMCA_RULES && window.USMCA_RULES.coveredChapters.includes(digits(hs).slice(0, 2));

  /* Pick the rule text/alternatives for the chosen context, variant and Appendix table */
  function resolveRule(rule, opts = {}) {
    const out = { alts: [], text: [], notes: [...(rule.notes || [])], warnings: [], auto: !!rule.auto, unsupported: !!rule.unsupported, citation: "", needs: [] };
    if (rule.unsupported) { out.text = rule.text; return out; }
    let node = rule;
    if (rule.auto) {
      const ctx = opts.context;
      if (!ctx) { out.needs.push("context"); return out; }
      node = rule.ctx[ctx];
    }
    if (node.variants) {
      out.variants = Object.entries(node.variants).map(([k, v]) => ({ key: k, label: v.label }));
      const v = node.variants[opts.variant];
      if (!v) { out.needs.push("variant"); return out; }
      node = v;
    }
    out.alts = JSON.parse(JSON.stringify(node.alts));
    out.text = [...node.text];
    out.notes.push(...(node.notes || []));

    // Appendix Tables A.1-E override the RVC thresholds for parts used in vehicles
    const T = opts.table && window.USMCA_RULES && window.USMCA_RULES.appendix[opts.table];
    if (T) {
      let nc = T.nc, tv = T.tv;
      if (T.byDate) {
        const today = (opts.date || new Date().toISOString()).slice(0, 10);
        const row = T.byDate.find(r => today >= r[0]);
        nc = row[1]; tv = row[2];
      }
      const hasTV = out.alts.some(a => a.rvc && a.rvc.tv);
      const newRvc = hasTV ? { tv, nc } : { nc };
      if (T.tsAllowed === false) {
        out.alts = [{ ts: null, rvc: newRvc }];
      } else {
        let hadRvc = false;
        out.alts.forEach(a => { if (a.rvc) { a.rvc = { ...newRvc }; hadRvc = true; } });
        if (!hadRvc) out.alts.push({ ts: null, rvc: newRvc });
        if (T.tsAllowed === null) out.warnings.push("Heavy-truck Table D/E parts: the tool keeps the tariff-shift alternatives of the rule. Confirm with Appendix Article 4 whether a tariff shift alone is enough for your part.");
      }
      out.text.push(`Appendix override — ${T.label}: ${T.text}`);
      out.table = T;
    }
    if (rule.auto && opts.context !== "other" && !opts.table) {
      out.warnings.push("If this part is listed in Appendix Table A.1, B or C (passenger vehicles / light trucks) or Table D or E (heavy trucks), the Appendix RVC thresholds replace the numbers in the rule. Select the table to apply them.");
    }
    return out;
  }

  /* ---------- material helpers ---------- */
  function materialStatus(m) {
    const flag = String(m.orig || "").trim().toUpperCase();
    const ctry = String(m.origin || "").trim().toUpperCase();
    if (flag === "Y" || flag === "YES") return { originating: true };
    if (flag === "N" || flag === "NO") return { originating: false };
    if (PARTIES.includes(ctry)) return { originating: false, unconfirmed: true }; // conservative
    return { originating: false };
  }

  function tsTest(mat, good, alt, rule) {
    if (!alt.ts) return { ok: true, why: "no tariff change required" };
    const m = digits(mat.hts);
    if (alt.except) {
      const ex = inAny(m, alt.except);
      if (ex === true) return { ok: false, why: `classified in ${alt.except.join(", ")}, which the rule excludes` };
      if (ex === null) return { ok: null, why: "HTS code too short to test the exclusion" };
    }
    if (alt.allow) {
      const al = inAny(m, alt.allow);
      if (al === true) return { ok: true, allowed: true, why: `allowed from ${alt.allow.join(", ")} under this alternative's conditions` };
    }
    const need = { CC: 2, CTH: 4, CTSH: 6, GROUP: 4 }[alt.ts];
    if (m.length < need) return { ok: null, why: `HTS code missing or too short (need ${need} digits)` };
    const g = good.hs6;
    switch (alt.ts) {
      case "CC": return m.slice(0, 2) !== g.slice(0, 2) ? { ok: true, why: "changes chapter" } : { ok: false, why: `same chapter ${g.slice(0, 2)} — no change of chapter` };
      case "CTH": return m.slice(0, 4) !== g.slice(0, 4) ? { ok: true, why: "changes heading" } : { ok: false, why: `same heading ${fmtHS(g.slice(0, 4))} — no change of heading` };
      case "CTSH": return m.slice(0, 6) !== g.slice(0, 6) ? { ok: true, why: "changes subheading" } : { ok: false, why: `same subheading ${fmtHS(g)} — no change of subheading` };
      case "GROUP": {
        const lo = rule.from.slice(0, 4), hi = rule.to.slice(0, 4), h = m.slice(0, 4);
        return h < lo || h > hi ? { ok: true, why: "comes from a heading outside the group" }
          : { ok: false, why: `heading ${fmtHS(h)} is inside the group ${fmtHS(lo)}-${fmtHS(hi)} — no change outside the group` };
      }
    }
    return { ok: null, why: "unknown rule type" };
  }

  const sum = arr => arr.reduce((s, x) => s + (x || 0), 0);
  const allHave = (arr, k) => arr.every(x => x[k] != null && isFinite(x[k]));

  function rvcTest(rvc, good, vnm, vnmKnown) {
    const res = { method: null, pass: null, lines: [], result_pct: null, threshold_pct: null, base_value: null };
    if (!vnmKnown) { res.lines.push("Value of every non-originating material is needed for the RVC calculation."); return res; }
    const tries = [];
    if (rvc.tv != null && good.tv > 0) tries.push(["TV", good.tv, rvc.tv]);
    if (rvc.nc != null && good.nc > 0) tries.push(["NC", good.nc, rvc.nc]);
    if (!tries.length) {
      res.lines.push(rvc.tv != null ? "Enter the transaction value (FOB) or the net cost of the good to calculate RVC." : "This rule allows only the net cost method — enter the net cost of the good.");
      return res;
    }
    for (const [mth, base, thr] of tries) {
      const v = ((base - vnm) / base) * 100;
      res.lines.push(`${mth}: (${money(base)} - ${money(vnm)}) / ${money(base)} x 100 = ${pct(v)} (required ${thr}%) — ${v >= thr ? "PASS" : "FAIL"}`);
      if (res.pass !== true) Object.assign(res, { method: mth, result_pct: +v.toFixed(2), threshold_pct: thr, base_value: base, pass: v >= thr });
    }
    return res;
  }

  /* ---------- evaluate one alternative ---------- */
  function evalAlt(alt, ctx) {
    const { good, mats, rule, isAuto } = ctx;
    const nonOrig = mats.filter(m => !m.st.originating);
    const r = { alt, ts: true, weight: true, rvc: true, notes: [], fails: [], unknown: [], dm: null, rvcRes: null, perMat: new Map() };

    // 1. tariff shift
    for (const m of nonOrig) {
      const t = tsTest(m, good, alt, rule);
      r.perMat.set(m, t);
      if (t.ok === false) r.fails.push(m);
      if (t.ok === null) r.unknown.push(m);
    }
    if (r.fails.length || r.unknown.length) {
      const bad = [...r.fails, ...r.unknown];
      const bases = [];
      if (good.tv > 0) bases.push(["TV", "transaction value (FOB)", good.tv]);
      if (good.tc > 0) bases.push(["TOTAL_COST", "total cost", good.tc]);
      const dm = { tested: true, applied: false, type: "TARIFF_SHIFT", base: null, base_value: null, failing_value: null, percentage: null, limit_pct: 10, exception: null, result: "CANNOT_TEST", calculation: "", comment: "" };
      const ch = good.hs6.slice(0, 2);
      if (ch >= "50" && ch <= "63") { dm.exception = "Textile/apparel goods (Chapters 50-63) use the weight-based de minimis in Chapter 6, not the 10% value test."; dm.result = "NOT_APPLICABLE"; }
      else if (ch <= "27") { dm.exception = "Annex 4-A: for goods of Chapters 1-27 the value de minimis does not apply to materials in the same subheading, and several food materials are excluded. Not applied by the free checker."; dm.result = "NOT_APPLICABLE"; }
      else if (!allHave(bad, "value")) { dm.comment = "Values of the materials that fail the tariff shift are needed to test de minimis."; }
      else if (!bases.length) { dm.comment = "Enter the transaction value (FOB) or total cost of the good to test de minimis."; }
      else {
        const fv = sum(bad.map(m => m.value));
        let best = null;
        for (const [k, label, b] of bases) { const p = (fv / b) * 100; if (!best || p < best.p) best = { k, label, b, p }; }
        Object.assign(dm, { base: best.k, base_value: best.b, failing_value: fv, percentage: +best.p.toFixed(2), result: best.p <= 10 ? "PASS" : "FAIL",
          calculation: `${money(fv)} / ${money(best.b)} (${best.label}) x 100 = ${pct(best.p)} ${best.p <= 10 ? "<=" : ">"} 10%`,
          comment: r.unknown.length ? "Includes materials whose tariff shift could not be tested (counted as failing)." : "" });
        dm.applied = best.p <= 10;
      }
      r.dm = dm;
      if (dm.applied) r.ts = true;
      else if ((dm.result === "FAIL" || dm.result === "NOT_APPLICABLE") && r.fails.length && !r.unknown.length) r.ts = false;
      else r.ts = null; // de minimis could not be tested, or some tariff shifts could not be tested
      if (dm.applied && isAuto) r.notes.push("De minimis (Art. 4.12) was applied to an automotive part — confirm it is not limited by the Appendix for your part.");
    }

    // 2. weight condition (e.g. 70% by weight of steel materials originating)
    if (alt.weight) {
      const inScope = mats.filter(m => inAny(digits(m.hts), alt.weight.codes) === true);
      if (inScope.length) {
        if (!allHave(inScope, "weight")) { r.weight = null; r.notes.push(`Weights are needed for the materials of ${alt.weight.codes.join(", ")} to test the ${alt.weight.pct}% originating-by-weight condition.`); }
        else {
          const tot = sum(inScope.map(m => m.weight)), og = sum(inScope.filter(m => m.st.originating).map(m => m.weight));
          const p = tot > 0 ? (og / tot) * 100 : 0;
          r.weight = p >= alt.weight.pct;
          r.weightLine = `Originating weight of ${alt.weight.codes.join(", ")} materials: ${og} / ${tot} = ${pct(p)} (required ${alt.weight.pct}%) — ${r.weight ? "PASS" : "FAIL"}`;
        }
      }
    }

    // 3. regional value content
    if (alt.rvc) {
      const vnmKnown = allHave(nonOrig, "value");
      const vnm = sum(nonOrig.map(m => m.value));
      const res = rvcTest(alt.rvc, good, vnm, vnmKnown);
      res.vnm = vnmKnown ? vnm : null;
      // RVC de minimis (Art. 4.12.3)
      if (res.pass !== true && vnmKnown && !isAuto) {
        const bases = [["TV", good.tv], ["TOTAL_COST", good.tc]].filter(b => b[1] > 0);
        for (const [k, b] of bases) {
          const p = (vnm / b) * 100;
          if (p <= 10) {
            res.waived = { base: k, base_value: b, percentage: +p.toFixed(2), line: `All non-originating materials ${money(vnm)} / ${money(b)} x 100 = ${pct(p)} <= 10% — RVC requirement waived (Art. 4.12.3)` };
            res.pass = true; break;
          }
        }
      }
      r.rvcRes = res;
      r.rvc = res.pass;
    }
    const parts = [r.ts, r.weight, r.rvc];
    r.pass = parts.includes(false) ? false : parts.includes(null) ? null : true;
    return r;
  }

  function describeAlt(a) {
    const ts = { CC: "change of chapter", CTH: "change of heading", CTSH: "change of subheading", GROUP: "change from outside the heading group" }[a.ts] || "no tariff change required";
    const bits = [ts];
    if (a.except) bits.push("except from " + a.except.join(", "));
    if (a.allow) bits.push("materials of " + a.allow.join(", ") + " allowed");
    if (a.weight) bits.push(`${a.weight.pct}% by weight of ${a.weight.codes.join(", ")} originating`);
    if (a.rvc) bits.push("RVC " + [a.rvc.tv != null ? a.rvc.tv + "% TV" : null, a.rvc.nc != null ? a.rvc.nc + "% NC" : null].filter(Boolean).join(" or "));
    return bits.join("; ");
  }

  /* ---------- main ---------- */
  function evaluate(input) {
    const hs = digits(input.hts);
    const good = { hs6: hs.slice(0, 6), tv: +input.transactionValue || 0, nc: +input.netCost || 0, tc: +input.totalCost || 0, country: input.productionCountry };
    const mats = (input.bom || []).filter(m => (m.description || m.part || m.hts)).map(m => ({ ...m, value: m.value === "" || m.value == null ? null : +m.value, weight: m.weight === "" || m.weight == null ? null : +m.weight, st: materialStatus(m) }));
    const rule = input.rule;              // resolved rule
    const base = input.ruleBase;          // raw rule from DB (for GROUP ranges) or manual
    const isAuto = !!(rule && rule.auto) || !!input.automotive;
    const out = {
      status: "INSUFFICIENT_INFORMATION", summary: "",
      hs_check: { hs6: fmtHS(good.hs6), user_hts: input.hts, consistent: null, comment: "The free checker does not verify classification. Confirm the HTS code before relying on the result." },
      applicable_rule: { citation: input.citation || "", rule_text_summary: (rule && rule.text || []).join(" "), certainty: input.manual ? "uncertain" : "certain" },
      origin_criterion: null, method_of_qualification: null, country_of_origin: null,
      rvc: { required: false }, de_minimis: { tested: false, applied: false, result: "NOT_APPLICABLE" },
      materials: [], reasons: [], disqualification_reasons: [], missing_information: [], warnings: [...((rule && rule.warnings) || []), ...((rule && rule.notes) || [])],
      confidence: "Rule-based calculation (no AI)", engine: "free",
    };
    if (input.manual) out.warnings.unshift("You entered the rule yourself — check it against Annex 4-B for your HS code.");
    if (good.hs6.length < 6) { out.missing_information.push("HTS code of the final good (at least 6 digits)."); out.summary = "Enter a valid HTS code."; return out; }
    if (!PARTIES.includes(good.country)) { out.missing_information.push("Country of production (US, CA or MX)."); }
    if (!mats.length) { out.missing_information.push("Bill of materials lines."); out.summary = "Add the bill of materials."; return out; }
    if (rule && rule.unsupported) {
      out.summary = "This product is not covered by the free checker. Use “Check with my Claude” or ask a professional.";
      out.warnings.push(...rule.notes); return out;
    }
    const unconfirmed = mats.filter(m => m.st.unconfirmed);
    if (unconfirmed.length) out.warnings.push(`${unconfirmed.length} material(s) come from a USMCA country but are not confirmed as USMCA-originating (column "USMCA originating" = Y). They are treated as NON-originating. Mark them Y only if you hold supplier certifications.`);
    const noVal = mats.filter(m => m.value == null);
    if (noVal.length) out.missing_information.push(`Value per unit for ${noVal.length} material line(s) — needed for RVC and de minimis.`);
    out.country_of_origin = PARTIES.includes(good.country) ? good.country : null;
    const matRow = (m, t) => ({ line: m.line || "", part_number: m.part || "", description: m.description || "", hts: m.hts || "", origin: m.origin || "", value: m.value, originating: m.st.originating, tariff_shift_ok: m.st.originating ? null : (t ? t.ok : null), note: m.st.originating ? "USMCA originating (per BOM)" : (m.st.unconfirmed ? "USMCA country, not confirmed — treated as non-originating. " : "") + (t ? t.why : "") });

    // Criterion C: every material originating
    if (mats.every(m => m.st.originating)) {
      Object.assign(out, { status: "QUALIFIES", origin_criterion: "C", method_of_qualification: "NO",
        summary: "All materials in the BOM are marked USMCA-originating, so the good qualifies under criterion C (produced exclusively from originating materials).",
        materials: mats.map(m => matRow(m)) });
      out.reasons.push("Every BOM line is marked USMCA originating (Art. 4.2(c)). Keep the supplier certifications that support this.");
      if (!PARTIES.includes(good.country)) out.status = "INSUFFICIENT_INFORMATION";
      return out;
    }
    if (!rule || !rule.alts || !rule.alts.length) { out.summary = "Choose the applicable rule first."; return out; }

    const ctx = { good, mats, rule: base || { from: good.hs6, to: good.hs6 }, isAuto };
    const results = rule.alts.map(a => evalAlt(a, ctx));
    const win = results.find(r => r.pass === true);
    const show = win || results.find(r => r.pass === null) || results[0];
    out.materials = mats.map(m => matRow(m, show.perMat.get(m)));

    results.forEach((r, i) => {
      const label = `Alternative ${i + 1} (${describeAlt(r.alt)})`;
      const st = r.pass === true ? "MET" : r.pass === false ? "NOT MET" : "CANNOT TELL (missing data)";
      out.reasons.push(`${label}: ${st}.`);
      if (r.dm && r.dm.result !== "CANNOT_TEST") out.reasons.push(`  De minimis: ${r.dm.calculation}`);
      if (r.weightLine) out.reasons.push("  " + r.weightLine);
      if (r.rvcRes) { r.rvcRes.lines.forEach(l => out.reasons.push("  " + l)); if (r.rvcRes.waived) out.reasons.push("  " + r.rvcRes.waived.line); }
      r.notes.forEach(n => out.warnings.push(n));
    });

    const setRvc = r => {
      if (!r.rvcRes) return;
      const x = r.rvcRes;
      out.rvc = { required: true, method: x.method, base_value: x.base_value, vnm: x.vnm, result_pct: x.result_pct, threshold_pct: x.threshold_pct, pass: x.pass, calculation: x.lines.join(" | ") + (x.waived ? " | " + x.waived.line : "") };
    };
    const setDm = r => { if (r.dm) out.de_minimis = r.dm; };

    if (win) {
      out.status = "QUALIFIES";
      out.origin_criterion = "B";
      setRvc(win); setDm(win);
      if (win.rvcRes && win.rvcRes.waived) {
        out.method_of_qualification = win.alt.ts ? "TS" : (win.rvcRes.waived.base === "TV" ? "TV" : null);
        out.de_minimis = { tested: true, applied: true, type: "RVC", base: win.rvcRes.waived.base, base_value: win.rvcRes.waived.base_value, failing_value: win.rvcRes.vnm, percentage: win.rvcRes.waived.percentage, limit_pct: 10, exception: null, result: "PASS", calculation: win.rvcRes.waived.line, comment: "" };
        if (!win.alt.ts) out.warnings.push("Qualified through the RVC de minimis waiver — the template has no dedicated method code. Confirm the method code (field 10) with a compliance professional.");
      } else if (win.alt.rvc) out.method_of_qualification = win.rvcRes.method;
      else out.method_of_qualification = "TS";
      const how = win.alt.rvc ? `regional value content (${out.method_of_qualification})` : "tariff shift";
      out.summary = `The good meets the product-specific rule by ${how}${win.dm && win.dm.applied ? " with the 10% de minimis tolerance" : ""}, so it qualifies under criterion B.`;
      if (!out.country_of_origin) out.status = "INSUFFICIENT_INFORMATION";
      return out;
    }

    // Criterion D (Art. 4.2(d)) — failing parts classified in the same subheading as the good
    if (!isAuto && !["61", "62", "63"].includes(good.hs6.slice(0, 2))) {
      const tsAlt = results.find(r => r.alt.ts && r.fails.length && !r.unknown.length);
      if (tsAlt && tsAlt.fails.every(m => digits(m.hts).slice(0, 6) === good.hs6)) {
        const nonOrig = mats.filter(m => !m.st.originating);
        if (allHave(nonOrig, "value")) {
          const res = rvcTest({ tv: 60, nc: 50 }, good, sum(nonOrig.map(m => m.value)), true);
          if (res.pass) {
            Object.assign(out, { status: "QUALIFIES", origin_criterion: "D", method_of_qualification: res.method,
              summary: `The parts that fail the tariff shift are classified in the same subheading as the good, and the RVC is ${pct(res.result_pct)} — criterion D (Art. 4.2(d)).` });
            out.rvc = { required: true, method: res.method, base_value: res.base_value, vnm: sum(nonOrig.map(m => m.value)), result_pct: res.result_pct, threshold_pct: res.threshold_pct, pass: true, calculation: res.lines.join(" | ") };
            out.warnings.push("Criterion D applies only when the failing materials are provided for as PARTS in the same subheading (or unassembled goods under GRI 2(a)). Confirm this with a professional.");
            return out;
          }
        }
      }
    }

    if (results.some(r => r.pass === null)) {
      out.status = "INSUFFICIENT_INFORMATION";
      out.summary = "The result depends on missing information (HTS codes, values or weights). Complete the items listed below.";
      const r = results.find(x => x.pass === null);
      setRvc(r); setDm(r);
      r.unknown.forEach(m => out.missing_information.push(`HTS code for "${m.description || m.part}" (line ${m.line || "?"}).`));
      return out;
    }

    out.status = "DOES_NOT_QUALIFY";
    out.country_of_origin = null;
    out.summary = "None of the alternatives in the product-specific rule is met with the BOM as entered.";
    const first = results[0];
    setRvc(results.find(r => r.rvcRes) || first); setDm(first);
    first.fails.forEach(m => out.disqualification_reasons.push(`"${m.description || m.part}" (HTS ${m.hts || "?"}, origin ${m.origin || "?"}, value ${money(m.value)}) is non-originating and ${first.perMat.get(m).why}.`));
    if (first.dm && first.dm.result === "FAIL") out.disqualification_reasons.push(`De minimis does not save it: ${first.dm.calculation}.`);
    results.forEach((r, i) => {
      if (r.rvcRes && r.rvcRes.pass === false) out.disqualification_reasons.push(`Alternative ${i + 1}: RVC ${pct(r.rvcRes.result_pct)} is below the required ${r.rvcRes.threshold_pct}% (${r.rvcRes.method}).`);
      if (r.weight === false) out.disqualification_reasons.push(`Alternative ${i + 1}: ${r.weightLine}.`);
    });
    out.disqualification_reasons.push("What could change the result: source the failing materials from USMCA suppliers (with certifications), confirm that 'USMCA country' materials are actually originating, or check whether an RVC alternative can be met with full cost data.");
    return out;
  }

  window.USMCA_ENGINE = { findRule, resolveRule, evaluate, covered, digits, fmtHS, describeAlt };
})();
