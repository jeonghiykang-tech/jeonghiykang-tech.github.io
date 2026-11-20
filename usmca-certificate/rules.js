/* USMCA / CUSMA product-specific rules of origin — built-in database
 * Source: CUSMA Chapter 4, Annex 4-B and Appendix to Annex 4-B (Automotive Goods),
 *   Global Affairs Canada consolidation:
 *   https://www.international.gc.ca/trade-commerce/trade-agreements-accords-commerciaux/agr-acc/cusma-aceum/text-texte/04.aspx?lang=eng
 *   (read Nov 20, 2026). Only the rules in force now are included; transitional rules that ended
 *   on or before Jan 1, 2023 are not included.
 *
 * Structure
 *   from/to : HS codes (4 digits = heading, 6 digits = subheading) — the rule covers from..to
 *   text    : official rule text (verbatim) shown to the user
 *   alts    : alternative ways to qualify (the good needs to meet ONE)
 *     ts     : "CC" change of chapter | "CTH" change of heading | "CTSH" change of subheading
 *              | "GROUP" change from any heading outside the from..to group | null = no change required
 *     except : material codes that are NOT allowed even if they change classification
 *     allow  : material codes that are allowed without the change (only with this alternative's conditions)
 *     rvc    : { tv, nc } minimum regional value content (%), either method; { nc } = net cost only
 *     weight : { codes, pct } at least pct % by weight of the materials of these codes must be originating
 *   notes   : points the user must check
 *   auto    : automotive good — context ("pvlt" | "ht" | "other") and variants are chosen by the user
 */
