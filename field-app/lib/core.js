/* ZT Tree Inventory - shared core (browser + Node). Free libs only: proj4js.
 * Tool, not engineering or surveying advice. Not survey grade; not a substitute for a licensed surveyor or engineer.
 * Prepared by Zach Taylor, EI (Engineer Intern), ZT, LLC. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../vendor/proj4.js')); // same vendored proj4 the app ships (offline, no npm)
  else root.TSCore = factory(root.proj4);
})(typeof self !== 'undefined' ? self : this, function (proj4) {
  'use strict';
  // ---- single product config (user-facing name; DECISION FOR ZACH, see PLAN.md) ----
  const PRODUCT_NAME = 'ZT Tree Inventory';
  const VERSION = '1.0.1';
  const VERSION_TAG = 'v1.0.1';
  const RELEASE_DATE = '2026-10-22';
  const SERVICE_DESC = 'Tree inventory and GPS tree mapping (approximate, not a survey)';
  const M_TO_USFT = 3937 / 1200;          // 1 m = 3937/1200 US survey ft
  const AUTHOR_NAME = 'Zach Taylor, EI (Engineer Intern), ZT, LLC';
  const AUTHOR = 'Prepared by ' + AUTHOR_NAME;
  const GPS_GOV_URL = 'https://www.gps.gov/gps-accuracy';
  const ACCURACY_NOTE = 'Phone GPS is not survey grade: expect roughly 10-30 ft horizontal error ' +
    '(GPS.gov: smartphones are typically accurate to within 4.9 m / 16 ft under open sky, and accuracy ' +
    'worsens near buildings, bridges, and trees; ' + GPS_GOV_URL + '). The client\'s licensed surveyor locates the tags.';
  const SKETCH_LABEL = 'Locations approximate, for field reference only. Not a survey.';
  const ARBORIST_NOTE = 'Tree condition and risk determinations require an ISA Certified Arborist; condition entries here are visual field notes only.';
  const DISCLAIMER = 'Tool, not engineering or surveying advice. Not survey grade and not a substitute for a licensed ' +
    'surveyor or engineer; the client\'s licensed surveyor locates the tags. ' + ARBORIST_NOTE + ' ' + AUTHOR + '.';
  const STATUS_NOTE = 'Protected/heritage flags are suggested from the jurisdiction\'s published DBH thresholds and are field judgement only; the jurisdiction makes the final determination.';
  const DEFAULT_ACC_LIMIT_FT = 30; // hard warning above this (top of the stated 10-30 ft range)

  // Proj strings verified against epsg.io (https://epsg.io/<code>.proj4), accessed 2026-10-17.
  // Datum note: phone GPS reports WGS84 (realized close to ITRF); NAD83 differs by ~1-2 m in FL,
  // far below phone GPS error, so no datum shift is applied (towgs84=0). Recorded in PLAN.md.
  const CRS = {
    'EPSG:2238': { label: 'NAD83 / Florida North (ftUS) - EPSG:2238', units: 'US survey ft',
      proj: '+proj=lcc +lat_0=29 +lon_0=-84.5 +lat_1=30.75 +lat_2=29.5833333333333 +x_0=600000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs', src: 'https://epsg.io/2238' },
    'EPSG:2236': { label: 'NAD83 / Florida East (ftUS) - EPSG:2236', units: 'US survey ft',
      proj: '+proj=tmerc +lat_0=24.3333333333333 +lon_0=-81 +k=0.999941177 +x_0=200000.0001016 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs', src: 'https://epsg.io/2236' },
    'EPSG:2237': { label: 'NAD83 / Florida West (ftUS) - EPSG:2237', units: 'US survey ft',
      proj: '+proj=tmerc +lat_0=24.3333333333333 +lon_0=-82 +k=0.999941177 +x_0=200000.0001016 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs', src: 'https://epsg.io/2237' },
    'EPSG:6441': { label: 'NAD83(2011) / Florida North (ftUS) - EPSG:6441', units: 'US survey ft',
      proj: '+proj=lcc +lat_0=29 +lon_0=-84.5 +lat_1=30.75 +lat_2=29.5833333333333 +x_0=600000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs', src: 'https://epsg.io/6441' },
    'EPSG:2883': { label: 'NAD83(HARN) / Florida North (ftUS) - EPSG:2883 (Escambia GIS native)', units: 'US survey ft',
      proj: '+proj=lcc +lat_0=29 +lon_0=-84.5 +lat_1=30.75 +lat_2=29.5833333333333 +x_0=600000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs', src: 'https://epsg.io/2883' },
  };
  const DEFAULT_CRS = 'EPSG:2238';

  function registerAll(extra) {
    Object.assign(CRS, extra || {});
    for (const k of Object.keys(CRS)) proj4.defs(k, CRS[k].proj);
  }
  registerAll();

  function addCrs(code, label, projString, src) {
    // validate by projecting a FL point
    proj4.defs(code, projString);
    const p = proj4('EPSG:4326', code, [-84.28, 30.44]);
    if (!isFinite(p[0]) || !isFinite(p[1])) throw new Error('Projection failed for ' + code);
    CRS[code] = { label: label || code, units: /us-ft/.test(projString) ? 'US survey ft' : (/\+units=ft/.test(projString) ? 'intl ft' : 'see proj string'), proj: projString, src: src || 'user-added', user: true };
    return CRS[code];
  }

  /** lat/lon (deg) -> {northing, easting} in CRS units */
  function toNE(lat, lon, code) {
    const [e, n] = proj4('EPSG:4326', code || DEFAULT_CRS, [lon, lat]);
    return { northing: n, easting: e };
  }
  function fromNE(northing, easting, code) {
    const [lon, lat] = proj4(code || DEFAULT_CRS, 'EPSG:4326', [easting, northing]);
    return { lat, lon };
  }

  /** Average readings [{lat,lon,acc_m,alt_m}] weighted by 1/acc^2. Returns summary in ft. */
  function averageReadings(rs) {
    if (!rs.length) return null;
    let sw = 0, la = 0, lo = 0, al = 0, aw = 0;
    for (const r of rs) {
      const w = 1 / Math.max(r.acc_m, 0.5) ** 2; sw += w; la += w * r.lat; lo += w * r.lon;
      if (r.alt_m != null && isFinite(r.alt_m)) { al += w * r.alt_m; aw += w; }
    }
    const lat = la / sw, lon = lo / sw;
    // spread: RMS distance of readings from mean (ft), local flat approx
    const mPerDegLat = 111132.92, mPerDegLon = 111412.84 * Math.cos(lat * Math.PI / 180);
    let ss = 0; for (const r of rs) { const dy = (r.lat - lat) * mPerDegLat, dx = (r.lon - lon) * mPerDegLon; ss += dx * dx + dy * dy; }
    const accs = rs.map(r => r.acc_m);
    return {
      lat, lon, n: rs.length, alt_m: aw ? al / aw : null,
      acc_ft_mean: accs.reduce((a, b) => a + b, 0) / accs.length * M_TO_USFT,
      acc_ft_best: Math.min(...accs) * M_TO_USFT,
      spread_ft: Math.sqrt(ss / rs.length) * M_TO_USFT,
    };
  }

  const clean = s => String(s == null ? '' : s).replace(/[\r\n,;"]+/g, ' ').replace(/\s+/g, ' ').trim();
  function csvCell(v) { if (v == null) return ''; const s = String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }

  function description(t) {
    const dbh = (t.dbh_in !== '' && t.dbh_in != null) ? (+t.dbh_in).toString() + 'in' : '';
    return clean([t.tag ? 'T' + clean(t.tag).replace(/^T/i, '') : '', t.species, dbh].filter(Boolean).join(' '));
  }

  /** Civil 3D "PNEZD (comma delimited)": no header row. Elevation in ft (0 unless user opted into GPS altitude). */
  function pnezdRows(trees) {
    return trees.map(t => [t.point_no, (+t.northing).toFixed(3), (+t.easting).toFixed(3), (+(t.elev_ft || 0)).toFixed(2), description(t)]);
  }
  function pnezdCSV(trees) { return toCSV(pnezdRows(trees)); }

  // Column names kept compatible with the Tree Protection & Mitigation Calculator (ON HOLD) inventory
  // ("Tag #", "Species", "DBH (in)", "Dripline radius (ft)", "Condition", "Field notes"). v1.0.1: no "Proposed action" field (removed at Zach's request).
  // and its field sheet ("Protected? (Y/N)", "Heritage? (Y/N)", "Photo #").
  const LOG_COLS = ['Tag #', 'Species', 'Species (scientific)', 'DBH (in)', 'Stem DBHs (in, multi-trunk)', 'Canopy / dripline radius (ft)', 'Condition',
    'Protected? (Y/N)', 'Heritage? (Y/N)', 'Protected/heritage type', 'Field notes', 'Photo #',
    'In jurisdictional wetland? (PNS)', 'Planted/preserved to meet prior approval? (ESC)', 'ESC sand live oak multi-stem qualifies?',
    'SR champion tree?', 'Canopy to be pruned (%)', 'Dripline / root zone disturbed (%)',
    'Point #', 'Northing (ft)', 'Easting (ft)', 'Elevation (ft)', 'Latitude', 'Longitude', 'Position source', 'GPS accuracy (ft, reported)',
    'Readings averaged', 'Spread (ft)', 'Coordinate system', 'Captured (local)', 'Suggested protected (code threshold)', 'Suggested heritage (code threshold)',
    'Suggestion basis', 'Accuracy flag'];
  const isManual = t => t.pos_src === 'manual' || t.manual === true;
  function positionSource(t) {
    if (isManual(t)) return 'Manual lat/long entry (accuracy unknown)';
    return (+t.n_readings || 1) > 1 ? 'Phone GPS, average of ' + t.n_readings + ' readings' : 'Phone GPS, single reading';
  }
  const num = (v, d) => (v === '' || v == null || !isFinite(+v)) ? '' : (+v).toFixed(d);
  function logRow(t, crs, job) {
    const man = isManual(t), sg = suggestStatus(t, job), lim = (job && +job.accLimit) || DEFAULT_ACC_LIMIT_FT;
    return [t.tag, t.species, t.sci || '', t.dbh_in, t.stems || '', t.canopy_ft, t.condition, t.protected, t.heritage, t.ph_type || '',
      t.notes || '', t.photo_name || '', t.wet || '', t.prev || '', t.ms || '', t.champ || '', t.can_pct == null ? '' : t.can_pct, t.root_pct == null ? '' : t.root_pct,
      t.point_no, (+t.northing).toFixed(3), (+t.easting).toFixed(3), (+(t.elev_ft || 0)).toFixed(2),
      (+t.lat).toFixed(8), (+t.lon).toFixed(8), positionSource(t), man ? '' : num(t.acc_ft, 1), man ? '' : (t.n_readings || 1),
      man ? '' : num(t.spread_ft, 1), crs || t.crs || '', t.captured || '', sg.protected, sg.heritage, sg.basis,
      man ? 'Manual position, accuracy unknown' : (+t.acc_ft > lim ? 'Reported accuracy worse than ' + lim + ' ft' : '') + (t.acc_reason ? ' (' + t.acc_reason + ')' : '')];
  }
  function headerLines(meta) {
    return [
      [PRODUCT_NAME + ' - tree log (tree inventory data)'],
      ['Job: ' + (meta.project || '') + ' | Client: ' + (meta.client || '') + ' | Site: ' + (meta.site || '') + ' | Parcel(s): ' + (meta.parcels || '') +
        ' | Jurisdiction: ' + (meta.jurisdiction || '') + ' | CRS: ' + (meta.crs || '') + ' | Exported: ' + (meta.exported || '')],
      [SKETCH_LABEL + ' ' + ACCURACY_NOTE],
      [DISCLAIMER + ' ' + PRODUCT_NAME + ' ' + VERSION_TAG],
      [STATUS_NOTE],
      [],
    ];
  }
  function treeLogCSV(trees, meta) {
    meta = meta || {};
    return toCSV([...headerLines(meta), LOG_COLS, ...trees.map(t => logRow(t, meta.crs, meta.job))]);
  }
  // 13 input columns of the calculator's Tree Inventory, in order, for copy/paste
  const CALC_COLS = ['Tag #', 'Species', 'DBH (in)', 'Dripline radius (ft)', 'Condition', 'Proposed action', 'In jurisdictional wetland? (PNS)',
    'Planted/preserved to meet prior approval? (ESC)', 'ESC sand live oak multi-stem qualifies? (>=5 stems or >=3 stems >=3 in)', 'SR champion tree?',
    'Canopy to be pruned (%)', 'Dripline / root zone disturbed (%)', 'Field notes'];
  function calcRows(trees, speciesList) {
    const known = new Set((speciesList || []).map(s => s[0]));
    return trees.map(t => {
      const sp = known.size && !known.has(t.species) ? 'Other / unlisted species' : t.species;
      const note = (sp !== t.species ? '[field species: ' + t.species + '] ' : '') + (t.notes || '');
      const pct = v => (v === '' || v == null) ? '' : +v;
      return [t.tag, sp, t.dbh_in, t.canopy_ft, t.condition, '', t.wet || '', t.prev || '', t.ms || '', t.champ || '',
        pct(t.can_pct), pct(t.root_pct), note.trim()];
    });
  }

  /** Parse "12, 8 6.5" -> [12, 8, 6.5]; null if any token is not a positive number. */
  function parseStems(str) {
    const toks = String(str || '').split(/[\s,;+\/]+/).filter(Boolean); if (!toks.length) return [];
    const v = toks.map(Number); return v.every(x => isFinite(x) && x > 0 && x <= 200) ? v : null;
  }
  /** Multi-trunk DBH = sqrt(sum of squared stem DBHs), rounded to 0.1 in. Pensacola LDC 12-6-2(e) (VERIFIED in the
   *  Tree Mitigation Calculator Rules, PNS-06). Escambia and Santa Rosa methods are UNVERIFIED there (ESC-19, SR-24). */
  function combinedDBH(stems) { const v = Array.isArray(stems) ? stems : parseStems(stems); if (!v || !v.length) return null;
    return Math.round(Math.sqrt(v.reduce((a, x) => a + x * x, 0)) * 10) / 10; }
  const MULTI_STEM_NOTE = 'Combined DBH = square root of the sum of squared stem DBHs (Pensacola LDC 12-6-2(e)). Escambia / Santa Rosa method unverified; check with the jurisdiction.';

  /** Text that travels with the header-less PNEZD CSV. */
  function pnezdNote(meta) {
    meta = meta || {};
    return [PRODUCT_NAME + ' - notes for the PNEZD file ' + (meta.file || ''),
      'Job: ' + (meta.project || '') + ' | Client: ' + (meta.client || '') + ' | Site: ' + (meta.site || '') + ' | Parcel(s): ' + (meta.parcels || '') + ' | Exported: ' + (meta.exported || ''),
      'Content: ' + SERVICE_DESC + '. Tree inventory data only.',
      'Coordinate system: ' + (meta.crs || '') + '. Units: US survey feet.',
      'Format: Civil 3D "PNEZD (comma delimited)": Point #, Northing, Easting, Elevation, Description (T<tag> <species> <DBH>in). No header row.',
      'Elevation: ' + (meta.elev === 'gps' ? 'phone GPS altitude (unreliable; do not use for grading).' : '0.00 placeholder (no elevation captured).'),
      '', SKETCH_LABEL, ACCURACY_NOTE, 'Points entered by hand (no GPS) are listed as "Manual" in the tree log; their accuracy is unknown.',
      '', DISCLAIMER, 'App: ' + PRODUCT_NAME + ' ' + VERSION_TAG + '. Coordinates: proj4js with epsg.io definitions; checked against NOAA NGS NCAT.'].join('\r\n') + '\r\n';
  }
  const CALC_PASTE_NOTE = 'Paste rows below the header into the Tree Protection & Mitigation Calculator > Tree Inventory (row 7+). ' +
    'Unlisted species map to "Other / unlisted species". Blank Y/N cells are treated by the calculator as not "Y" and blank % as 0, so fill them in before relying on results. ' +
    'The "Proposed action" column is intentionally blank: this app does not record proposed actions; the column is kept only so the paste lines up column-for-column with the calculator\'s 13 inputs (enter actions in the calculator if needed).';

  const CHECK_COLS = ['Name', 'Known N (ft)', 'Known E (ft)', 'Captured N (ft)', 'Captured E (ft)', 'dN (ft)', 'dE (ft)', 'Horizontal offset (ft)',
    'Reported accuracy (ft)', 'Readings', 'Result', 'Known point source', 'Captured (local)'];
  function checkRow(c) {
    return [c.name, num(c.kN, 3), num(c.kE, 3), num(c.cN, 3), num(c.cE, 3), num(c.dN, 2), num(c.dE, 2), num(c.horiz, 2), num(c.acc_ft, 1), c.n || '',
      checkVerdict(c), c.source || '', c.captured || ''];
  }
  /** Full XLSX workbook (Tree Log, Calculator paste, PNEZD, About). Shared by the app and tests/make_sample.js. */
  function buildWorkbook(XLSX, trees, meta, speciesList, checks) {
    const wb = XLSX.utils.book_new(); speciesList = speciesList || LISTS.species;
    const ws = XLSX.utils.aoa_to_sheet([...headerLines(meta), LOG_COLS, ...trees.map(t => logRow(t, meta.crs, meta.job))]);
    ws['!cols'] = LOG_COLS.map((c, i) => ({ wch: i === 1 ? 24 : i === 11 ? 30 : 13 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Tree Log');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[CALC_PASTE_NOTE], CALC_COLS, ...calcRows(trees, speciesList)]), 'Calculator paste');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PNEZD (no header in the .csv)'], ['Point #', 'Northing', 'Easting', 'Elevation', 'Description'], ...pnezdRows(trees)]), 'PNEZD');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[SKETCH_LABEL], [ACCURACY_NOTE], [DISCLAIMER], ['CRS: ' + (meta.crs || '') + (meta.crsSrc ? ' (' + meta.crsSrc + ')' : '')],
      [MULTI_STEM_NOTE], [STATUS_NOTE], [PRODUCT_NAME + ' ' + VERSION_TAG]]), 'About');
    if (checks && checks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Field accuracy checks (known points vs phone GPS)'], CHECK_COLS, ...checks.map(checkRow)]), 'Accuracy checks');
    return wb;
  }

  // ---- species and jurisdiction thresholds (copied from tree-mitigation-calculator src/parts/p1_data.py + p2_rules.py) ----
  // [common, scientific, PNS App.A type, PNS min DBH, ESC exempt reason, SR class, SR min DBH, live oak Y/N]
  const SPECIES = [["Southern live oak", "Quercus virginiana", "C", 8, "-", "Large", 8, "Y"], ["Sand live oak", "Quercus geminata", "A", 4, "-", "Large", 8, "Y"], ["Laurel oak", "Quercus laurifolia", "C", 8, "-", "-", 0, "N"], ["Darlington oak", "Quercus hemisphaerica", "C", 8, "-", "-", 0, "N"], ["White oak", "Quercus alba", "C", 8, "-", "Large", 8, "N"], ["Southern red oak", "Quercus falcata", "C", 8, "-", "-", 0, "N"], ["Swamp chestnut oak", "Quercus michauxii", "-", 0, "-", "Large", 8, "N"], ["Water oak", "Quercus nigra", "-", 0, "-", "-", 0, "N"], ["Turkey oak", "Quercus laevis", "-", 0, "Turkey oak", "-", 0, "N"], ["Sweetgum", "Liquidambar styraciflua", "C", 8, "-", "-", 0, "N"], ["Sycamore", "Platanus occidentalis", "C", 8, "-", "-", 0, "N"], ["Pecan", "Carya illinoinensis", "C", 8, "-", "Large", 8, "N"], ["Hickory (Carya spp.)", "Carya spp.", "C", 8, "-", "Large", 8, "N"], ["Red maple", "Acer rubrum", "C", 8, "-", "-", 0, "N"], ["Florida sugar maple", "Acer barbatum", "C", 8, "-", "-", 0, "N"], ["Silver maple", "Acer saccharinum", "C", 8, "-", "-", 0, "N"], ["Black tupelo", "Nyssa sylvatica", "C", 8, "-", "Large", 8, "N"], ["Water tupelo", "Nyssa aquatica", "-", 0, "-", "Large", 8, "N"], ["American beech", "Fagus grandifolia", "-", 0, "-", "Large", 8, "N"], ["Bald cypress", "Taxodium distichum", "-", 0, "-", "Large", 8, "N"], ["Pond cypress", "Taxodium ascendens", "-", 0, "-", "Large", 8, "N"], ["Southern magnolia", "Magnolia grandiflora", "B", 6, "-", "Large", 8, "N"], ["American holly", "Ilex opaca", "B", 6, "-", "Large", 8, "N"], ["Dahoon holly", "Ilex cassine", "B", 6, "-", "Large", 8, "N"], ["Yaupon holly", "Ilex vomitoria", "-", 0, "-", "Large", 8, "N"], ["Eastern red cedar", "Juniperus virginiana", "B", 6, "-", "-", 0, "N"], ["Southern red cedar", "Juniperus silicicola", "B", 6, "-", "-", 0, "N"], ["Atlantic white cedar", "Chamaecyparis thyoides", "B", 6, "-", "Small", 4, "N"], ["River birch", "Betula nigra", "B", 6, "-", "-", 0, "N"], ["Longleaf pine", "Pinus palustris", "B", 6, "Pine (Pinus sp.)", "-", 0, "N"], ["Loblolly pine", "Pinus taeda", "-", 0, "Pine (Pinus sp.)", "-", 0, "N"], ["Slash pine", "Pinus elliottii", "-", 0, "Pine (Pinus sp.)", "-", 0, "N"], ["Sand pine", "Pinus clausa", "-", 0, "Pine (Pinus sp.)", "-", 0, "N"], ["Spruce pine", "Pinus glabra", "-", 0, "Pine (Pinus sp.)", "-", 0, "N"], ["Cherry laurel", "Prunus caroliniana", "-", 0, "Cherry laurel", "-", 0, "N"], ["Flowering dogwood", "Cornus florida", "A", 4, "-", "Small", 4, "N"], ["Redbud", "Cercis canadensis", "A", 4, "-", "Small", 4, "N"], ["Crape myrtle", "Lagerstroemia indica", "A", 4, "-", "-", 0, "N"], ["Fringe tree", "Chionanthus virginicus", "A", 4, "-", "-", 0, "N"], ["Flatwoods plum", "Prunus umbellata", "A", 4, "-", "-", 0, "N"], ["Crabapple", "Malus angustifolia", "A", 4, "-", "-", 0, "N"], ["Loblolly bay", "Gordonia lasianthus", "-", 0, "-", "Small", 4, "N"], ["Chinese tallow (invasive)", "Triadica sebifera", "-", 0, "FISC Cat I invasive", "-", 0, "N"], ["Camphor tree (invasive)", "Cinnamomum camphora", "-", 0, "FISC Cat I invasive", "-", 0, "N"], ["Other / unlisted species", "-", "-", 0, "-", "-", 0, "N"]];
  const CONDS = ['Good', 'Fair', 'Poor', 'Dead', 'Hazard \u2013 documented (F.S. 163.045)'];
    const LISTS = { species: SPECIES.map(s => [s[0], s[1]]), conditions: CONDS };
  const JURISDICTIONS = {
    PNS: { label: 'City of Pensacola', parcelSource: 'escambia', code: 'Pensacola LDC Ch. 12-6' },
    ESC: { label: 'Escambia County (unincorporated)', parcelSource: 'escambia', code: 'Escambia LDC / DSM Ch. 2 Art. 2' },
    SR: { label: 'Santa Rosa County (unincorporated)', parcelSource: 'santa-rosa', code: 'Santa Rosa LDC 4.07.05' },
    OTHER: { label: 'Other / not set (no suggestions)', parcelSource: '', code: '' },
  };
  const SR_LOCS = { S: 'South of Yellow River', N: 'North of Yellow River (incl. Garcon Point)' };
  const speciesRec = name => SPECIES.find(s => s[0].toLowerCase() === String(name || '').trim().toLowerCase()) || null;
  /** Suggested protected / heritage status from published DBH thresholds (before exemptions). Field judgement only.
   *  Mirrors the Tree Protection & Mitigation Calculator columns S/T (rules PNS-05/08, ESC-01/02/03/04/05, SR-04..10). */
  function suggestStatus(t, job) {
    const j = (job && job.jurisdiction) || 'OTHER', d = +t.dbh_in, sp = speciesRec(t.species);
    const out = { protected: '', heritage: '', basis: '', jurisdiction: j };
    if (j === 'OTHER' || !(d > 0)) return out;
    if (t.condition === 'Dead') return Object.assign(out, { protected: 'N', heritage: 'N', basis: 'Dead trees are not counted (calculator rule).' });
    if (!sp) return Object.assign(out, { basis: 'Species not in the list: no threshold available, use field judgement.' });
    const [name, , pType, pMin, escEx, srCls, srMin, live] = sp;
    if (j === 'PNS') {
      const prot = pMin > 0 && d >= pMin, her = pMin > 0 && d >= 4 * pMin;
      out.protected = prot ? 'Y' : 'N'; out.heritage = her ? 'Y' : 'N';
      out.basis = pMin > 0 ? `PNS App. A Type ${pType}: protected at ${pMin} in, heritage at ${4 * pMin} in (LDC 12-6-6, 12-6-2(d)).` : 'Not an Appendix A species (LDC 12-6-6).';
      out.basis += ' Single-family/duplex uses are exempt except heritage trees (12-6-2(c)).';
    } else if (j === 'ESC') {
      const her = d >= 60; let prot = d >= 12 || t.prev === 'Y' || (name === 'Sand live oak' && t.ms === 'Y');
      out.basis = 'ESC: protected at 12 in, heritage at 60 in (DSM 2-3.1(a),(d)).';
      if (escEx !== '-' && t.prev !== 'Y') { prot = false; out.basis += ` Exempt species: ${escEx} (DSM 2-1.1).`; }
      out.protected = prot ? 'Y' : 'N'; out.heritage = her && prot ? 'Y' : 'N';
      out.basis += ' Non-heritage trees on single-family/two-family lots are exempt (2-1.1(e)).';
    } else if (j === 'SR') {
      const south = (job && job.srLoc) !== 'N';
      const hT = south ? (live === 'Y' ? 24 : 36) : 48;
      let her = d >= hT ? 'Y' : 'N';
      if (!south && live === 'Y' && d >= 24 && d < 48) her = 'POSSIBLE';
      const prot = (srMin > 0 && d >= srMin) || her === 'Y' || t.champ === 'Y';
      out.protected = prot ? 'Y' : 'N'; out.heritage = her;
      out.basis = (srMin > 0 ? `SR ${srCls.toLowerCase()} protected species at ${srMin} in (4.07.05.D).` : 'Not a listed SR protected species (4.07.05.D).') +
        ` Heritage at ${hT} in ${south ? 'south' : 'north'} of Yellow River (4.07.05.D.3)` + (her === 'POSSIBLE' ? '; north live oak 24-48 in is POSSIBLE heritage (code conflict, SR-09).' : '.');
    }
    return out;
  }

  /** Horizontal offset (US ft) between a captured lat/lon and a known point given as lat/lon or N/E in a CRS. */
  function offsetFt(cap, known, crs) {
    crs = crs || DEFAULT_CRS;
    const a = toNE(cap.lat, cap.lon, crs);
    const k = (known.northing != null && known.northing !== '') ? { northing: +known.northing, easting: +known.easting } : toNE(+known.lat, +known.lon, crs);
    const dN = a.northing - k.northing, dE = a.easting - k.easting;
    return { dN, dE, horiz: Math.hypot(dN, dE), known: k, captured: a };
  }
  function checkVerdict(c) {
    if (c.horiz == null) return '';
    const rep = c.acc_ft != null ? +c.acc_ft : null;
    if (c.horiz <= 30 && (rep == null || c.horiz <= Math.max(2 * rep, 10))) return 'PASS';
    if (c.horiz <= 30) return 'PASS (offset larger than reported accuracy)';
    return 'FAIL (> 30 ft)';
  }

  /** Summary counts for the report / worksheet. */
  function summarize(trees, job) {
    const bySp = {}; let prot = 0, her = 0, sProt = 0, sHer = 0, dbh = 0, protDbh = 0, herDbh = 0, man = 0, low = 0;
    const lim = (job && +job.accLimit) || DEFAULT_ACC_LIMIT_FT;
    for (const t of trees) {
      const k = t.species || '(blank)'; bySp[k] = bySp[k] || { n: 0, dbh: 0, prot: 0, her: 0 }; bySp[k].n++; bySp[k].dbh += +t.dbh_in || 0;
      dbh += +t.dbh_in || 0;
      if (t.protected === 'Y') { prot++; bySp[k].prot++; }
      if (t.heritage === 'Y') { her++; bySp[k].her++; }
      const sg = suggestStatus(t, job); if (sg.protected === 'Y') sProt++; if (sg.heritage === 'Y') sHer++;
      if (t.protected === 'Y') protDbh += +t.dbh_in || 0; if (t.heritage === 'Y') herDbh += +t.dbh_in || 0;
      if (isManual(t)) man++; else if (+t.acc_ft > lim) low++;
    }
    return { n: trees.length, bySpecies: Object.entries(bySp).sort((a, b) => b[1].n - a[1].n), prot, her, sProt, sHer, dbh, protDbh, herDbh, manual: man, lowAcc: low, accLimit: lim };
  }

  function validateTree(t) {
    const e = [];
    if (!String(t.tag || '').trim()) e.push('Tag # required');
    if (!String(t.species || '').trim()) e.push('Species required');
    if (t.dbh_in === '' || t.dbh_in == null || !(+t.dbh_in > 0 && +t.dbh_in <= 200)) e.push('DBH must be 0-200 in');
    if (t.canopy_ft !== '' && t.canopy_ft != null && !(+t.canopy_ft >= 0 && +t.canopy_ft <= 200)) e.push('Canopy 0-200 ft');
    if (!(isFinite(t.lat) && isFinite(t.lon))) e.push('No position');
    if (t.stems && parseStems(t.stems) === null) e.push('Stem DBHs: numbers 0-200 separated by commas');
    for (const [k, n] of [['can_pct', 'Canopy pruned %'], ['root_pct', 'Root zone disturbed %']])
      if (t[k] !== '' && t[k] != null && !(+t[k] >= 0 && +t[k] <= 100)) e.push(n + ' must be 0-100');
    return e;
  }

  return { PRODUCT_NAME, RELEASE_DATE, SERVICE_DESC, AUTHOR_NAME, GPS_GOV_URL, ARBORIST_NOTE, STATUS_NOTE, DEFAULT_ACC_LIMIT_FT,
    SPECIES, CONDS, LISTS, JURISDICTIONS, SR_LOCS, speciesRec, suggestStatus, offsetFt, checkVerdict, summarize, CHECK_COLS, checkRow, isManual,
    VERSION_TAG, positionSource, parseStems, combinedDBH, MULTI_STEM_NOTE, pnezdNote, CALC_PASTE_NOTE, buildWorkbook,
    VERSION, M_TO_USFT, AUTHOR, ACCURACY_NOTE, SKETCH_LABEL, DISCLAIMER, CRS, DEFAULT_CRS, addCrs, registerAll,
    toNE, fromNE, averageReadings, toCSV, parseCSV, csvCell, description, pnezdRows, pnezdCSV, LOG_COLS, logRow,
    headerLines, treeLogCSV, CALC_COLS, calcRows, validateTree, proj4 };
});
