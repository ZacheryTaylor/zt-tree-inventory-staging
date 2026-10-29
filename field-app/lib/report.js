/* "Tree Inventory Report" PDF (jsPDF, letter). Shared by the field app and the sketch page.
 * Pages: cover, summary + protected-tree count & mitigation worksheet, tree table, location sketch, accuracy, sources, limitations.
 * Wording rules (PLAN.md section 12): tree inventory / GPS tree mapping data only; never a survey, engineering, arborist or landscape architecture product. */
(function () {
  'use strict';
  const C = self.TSCore;
  const SOURCES = [
    ['GPS accuracy: GPS.gov, "GPS Accuracy" (smartphones typically within 4.9 m / 16 ft under open sky; worse near buildings, bridges and trees)', C.GPS_GOV_URL],
    ['Coordinate conversion: proj4js with EPSG definitions from epsg.io (default EPSG:2238 NAD83 / Florida North, US survey ft); spot-checked against NOAA NGS NCAT', 'https://geodesy.noaa.gov/NCAT/'],
    ['Escambia County and City of Pensacola parcels: Escambia County Property Appraiser; source acknowledgment: Escambia County IMAGiNE GIS (not survey quality)', 'https://gismaps.myescambia.com/arcgis/rest/services/Individual_Layers/parcels/FeatureServer/0'],
    ['Santa Rosa County parcels: Santa Rosa County BOCC GIS (accuracy, completeness and currency not guaranteed)', 'https://www.santarosa.fl.gov/470/Mapping-GIS/'],
    ['Sketch background (when used): USGS The National Map imagery (public domain)', 'https://basemap.nationalmap.gov/'],
    ['City of Pensacola protected/heritage DBH thresholds: Pensacola Land Development Code Ch. 12-6 and Appendix A (as encoded in the ZT tree mitigation calculator rules; confirm current code with the City)', ''],
    ['Escambia County protected/heritage thresholds: Escambia County LDC and Design Standards Manual Ch. 2, Art. 2 (confirm current code with the County)', ''],
    ['Santa Rosa County protected/heritage thresholds: Santa Rosa County LDC 4.07.05 (confirm current code with the County)', ''],
    ['Tree risk documentation requirement: Florida Statutes 163.045 (ISA Certified Arborist or Florida licensed landscape architect)', 'https://www.flsenate.gov/Laws/Statutes/2025/163.045'],
  ];
  const LIMITATIONS = [
    'This is tree inventory data and GPS tree mapping (approximate, not a survey). ' + C.SKETCH_LABEL,
    'Positions are phone GPS readings with roughly 10-30 ft horizontal error; the client\'s licensed surveyor locates the tags before any design or permit use that depends on location.',
    'Tool, not engineering or surveying advice. This is not engineering work, a boundary or tree location survey, landscape architecture, or an arborist report. The preparer is an Engineer Intern (EI), not a licensed professional engineer, surveyor, landscape architect or arborist.',
    C.ARBORIST_NOTE + ' No tree risk or hazard assessment was performed. Under F.S. 163.045, tree risk documentation must come from an ISA Certified Arborist or a Florida licensed landscape architect.',
    C.STATUS_NOTE,
    'Parcel lines are county GIS (property appraiser) data, not survey quality, and can be offset from true boundaries by tens of feet.',
    'Species identification and DBH are field observations. DBH was measured or estimated at 4.5 ft above grade; multi-trunk DBH uses the square root of the sum of squared stem DBHs (Pensacola LDC 12-6-2(e); Escambia/Santa Rosa method unverified).',
    'The mitigation worksheet is a count to support the client\'s own permit calculations; the jurisdiction makes final protected/heritage and mitigation determinations.',
  ];
  const clean = s => String(s == null ? '' : s).replace(/\u2264/g, '<=').replace(/\u2265/g, '>=').replace(/[\u2192]/g, '->').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');

  async function build(o) {
    const { jsPDF } = self.jspdf; const job = o.job || {}, trees = o.trees || [], checks = o.checks || [], crs = o.crs || job.crs || C.DEFAULT_CRS;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const G = [31, 81, 48], RED = [161, 0, 28], M = 48;
    let W = 612, H = 792, y = 0;
    const s = C.summarize(trees, job);
    const font = (sz, st, col) => { doc.setFont('helvetica', st || 'normal'); doc.setFontSize(sz); doc.setTextColor(...(col || [26, 26, 26])); };
    const text = (t, x, yy, opt) => doc.text(clean(t), x, yy, opt);
    function para(t, sz, st, col, w) { font(sz, st, col); const lines = doc.splitTextToSize(clean(t), w || (W - 2 * M)); for (const l of lines) { if (y > H - 70) newPage(); doc.text(l, M, y); y += sz * 1.32; } y += 4; }
    function head(t) { if (y > H - 120) newPage(); else if (y > 70) y += 10; font(15, 'bold', G); text(t, M, y); y += 6; doc.setDrawColor(...G); doc.setLineWidth(1.2); doc.line(M, y, W - M, y); y += 18; }
    function newPage(orient) { doc.addPage('letter', orient || 'portrait'); W = orient === 'landscape' ? 792 : 612; H = orient === 'landscape' ? 612 : 792; y = 60; }
    function table(cols, rows, opt) {
      opt = opt || {}; const sz = opt.size || 8.5, widths = cols.map(c => c[1]), tw = widths.reduce((a, b) => a + b, 0), k = (W - 2 * M) / tw;
      const drawHead = () => { doc.setFillColor(...G); doc.rect(M, y - sz - 3, W - 2 * M, sz + 8, 'F'); font(sz, 'bold', [255, 255, 255]); let x = M + 3; cols.forEach((c, i) => { text(c[0], x, y); x += widths[i] * k; }); y += sz + 6; };
      drawHead();
      rows.forEach((r, ri) => {
        font(sz, 'normal'); const cells = r.map((v, i) => doc.splitTextToSize(clean(v), widths[i] * k - 5)); const h = Math.max(...cells.map(c => c.length)) * sz * 1.2 + 4;
        if (y + h > H - 60) { newPage(opt.orient); drawHead(); font(sz, 'normal'); }
        if (ri % 2) { doc.setFillColor(242, 245, 241); doc.rect(M, y - sz - 1, W - 2 * M, h, 'F'); }
        if (opt.rowColor) { const col = opt.rowColor(ri); if (col) { font(sz, 'normal', col); } }
        let x = M + 3; cells.forEach((c, i) => { doc.text(c, x, y); x += widths[i] * k; }); y += h; doc.setTextColor(26, 26, 26);
      });
      y += 8;
    }
    const crsLabel = (C.CRS[crs] || {}).label || crs;
    // ---------- cover ----------
    doc.setFillColor(...G); doc.rect(0, 0, W, 120, 'F');
    font(12, 'bold', [220, 235, 222]); text(C.PRODUCT_NAME, M, 46);
    font(28, 'bold', [255, 255, 255]); text('Tree Inventory Report', M, 84);
    font(11, 'normal', [220, 235, 222]); text(C.SERVICE_DESC, M, 106);
    y = 160; font(16, 'bold'); para(job.name || 'Untitled job', 18, 'bold');
    const info = [['Client', job.client], ['Site address', job.site], ['Parcel ID(s)', job.parcels], ['Jurisdiction', o.jurisdictionLabel || (C.JURISDICTIONS[job.jurisdiction] || {}).label],
      ['Field date', job.date], ['Crew', job.crew], ['Trees inventoried', String(trees.length)], ['Coordinate system', crsLabel], ['Report date', new Date().toLocaleDateString()], ['Prepared by', C.AUTHOR_NAME]];
    for (const [a, b] of info) { font(11, 'bold', [77, 77, 77]); text(a, M, y); font(11, 'normal'); const l = doc.splitTextToSize(clean(b || '-'), W - 2 * M - 130); doc.text(l, M + 130, y); y += 16 * l.length + 2; }
    if (job.notes) { y += 4; para('Job notes: ' + job.notes, 10, 'normal', [77, 77, 77]); }
    y += 10; const bx = y; doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    y += 20; para(C.SKETCH_LABEL.toUpperCase(), 13, 'bold', RED, W - 2 * M - 24);
    const yy0 = y; y = yy0; const saveM = M;
    para(C.DISCLAIMER, 10, 'normal', [60, 0, 10], W - 2 * M - 24); para(C.ACCURACY_NOTE, 10, 'normal', [60, 0, 10], W - 2 * M - 24);
    doc.rect(saveM - 8, bx, W - 2 * M + 16, y - bx + 4);
    y += 20; para('Contents: summary and protected-tree count & mitigation worksheet; tree table; location sketch; accuracy statement and field accuracy checks; data sources; limitations.', 9.5, 'normal', [77, 77, 77]);
    // ---------- summary ----------
    newPage(); head('Summary');
    para(`${s.n} trees inventoried. Field calls: ${s.prot} protected, ${s.her} heritage. Code-threshold suggestions (before exemptions, field judgement): ${s.sProt} protected, ${s.sHer} heritage. Total DBH ${s.dbh.toFixed(1)} in.`, 10.5);
    para(`Position quality: ${s.n - s.manual - s.lowAcc} within the ${s.accLimit} ft job limit, ${s.lowAcc} flagged worse than ${s.accLimit} ft, ${s.manual} entered by hand (accuracy unknown).`, 10.5);
    table([['Species', 190], ['Count', 50], ['Total DBH (in)', 80], ['Protected (field)', 85], ['Heritage (field)', 80]],
      s.bySpecies.map(([sp, v]) => [sp, v.n, v.dbh.toFixed(1), v.prot, v.her]).concat([['TOTAL', s.n, s.dbh.toFixed(1), s.prot, s.her]]));
    head('Protected-tree count & mitigation worksheet');
    para('Counts to carry into the client\'s mitigation calculation; which trees are removed or preserved is decided by the client\'s design team, not recorded here. Inch-for-inch and replacement ratios differ by jurisdiction; the jurisdiction makes the final determination. ' + C.STATUS_NOTE, 9.5, 'normal', [77, 77, 77]);
    const dbhSum = a => a.reduce((x, t) => x + (+t.dbh_in || 0), 0).toFixed(1);
    const live = trees.filter(t => t.condition !== 'Dead'), dead = trees.filter(t => t.condition === 'Dead');
    const sgP = trees.filter(t => C.suggestStatus(t, job).protected === 'Y'), sgH = trees.filter(t => C.suggestStatus(t, job).heritage === 'Y');
    table([['Item', 300], ['Count', 70], ['DBH (in)', 80]], [
      ['All trees inventoried', trees.length, dbhSum(trees)],
      ['Protected trees (field call)', s.prot, s.protDbh.toFixed(1)],
      ['Heritage trees (field call)', s.her, s.herDbh.toFixed(1)],
      ['Protected by code DBH threshold (suggestion)', sgP.length, dbhSum(sgP)],
      ['Heritage by code DBH threshold (suggestion)', sgH.length, dbhSum(sgH)],
      ['Live trees', live.length, dbhSum(live)],
      ['Dead trees (not counted by the calculator)', dead.length, dbhSum(dead)],
    ]);
    para('Jurisdiction rule basis for the suggestions: ' + ((C.JURISDICTIONS[job.jurisdiction] || {}).code || 'none (no jurisdiction set)') + '. The tree log XLSX includes a "Calculator paste" sheet for the mitigation calculator.', 9, 'normal', [77, 77, 77]);
    // ---------- tree table ----------
    newPage('landscape'); head('Tree table');
    para('Condition is a visual field note only. P/H = protected/heritage field call; "Sugg." = code-threshold suggestion. N/E in ' + crsLabel + '. +/-ft = phone-reported accuracy.', 8.5, 'normal', [77, 77, 77]);
    table([['Tag', 34], ['Pt #', 36], ['Species', 120], ['DBH', 34], ['Canopy ft', 44], ['Condition (visual)', 76], ['P', 18], ['H', 18], ['Sugg. P/H', 54], ['+/-ft', 40], ['Northing', 70], ['Easting', 70], ['Notes', 182]],
      trees.map(t => [t.tag, t.point_no, t.species, t.dbh_in, t.canopy_ft, t.condition, t.protected, t.heritage, (C.suggestStatus(t, job).protected || '-') + '/' + (C.suggestStatus(t, job).heritage || '-'),
        C.isManual(t) ? 'manual' : (t.acc_ft != null ? (+t.acc_ft).toFixed(0) + (+t.acc_ft > s.accLimit ? ' !' : '') : ''), (+t.northing).toFixed(1), (+t.easting).toFixed(1), (t.notes || '') + (t.acc_reason ? ' [accuracy: ' + t.acc_reason + ']' : '')]),
      { size: 7.5, orient: 'landscape' });
    // ---------- sketch ----------
    newPage('landscape');
    try {
      const cv = o.sketchCanvas || document.createElement('canvas');
      if (!o.sketchCanvas) await TSSketch.render(cv, { parcels: o.parcels || [], idField: o.parcelInfo && o.parcelInfo.idField, trees, crs, page: 'letter', job: Object.assign({ jurisdictionLabel: o.jurisdictionLabel }, job),
        title: 'Tree Location Sketch (approximate)', aerial: !!o.aerial, basemap: o.basemap, accCircles: true,
        parcelSource: o.parcelInfo ? o.parcelInfo.source : 'none loaded', retrieved: o.parcelInfo && o.parcelInfo.retrieved });
      const r = cv.height / cv.width, w = 792 - 48, h = Math.min(612 - 48, w * r);
      doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', 24, 24, h / r, h);
    } catch (e) { y = 80; head('Location sketch'); para('Sketch not available: ' + e.message, 11); }
    // ---------- accuracy ----------
    newPage(); head('Accuracy statement');
    para(C.ACCURACY_NOTE, 10.5);
    para('Method: each tree position is the weighted average (by 1/accuracy squared) of repeated phone GPS readings taken at the trunk; the "+/-ft" value is the phone\'s own estimate, not a measured error. Coordinates are converted from WGS84 latitude/longitude to ' + crsLabel + ' with proj4js; no datum shift is applied (about 1-2 m, well inside phone GPS error).', 10);
    para('Source: GPS.gov, GPS Accuracy, ' + C.GPS_GOV_URL + '.', 10, 'italic');
    head('Field accuracy checks (known points)');
    if (checks.length) {
      para('The phone was placed on points with known coordinates and the horizontal offset measured. PASS = offset within 30 ft.', 9.5, 'normal', [77, 77, 77]);
      table([['Point', 120], ['Known source', 110], ['Offset ft', 55], ['dN', 45], ['dE', 45], ['Phone +/-ft', 60], ['Readings', 50], ['Result', 110]],
        checks.map(c => [c.name, c.source || '', (+c.horiz).toFixed(1), (+c.dN).toFixed(1), (+c.dE).toFixed(1), (+c.acc_ft).toFixed(0), c.n, C.checkVerdict(c)]));
      const hs = checks.map(c => +c.horiz); para(`Checks: ${hs.length}; mean offset ${(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1)} ft; max ${Math.max(...hs).toFixed(1)} ft.`, 10, 'bold');
    } else para('No known-point checks were recorded for this job.', 10);
    // ---------- sources + limitations ----------
    head('Data sources');
    for (const [t, u] of SOURCES) para('\u2022 ' + t + (u ? ' (' + u + ')' : ''), 9);
    head('Limitations');
    for (const t of LIMITATIONS) para('\u2022 ' + t, 9.5);
    y += 6; para(C.AUTHOR + '. ' + C.PRODUCT_NAME + ' ' + C.VERSION_TAG + '.', 9.5, 'bold');
    // ---------- footer on every page ----------
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      font(7.5, 'normal', [90, 90, 90]);
      doc.text(clean(`${C.PRODUCT_NAME} \u00b7 ${job.name || ''} \u00b7 ${C.SKETCH_LABEL}`), 24, ph - 16);
      doc.text(`Page ${i} of ${n}`, pw - 24, ph - 16, { align: 'right' });
    }
    doc.setProperties({ title: 'Tree Inventory Report - ' + (job.name || ''), subject: C.SERVICE_DESC, author: C.AUTHOR_NAME, keywords: 'tree inventory; not a survey; locations approximate', creator: C.PRODUCT_NAME + ' ' + C.VERSION_TAG });
    return doc;
  }
  self.TSReport = { build, SOURCES, LIMITATIONS };
})();