(function () {
  const STEEL = ["7208-7229", "7301-7326"];
  const S7308 = ["7208", "7211", "7216", "7225", "7226"];
  const TV_NC = (tv, nc) => ({ tv, nc });
  const NC = nc => ({ nc });
  const steelHeavy = (code, tv, nc) => ({
    alts: [
      { ts: "CTH", except: STEEL },
      { ts: "CTH", allow: STEEL, weight: { codes: STEEL, pct: 70 } },
      { ts: null, rvc: TV_NC(tv, nc) },
    ],
    text: [
      `A change to ${code} from any other heading, except from heading 72.08 through 72.29 or 73.01 through 73.26; or`,
      `A change to ${code} from heading 72.08 through 72.29 or 73.01 through 73.26, provided that at least 70 percent by weight of the materials of heading 72.08 through 72.29 and 73.01 through 73.26 is originating; or`,
      `No required change in tariff classification to ${code}, provided there is a regional value content of not less than: (a) ${tv} percent where the transaction value method is used; or (b) ${nc} percent where the net cost method is used.`,
    ],
  });
  const structural = (sub, tv, nc) => ({
    alts: [
      { ts: "CTH", except: S7308 },
      { ts: "CTH", allow: S7308, weight: { codes: S7308, pct: 70 } },
      { ts: null, rvc: tv ? TV_NC(tv, nc) : NC(nc) },
    ],
    text: [
      `A change to subheading ${sub} from any other heading, except from heading 72.08, 72.11, 72.16, 72.25 or 72.26; or`,
      `A change to subheading ${sub} from heading 72.08, 72.11, 72.16, 72.25 or 72.26, provided that at least 70 percent by weight of the materials of heading 72.08, 72.11, 72.16, 72.25 and 72.26 is originating; or`,
      tv
        ? `No required change in tariff classification to subheading ${sub} provided there is a regional value content of not less than: (a) ${tv} percent where the transaction value method is used; or (b) ${nc} percent where the net cost method is used.`
        : `No required change in tariff classification to subheading ${sub} provided there is a regional value content of not less than ${nc} percent where the net cost method is used.`,
    ],
  });
  const cthOrParts = (code, partSub, tv, nc) => ({
    alts: [{ ts: "CTH" }, { ts: "CTH", allow: [partSub], rvc: TV_NC(tv, nc) }],
    text: [
      `A change to ${code} from any other heading; or`,
      `A change to ${code} from subheading ${partSub.slice(0, 4)}.${partSub.slice(4)}, whether or not there is also a change from any other heading, provided there is a regional value content of not less than: (a) ${tv} percent where the transaction value method is used; or (b) ${nc} percent where the net cost method is used.`,
    ],
  });
  const R = [];
  const add = (from, to, o) => R.push({ from, to: to || from, ...o });

  /* ---------------- Chapter 72 Iron and Steel ---------------- */
  add("7201", null, { alts: [{ ts: "CC" }], text: ["72.01 A change to heading 72.01 from any other chapter."] });
  add("720211", "720260", { alts: [{ ts: "CC" }], text: ["7202.11-7202.60 A change to subheading 7202.11 through 7202.60 from any other chapter."] });
  add("720270", null, { alts: [{ ts: "CC", except: ["261310"] }], text: ["7202.70 A change to subheading 7202.70 from any other chapter, except from subheading 2613.10."] });
  add("720280", "720299", { alts: [{ ts: "CC" }], text: ["7202.80-7202.99 A change to subheading 7202.80 through 7202.99 from any other chapter."] });
  add("7203", "7205", { alts: [{ ts: "CC" }], text: ["72.03-72.05 A change to heading 72.03 through 72.05 from any other chapter."] });
  add("7206", "7207", { alts: [{ ts: "GROUP" }], text: ["72.06-72.07 A change to heading 72.06 through 72.07 from any heading outside that group."] });
  add("7208", "7216", { alts: [{ ts: "GROUP" }], text: ["72.08-72.16 A change to heading 72.08 through 72.16 from any heading outside that group."] });
  add("7217", null, { alts: [{ ts: "CTH", except: ["7213-7215"] }], text: ["72.17 A change to heading 72.17 from any other heading, except from heading 72.13 through 72.15."] });
  add("7218", "7222", { alts: [{ ts: "GROUP" }], text: ["72.18-72.22 A change to heading 72.18 through 72.22 from any heading outside that group."] });
  add("7223", null, { alts: [{ ts: "CTH", except: ["7221-7222"] }], text: ["72.23 A change to heading 72.23 from any other heading, except from heading 72.21 through 72.22."] });
  add("7224", "7228", { alts: [{ ts: "GROUP" }], text: ["72.24-72.28 A change to heading 72.24 through 72.28 from any heading outside that group."] });
  add("7229", null, { alts: [{ ts: "CTH", except: ["7227-7228"] }], text: ["72.29 A change to heading 72.29 from any other heading, except from heading 72.27 through 72.28."] });

  /* ---------------- Chapter 73 Articles of Iron or Steel ---------------- */
  add("7301", "7303", { alts: [{ ts: "CC" }], text: ["73.01-73.03 A change to heading 73.01 through 73.03 from any other chapter."] });
  add("730411", "730439", { alts: [{ ts: "CC" }], text: ["7304.11-7304.39 A change to subheading 7304.11 through 7304.39 from any other chapter."] });
  add("730441", null, { alts: [{ ts: "CC" }], text: ["7304.41 A change to subheading 7304.41 from any other chapter."],
    notes: ["Tariff item 7304.41.aa has its own rule: a change from subheading 7304.49 or any other chapter. Check the Party-specific tariff item table in Annex 4-B."] });
  add("730449", "730490", { alts: [{ ts: "CC" }], text: ["7304.49-7304.90 A change to subheading 7304.49 through 7304.90 from any other chapter."] });
  { const s = steelHeavy("heading 73.05 through 73.07", 75, 65); add("7305", "7307", { alts: s.alts, text: s.text }); }
  { const s = structural("7308.10", 75, 65); add("730810", null, s); }
  { const s = structural("7308.20", 65, 55); add("730820", null, s); }
  { const s = structural("7308.30", 75, 65); add("730830", null, s); }
  { const s = structural("7308.40", 65, 55); add("730840", null, s); }
  { const s = structural("7308.90", null, 65); add("730890", null, s); }
  add("7309", "7311", { alts: [{ ts: "GROUP" }], text: ["73.09-73.11 A change to heading 73.09 through 73.11 from any heading outside that group."] });
  { const s = steelHeavy("subheading 7312.10", 75, 65); add("731210", null, s); }
  add("731290", null, { alts: [{ ts: "CTH" }], text: ["7312.90 A change to subheading 7312.90 from any other heading."] });
  { const s = steelHeavy("heading 73.13", 75, 65); add("7313", null, s); }
  add("731412", "731414", { alts: [{ ts: "CTH" }], text: ["7314.12-7314.14 A change to subheading 7314.12 through 7314.14 from any other heading."] });
  { const s = steelHeavy("subheading 7314.19", 75, 65); add("731419", null, s); }
  add("731420", null, { alts: [{ ts: "CTH" }], text: ["7314.20 A change to subheading 7314.20 from any other heading."] });
  { const s = steelHeavy("subheading 7314.31 through 7314.49", 75, 65); add("731431", "731449", s); }
  add("731450", null, { alts: [{ ts: "CTH" }], text: ["7314.50 A change to subheading 7314.50 from any other heading."] });
  { const s = cthOrParts("subheading 7315.11 through 7315.12", "731519", 60, 50); add("731511", "731512", s); }
  add("731519", null, { alts: [{ ts: "CTH" }], text: ["7315.19 A change to subheading 7315.19 from any other heading."] });
  { const s = cthOrParts("subheading 7315.20 through 7315.81", "731590", 60, 50); add("731520", "731581", s); }
  { const s = steelHeavy("subheading 7315.82 through 7315.89", 75, 65); add("731582", "731589", s); }
  add("731590", null, { alts: [{ ts: "CTH" }], text: ["7315.90 A change to subheading 7315.90 from any other heading."] });
  add("7316", null, { alts: [{ ts: "CTH", except: ["7312", "7315"] }], text: ["73.16 A change to heading 73.16 from any other heading, except from heading 73.12 or 73.15."] });
  { const s = steelHeavy("heading 73.17", 75, 65); add("7317", null, s); }
  add("7318", null, { alts: [{ ts: "CTH", except: ["7317"] }], text: ["73.18 A change to heading 73.18 from any other heading, except from heading 73.17."] });
  add("7319", "7320", { alts: [{ ts: "GROUP" }], text: ["73.19-73.20 A change to heading 73.19 through 73.20 from any heading outside that group."] });
  { const s = cthOrParts("subheading 7321.11", "732190", 60, 50); add("732111", null, { ...s,
    notes: ["Tariff item 7321.11.aa has its own rule (a change from any other subheading, except from tariff item 7321.90.aa, 7321.90.bb or 7321.90.cc)."] }); }
  { const s = cthOrParts("subheading 7321.12 through 7321.89", "732190", 60, 50); add("732112", "732189", s); }
  add("732190", null, { alts: [{ ts: "CTH" }], text: ["7321.90 A change to subheading 7321.90 from any other heading."],
    notes: ["Tariff items 7321.90.aa, .bb and .cc have their own rules (a change from any other tariff item)."] });
  add("7322", "7323", { alts: [{ ts: "GROUP" }], text: ["73.22-73.23 A change to heading 73.22 through 73.23 from any heading outside that group."] });
  { const s = cthOrParts("subheading 7324.10 through 7324.29", "732490", 60, 50); add("732410", "732429", s); }
  add("732490", null, { alts: [{ ts: "CTH" }], text: ["7324.90 A change to subheading 7324.90 from any other heading."] });
  add("7325", "7326", { alts: [{ ts: "GROUP" }], text: ["73.25-73.26 A change to heading 73.25 through 73.26 from any heading outside that group."] });

  /* ---------------- Chapter 87 Vehicles and parts ---------------- */
  add("8701", "8706", { unsupported: true, text: ["87.01-87.08 The Appendix (Provisions Related to the Product-Specific Rules of Origin for Automotive Goods) includes the product-specific rules for a good of heading 87.01 through 87.08."],
    notes: ["Vehicles and chassis (87.01-87.06) need vehicle-level tests (core parts, steel and aluminum purchases, labor value content). The free checker does not cover them — please get a professional review."] });

  // Automotive parts: contexts pvlt = passenger vehicle / light truck, ht = heavy truck, other = any other good (incl. aftermarket)
  const X = { pvlt: 70, ht: 70, other: 50 };
  const ctxRule = (fn) => ({ pvlt: fn("pvlt"), ht: fn("ht"), other: fn("other") });
  const sub = c => c.slice(0, 4) + "." + c.slice(4);
  const simpleParts = (code, partFrom) => ctxRule(c => ({
    alts: [{ ts: "CTH" }, { ts: "CTH", allow: partFrom, rvc: NC(X[c]) }],
    text: [`A change to subheading ${sub(code)} from any other heading; or`,
      `A change to subheading ${sub(code)} from subheading ${partFrom.map(sub).join(" or ")}, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`],
  }));
  const autoAdd = (code, ctx, extra = {}) => add(code, null, { auto: true, ctx, ...extra });

  add("8707", null, { auto: true, ctx: {
    pvlt: { alts: [{ ts: null, rvc: NC(75) }], text: ["For a good of heading 87.07 for use in a passenger vehicle or light truck: No required change in tariff classification to heading 87.07, provided there is a regional value content of not less than 75 percent under the net cost method."] },
    ht: { alts: [{ ts: "CC" }, { ts: "CC", allow: ["8708"], rvc: NC(70) }], text: ["For a good of heading 87.07 for use in a heavy truck: A change to heading 87.07 from any other chapter; or", "A change to heading 87.07 from heading 87.08, whether or not there is also a change from any other chapter, provided there is a regional value content of not less than 70 percent under the net cost method."] },
    other: { alts: [{ ts: "CC" }, { ts: "CC", allow: ["8708"], rvc: NC(60) }], text: ["For any other good of heading 87.07: A change to heading 87.07 from any other chapter; or", "A change to heading 87.07 from heading 87.08, whether or not there is also a change from any other chapter, provided there is a regional value content of not less than 60 percent under the net cost method."] },
  } });
  autoAdd("870810", simpleParts("870810", ["870899"]));
  autoAdd("870821", simpleParts("870821", ["870899"]));
  autoAdd("870829", {
    pvlt: { variants: {
      body: { label: "Body stamping", alts: [{ ts: null, rvc: NC(75) }], text: ["For a body stamping of subheading 8708.29 for use in a passenger vehicle or light truck: No required change in tariff classification to a body stamping of subheading 8708.29, provided there is a regional value content of at least 75 percent under the net cost method."] },
      other: { label: "Any other good of 8708.29", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(70) }], text: ["For any other good of subheading 8708.29 for use in a passenger vehicle, light truck or heavy truck: A change to subheading 8708.29 from any other heading; or", "No required change in tariff classification to subheading 8708.29, provided there is a regional value content of not less than 70 percent under the net cost method."] } } },
    ht: { alts: [{ ts: "CTH" }, { ts: null, rvc: NC(70) }], text: ["For any other good of subheading 8708.29 for use in a passenger vehicle, light truck or heavy truck: A change to subheading 8708.29 from any other heading; or", "No required change in tariff classification to subheading 8708.29, provided there is a regional value content of not less than 70 percent under the net cost method."] },
    other: { alts: [{ ts: "CTH" }, { ts: null, rvc: NC(50) }], text: ["For any other good of subheading 8708.29: A change to subheading 8708.29 from any other heading; or", "No required change in tariff classification to subheading 8708.29, provided there is a regional value content of not less than 50 percent under the net cost method."] },
  });
  autoAdd("870830", ctxRule(c => ({
    alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870830", "870899"], rvc: NC(X[c]) }],
    text: [`A change to mounted brake linings (or any other good) of subheading 8708.30 from any other heading; or`,
      `A change to mounted brake linings of subheading 8708.30 from parts of mounted brake linings, brakes or servo-brakes of subheading 8708.30 or 8708.99 (for any other good: from mounted brake linings or parts of brakes or servo-brakes of subheading 8708.30, or 8708.99), whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`],
    notes: ["Materials of 8708.30 are only allowed if they are parts of brakes / mounted brake linings as described in the rule."],
  })));
  autoAdd("870840", {
    pvlt: { alts: [{ ts: null, rvc: NC(75) }], text: ["For a good of subheading 8708.40 for use in a passenger vehicle or light truck: No required change in tariff classification to subheading 8708.40, provided there is a regional value content of not less than 75 percent under the net cost method."] },
    ht: { alts: [{ ts: null, rvc: NC(70) }], text: ["For a good of subheading 8708.40 for use in a heavy truck: No required change in tariff classification to subheading 8708.40, provided there is a regional value content of not less than 70 percent under the net cost method."] },
    other: { variants: {
      gearbox: { label: "Gear boxes", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870840", "870899"], rvc: NC(50) }], text: ["A change to gear boxes of subheading 8708.40 from any other heading; or", "A change to gear boxes of subheading 8708.40 from any other good of subheading 8708.40 or 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than 50 percent under the net cost method;"] },
      other: { label: "Any other good of 8708.40", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(50) }], text: ["A change to any other good of subheading 8708.40 from any other heading; or", "No required change in tariff classification to any other good of subheading 8708.40, provided there is a regional value content of not less than 50 percent under the net cost method."] } } },
  });
  const axle = c => ({ variants: {
    drive8703: { label: "Drive-axles with differential, for vehicles of heading 87.03", alts: [{ ts: "CTH", except: ["848210-848280"] }, { ts: "CTH", allow: ["848210-848280", "870850"], rvc: NC(X[c]) }],
      text: ["A change to drive-axles with differential, whether or not provided with other transmission components, for vehicles of heading 87.03, of subheading 8708.50 from any other heading, except from subheading 8482.10 through 8482.80; or", `... from subheading 8482.10 through 8482.80 or parts of drive-axles of subheading 8708.50, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method;`] },
    driveOther: { label: "Other drive-axles with differential", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870899"], rvc: NC(X[c]) }],
      text: ["A change to other drive-axles with differential, whether or not provided with other transmission components, of subheading 8708.50 from any other heading; or", `... from subheading 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method;`] },
    non8703: { label: "Non-driving axles and parts thereof, for vehicles of heading 87.03", alts: [{ ts: "CTH", except: ["848210-848280"] }, { ts: "CTH", allow: ["848210-848280", "870899"], rvc: NC(X[c]) }],
      text: ["A change to non-driving axles and parts thereof, for vehicles of heading 87.03, of subheading 8708.50 from any other heading, except from subheading 8482.10 through 8482.80; or", `... from subheading 8482.10 through 8482.80 or 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method;`] },
    nonOther: { label: "Other non-driving axles and parts thereof", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870899"], rvc: NC(X[c]) }],
      text: ["A change to other non-driving axles and parts thereof of subheading 8708.50 from any other heading; or", `... from subheading 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method;`] },
    other: { label: "Any other good of 8708.50", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(X[c]) }],
      text: ["A change to any other good of subheading 8708.50 from any other heading; or", `No required change in tariff classification to any other good of subheading 8708.50, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`] } } });
  autoAdd("870850", {
    pvlt: { alts: [{ ts: null, rvc: NC(75) }], text: ["For a good of subheading 8708.50 for use in a passenger vehicle or light truck: No required change in tariff classification to subheading 8708.50, provided there is a regional value content of not less than 75 percent under the net cost method."] },
    ht: axle("ht"), other: axle("other"),
  });
  autoAdd("870870", simpleParts("870870", ["870899"]));
  const susp = c => ({ variants: {
    mcpherson: { label: "McPherson struts", alts: [{ ts: "CTSH", allow: ["870880"], rvc: NC(50) }], text: ["A change to McPherson struts of subheading 8708.80 from parts thereof of subheading 8708.80 or any other subheading, provided there is a regional value content of not less than 50 percent under the net cost method;"] },
    system: { label: "Suspension systems (including shock absorbers)", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870880", "870899"], rvc: NC(X[c]) }], text: ["A change to any other good subheading 8708.80 from any other heading;", `A change to suspension systems (including shock absorbers) of subheading 8708.80 from parts thereof of subheading 8708.80 or 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method; or`] },
    parts: { label: "Parts of suspension systems", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(X[c]) }], text: ["A change to any other good subheading 8708.80 from any other heading;", `No required change in tariff classification to parts of suspension systems (including shock absorbers) of subheading 8708.80, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`] } } });
  autoAdd("870880", {
    pvlt: { alts: [{ ts: null, rvc: NC(75) }], text: ["For a good of subheading 8708.80 for use in a passenger vehicle or light truck: No required change in tariff classification to subheading 8708.80, provided there is a regional value content of not less than 75 percent under the net cost method."] },
    ht: susp("ht"), other: susp("other"),
  });
  autoAdd("870891", ctxRule(c => ({ variants: {
    radiator: { label: "Radiators", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870891"], rvc: NC(X[c]) }], text: ["A change to radiators of subheading 8708.91 from any other heading;", `A change to radiators of subheading 8708.91 from any other good of subheading 8708.91, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method; or`] },
    other: { label: "Any other good of 8708.91", alts: [{ ts: null, rvc: NC(X[c]) }], text: [`No required change in tariff classification to any other good of subheading 8708.91, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`] } } })));
  autoAdd("870892", ctxRule(c => ({ variants: {
    exhaust: { label: "Silencers (mufflers) or exhaust pipes", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870892"], rvc: NC(X[c]) }], text: ["A change to silencers (mufflers) or exhaust pipes of subheading 8708.92 from any other heading; or", `A change to silencers (mufflers) or exhaust pipes of subheading 8708.92 from any other good of subheading 8708.92, whether or not there is also a change from any other heading, provided there is regional value content of not less than ${X[c]} percent under the net cost method; or`] },
    other: { label: "Any other good of 8708.92", alts: [{ ts: null, rvc: NC(X[c]) }], text: [`No required change in tariff classification to any other good of subheading 8708.92, provided there is a regional value content of not less than ${X[c]} percent under the net cost method`] } } })));
  autoAdd("870893", simpleParts("870893", ["870899"]));
  const steer = c => ({ variants: {
    steering: { label: "Steering wheels, steering columns or steering boxes", alts: [{ ts: "CTH" }, { ts: "CTH", allow: ["870894", "870899"], rvc: NC(X[c]) }], text: ["A change to subheading 8708.94 from any other heading;", `A change to steering wheels, steering columns or steering boxes of subheading 8708.94 from parts thereof of subheading 8708.94 or 8708.99, whether or not there is also a change from any other heading, provided there is a regional value content of not less than ${X[c]} percent under the net cost method; or`] },
    parts: { label: "Parts of steering wheels, columns or boxes", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(X[c]) }], text: ["A change to subheading 8708.94 from any other heading;", `No required change in tariff classification to parts of steering wheels, steering columns or steering boxes of subheading 8708.94, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`] } } });
  autoAdd("870894", {
    pvlt: { alts: [{ ts: null, rvc: NC(75) }], text: ["For a good of subheading 8708.94 for use in a passenger vehicle or light truck: No required change in tariff classification to subheading 8708.94, provided there is a regional value content of not less than 75 percent under the net cost method."] },
    ht: steer("ht"), other: steer("other"),
  });
  autoAdd("870895", ctxRule(c => ({ alts: [{ ts: "CTH" }, { ts: null, rvc: NC(X[c]) }], text: ["A change to subheading 8708.95 from any other heading; or", `No required change in tariff classification to subheading 8708.95, provided there is a regional value content of not less than ${X[c]} percent under the net cost method.`] })));
  const p99note = ["Tariff items 8708.99.aa and 8708.99.bb have their own rules — check the Party-specific tariff item table in Annex 4-B."];
  autoAdd("870899", {
    pvlt: { variants: {
      frame: { label: "Chassis frame", alts: [{ ts: null, rvc: NC(75) }], text: ["For a chassis frame of subheading 8708.99 for use in a passenger vehicle or light truck: No required change in tariff classification to a good of subheading 8708.99, provided there is a regional value content of not less than 75 percent under the net cost method."] },
      other: { label: "Any other good of 8708.99", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(70) }], text: ["8708.99 A change to subheading 8708.99 from any other heading; or", "No required change in tariff classification to subheading 8708.99, provided there is a regional value content of not less than 70 percent under the net cost method"], notes: p99note } } },
    ht: { variants: {
      frame: { label: "Chassis", alts: [{ ts: null, rvc: NC(70) }], text: ["For a chassis of subheading 8708.99 for use in a heavy truck: No required change in tariff classification to a good of subheading 8708.99, provided there is a regional value content of not less than 70 percent under the net cost method."] },
      other: { label: "Any other good of 8708.99", alts: [{ ts: "CTH" }, { ts: null, rvc: NC(70) }], text: ["8708.99 A change to subheading 8708.99 from any other heading; or", "No required change in tariff classification to subheading 8708.99, provided there is a regional value content of not less than 70 percent under the net cost method"], notes: p99note } } },
    other: { alts: [{ ts: "CTH" }, { ts: null, rvc: NC(50) }], text: ["8708.99 A change to subheading 8708.99 from any other heading; or", "No required change in tariff classification to subheading 8708.99, provided there is a regional value content of not less than 50 percent under the net cost method."], notes: p99note },
  });
  { const s = cthOrParts("subheading 8709.11 through 8709.19", "870990", 60, 50); add("870911", "870919", s); }
  add("870990", null, { alts: [{ ts: "CTH" }], text: ["8709.90 A change to subheading 8709.90 from any other heading."] });
  add("8710", null, { alts: [{ ts: "CTH" }], text: ["87.10 A change to heading 87.10 from any other heading."] });
  add("8711", "8713", { alts: [{ ts: "CTH", except: ["8714"] }, { ts: "CTH", allow: ["8714"], rvc: TV_NC(60, 50) }],
    text: ["87.11-87.13 A change to heading 87.11 through 87.13 from any other heading, including another heading within that group, except from heading 87.14; or",
      "A change to heading 87.11 through 87.13 from heading 87.14, whether or not there is also a change from any other heading, including another heading within that group, provided there is a regional value content of not less than: (a) 60 percent where the transaction value method is used; or (b) 50 percent where the net cost method is used."] });
  add("8714", "8715", { alts: [{ ts: "CTH" }], text: ["87.14-87.15 A change to heading 87.14 through 87.15 from any other heading, including another heading within that group."] });
  { const s = cthOrParts("subheading 8716.10 through 8716.80", "871690", 60, 50); add("871610", "871680", s); }
  add("871690", null, { alts: [{ ts: "CTH" }, { ts: null, rvc: TV_NC(60, 50) }],
    text: ["8716.90 A change to subheading 8716.90 from any other heading; or", "No required change in tariff classification to subheading 8716.90, provided there is a regional value content of not less than: (a) 60 percent where the transaction value method is used; or (b) 50 percent where the net cost method is used."] });

  /* ---------------- Appendix Articles 3 and 4: RVC for parts listed in Tables A.1-E ---------------- */
  const APPENDIX = {
    source: "Appendix to Annex 4-B, Articles 3 and 4",
    // Passenger vehicles / light trucks (Article 3, values from Jan 1, 2023)
    A1: { label: "Table A.1 — core part (passenger vehicle / light truck)", nc: 75, tv: 85, tsAllowed: false,
      text: "Article 3.2(d)/3.3: 75 percent under the net cost method or 85 percent under the transaction value method, if the corresponding rule includes a transaction value method. A Table A.1 part is originating only if it satisfies this regional value content requirement." },
    B: { label: "Table B — principal part (passenger vehicle / light truck)", nc: 70, tv: 80, tsAllowed: true,
      text: "Article 3.4(d): 70 percent under the net cost method or 80 percent under the transaction value method, if the corresponding rule includes a transaction value method. A Table B part is originating if it meets the applicable change in tariff classification requirement provided in Annex 4-B." },
    C: { label: "Table C — complementary part (passenger vehicle / light truck)", nc: 65, tv: 75, tsAllowed: true,
      text: "Article 3.5(d): 65 percent under the net cost method or 75 percent under the transaction value method, if the corresponding rule includes a transaction value method. A Table C part is originating if it meets the applicable change in tariff classification requirement provided in Annex 4-B." },
    // Heavy trucks (Article 4) — threshold depends on date
    D: { label: "Table D — principal part (heavy truck)", byDate: [["2027-01-01", 70, 80], ["2024-01-01", 64, 74], ["2020-07-01", 60, 70]], tsAllowed: null,
      text: "Article 4.2: 60% NC / 70% TV from 2020; 64% NC / 74% TV from January 1, 2024; 70% NC / 80% TV from January 1, 2027 and thereafter (if the corresponding rule includes a transaction value method)." },
    E: { label: "Table E — complementary part (heavy truck)", byDate: [["2027-01-01", 60, 70], ["2024-01-01", 54, 64], ["2020-07-01", 50, 60]], tsAllowed: null,
      text: "Article 4: 50% NC / 60% TV from 2020; 54% NC / 64% TV from January 1, 2024; 60% NC / 70% TV from January 1, 2027 and thereafter (if the corresponding rule includes a transaction value method)." },
  };

  window.USMCA_RULES = {
    list: R,
    appendix: APPENDIX,
    source: "https://www.international.gc.ca/trade-commerce/trade-agreements-accords-commerciaux/agr-acc/cusma-aceum/text-texte/04.aspx?lang=eng",
    sourceNote: "CUSMA Chapter 4, Annex 4-B and Appendix (Global Affairs Canada consolidation, read November 20, 2026). Only current rules are included; transitional rules that expired are not shown.",
    coveredChapters: ["72", "73", "87"],
  };
})();
