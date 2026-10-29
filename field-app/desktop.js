/* ZT Tree Inventory v1.0 - parcel sketch page (desktop or phone). Same-origin with the field app, so it can read jobs saved on this device. */
(async function () {
  'use strict';
  const C = TSCore, S = TSStore, $ = id => document.getElementById(id);
  document.title = C.PRODUCT_NAME + ' - Parcel sketch'; $('appName').textContent = C.PRODUCT_NAME + ' \u00b7 Parcel sketch';
  $('accBanner').innerHTML = '<b>' + C.SKETCH_LABEL + '</b> ' + C.ACCURACY_NOTE;
  $('foot').textContent = C.DISCLAIMER + ' ' + C.PRODUCT_NAME + ' ' + C.VERSION_TAG + '.';
  const q = new URLSearchParams(location.search);
  let J = [], BASEMAP = null, parcels = [], trees = [], checks = [], retrieved = '', job = null, parcelInfo = null;

  // parcel sources (jurisdictions.json, synced from parcel-filter); City of Pensacola uses the Escambia layer
  try { const jj = await TSParcels.config(); J = jj.jurisdictions || []; BASEMAP = jj.basemap || null; } catch (e) { $('pStat').textContent = 'Could not load jurisdictions.json: ' + e.message; }
  const JUR_OPTS = [];
  for (const j of J) {
    if (j.id === 'escambia') JUR_OPTS.push({ key: 'PNS', src: j, label: 'City of Pensacola (Escambia County parcels)' }, { key: 'ESC', src: j, label: 'Escambia County (unincorporated)' });
    else if (j.id === 'santa-rosa') JUR_OPTS.push({ key: 'SR', src: j, label: 'Santa Rosa County' });
    else JUR_OPTS.push({ key: j.id, src: j, label: j.name + (j.verified ? '' : ' (unverified)') });
  }
  for (const o of JUR_OPTS) $('jur').add(new Option(o.label, o.key));
  const jur = () => JUR_OPTS.find(o => o.key === $('jur').value) || JUR_OPTS[0];
  const userCrs = S.settings.get('userCrs') || {}; for (const [k, v] of Object.entries(userCrs)) { try { C.addCrs(k, v.label, v.proj); } catch (e) {} }
  for (const [k, v] of Object.entries(C.CRS)) $('crs').add(new Option(v.label, k));
  $('crs').value = C.DEFAULT_CRS;
  if (BASEMAP) $('base').add(new Option((BASEMAP.label || 'Basemap') + ' (' + (BASEMAP.attribution || '') + ')', 'cfg'));
  $('base').add(new Option('None (white)', 'none'));

  // map preview (same background as the sketch)
  const map = L.map('map', { maxZoom: 21 }).setView([30.55, -87.25], 11);
  const bases = { cfg: BASEMAP && BASEMAP.type === 'xyz' ? L.tileLayer(BASEMAP.url, { subdomains: BASEMAP.subdomains || 'abc', maxNativeZoom: BASEMAP.maxZoom || 19, maxZoom: 21, attribution: BASEMAP.attribution || '' }) : L.layerGroup(), none: L.layerGroup() };
  let base = bases[$('base').value].addTo(map);
  $('base').onchange = () => { map.removeLayer(base); base = bases[$('base').value].addTo(map); };
  const pLayer = L.geoJSON(null, { style: { color: '#ffe600', weight: 3, fillOpacity: .08 } }).addTo(map);
  const tLayer = L.layerGroup().addTo(map);
  function fit() { const g = L.featureGroup([pLayer, ...tLayer.getLayers()]); const b = g.getBounds(); if (b.isValid()) map.fitBounds(b.pad(0.15)); }

  // ---------- jobs on this device ----------
  try { const jobs = (await S.jobs()) || []; const cur = S.settings.get('jobId'); // current job first, then past jobs (newest first)
    jobs.sort((a, b) => (b.id === cur) - (a.id === cur) || String(b.finished || b.updated || '').localeCompare(String(a.finished || a.updated || '')));
    for (const j of jobs) $('jobSel').add(new Option(j.name + (j.client ? ' - ' + j.client : '') + (j.id === cur ? ' (current)' : ' (past job)'), j.id)); } catch (e) {}
  function applyJob(j, src) {
    job = j; $('proj').value = j.name || ''; $('client').value = j.client || ''; $('site').value = j.site || ''; $('pids').value = j.parcels || '';
    if (JUR_OPTS.find(o => o.key === j.jurisdiction)) $('jur').value = j.jurisdiction;
    if (C.CRS[j.crs]) $('crs').value = j.crs;
    if (j.parcelGeo && j.parcelGeo.features && j.parcelGeo.features.length) { setParcels(j.parcelGeo.features, j.parcelGeo.retrieved, null, j.parcelGeo.source); }
    $('rpt').disabled = !trees.length; showTrees(src);
  }
  async function loadDeviceJob(id) {
    const j = await S.getJob(+id); if (!j) { $('tStat').textContent = 'Job ' + id + ' not found on this device.'; return; }
    trees = (await S.treesFor(j.id)) || []; trees.sort((a, b) => a.point_no - b.point_no); checks = (await S.checksFor(j.id)) || [];
    $('jobSel').value = String(j.id); applyJob(j, 'job "' + j.name + '" on this device');
  }
  $('jobSel').onchange = () => $('jobSel').value && loadDeviceJob($('jobSel').value);

  // ---------- parcels ----------
  function setParcels(features, when, j, source) {
    parcels = features; retrieved = when || ''; pLayer.clearLayers(); pLayer.addData({ type: 'FeatureCollection', features }); fit();
    parcelInfo = { source: source || (j ? j.copyright : ''), retrieved, idField: j ? j.idField : undefined };
    document.body.dataset.parcels = String(parcels.length);
    if (!j) $('pStat').textContent = `Using ${features.length} cached parcel outline(s) saved with the job (retrieved ${retrieved}).`;
  }
  async function loadParcels() {
    const o = jur(); if (!o) return; const j = o.src;
    $('pStat').textContent = 'Querying ' + j.name + ' parcel service...';
    try {
      const r = await TSParcels.query(j.id, $('pids').value);
      setParcels(r.features, r.retrieved, j);
      const fresh = (j.freshness || []).map(x => x.text || x.label).filter(Boolean).join('; ');
      $('pStat').textContent = `Loaded ${r.features.length} parcel(s) at ${r.retrieved}.` + (r.missing.length ? ` Not found: ${r.missing.join(', ')}.` : '') +
        `\nSource: ${j.copyright} via ${j.parcelLayerUrl.replace(/^https?:\/\//, '')}.` + (fresh ? ' ' + fresh + '.' : '') + `\nTerms: ${j.terms}`;
      if (job && job.id && r.features.length) { job.parcels = $('pids').value; job.parcelGeo = { features: r.features, retrieved: r.retrieved, source: j.copyright, idField: j.idField }; try { await S.putJob(job); } catch (e) {} }
    } catch (e) { $('pStat').textContent = 'Parcel query failed: ' + e.message + ' (check connection; county GIS may be down).'; }
  }
  $('loadP').onclick = loadParcels;

  // ---------- points ----------
  function showTrees(src) {
    tLayer.clearLayers();
    for (const t of trees) {
      L.circleMarker([t.lat, t.lon], { radius: 6, color: '#fff', weight: 2, fillColor: /^Y/i.test(t.heritage) ? '#c62828' : /^Y/i.test(t.protected) ? '#ef6c00' : '#2e7d4f', fillOpacity: 1 })
        .bindTooltip(String(t.tag), { permanent: true, direction: 'right' }).bindPopup(`Tag ${t.tag}<br>${t.species || ''} ${t.dbh_in || ''} in<br>\u00b1${t.acc_ft ? (+t.acc_ft).toFixed(0) : '?'} ft`).addTo(tLayer);
      if ($('accC').checked && +t.acc_ft > 0) L.circle([t.lat, t.lon], { radius: +t.acc_ft / C.M_TO_USFT, color: '#b26a00', weight: 1, dashArray: '4 4', fill: false }).addTo(tLayer);
    }
    $('tStat').textContent = `${trees.length} tree(s) from ${src}.`; document.body.dataset.trees = String(trees.length); fit();
  }
  function parsePoints(text) {
    const rows = C.parseCSV(text);
    const hi = rows.findIndex(r => r.includes('Tag #') && r.includes('Latitude'));
    if (hi >= 0) { // tree log CSV
      const h = rows[hi], ix = n => h.indexOf(n);
      return { src: 'tree log CSV', trees: rows.slice(hi + 1).map(r => ({ tag: r[ix('Tag #')], species: r[ix('Species')], dbh_in: r[ix('DBH (in)')], canopy_ft: r[ix('Canopy / dripline radius (ft)')], condition: r[ix('Condition')],
        protected: r[ix('Protected? (Y/N)')], heritage: r[ix('Heritage? (Y/N)')], notes: r[ix('Field notes')],
        acc_ft: r[ix('GPS accuracy (ft, reported)')], pos_src: /^Manual/i.test(r[ix('Position source')] || '') ? 'manual' : 'gps', lat: +r[ix('Latitude')], lon: +r[ix('Longitude')], point_no: r[ix('Point #')] })).filter(t => isFinite(t.lat) && isFinite(t.lon)) };
    }
    const crs = $('crs').value; // PNEZD: P,N,E,Z,D
    const out = rows.filter(r => r.length >= 3 && isFinite(+r[1]) && isFinite(+r[2]) && r[1] !== '').map(r => {
      const ll = C.fromNE(+r[1], +r[2], crs), d = (r[4] || '').trim(), m = d.match(/^T?(\S+)\s+(.*?)(?:\s+([\d.]+)in)?$/);
      return { point_no: r[0], lat: ll.lat, lon: ll.lon, tag: m ? m[1] : r[0], species: m ? m[2] : d, dbh_in: m && m[3] ? m[3] : '', acc_ft: '' };
    });
    return { src: 'PNEZD CSV (' + crs + ')', trees: out };
  }
  function importText(text, name) {
    if (/^\s*\{/.test(text)) {
      const d = JSON.parse(text); if (d.app !== 'zt-tree-inventory' && d.app !== 'zt-tree-survey') throw new Error('Not a ' + C.PRODUCT_NAME + ' job backup');
      trees = (d.trees || []).slice().sort((a, b) => a.point_no - b.point_no); checks = d.checks || [];
      const j = Object.assign({}, d.job || { name: d.settings && d.settings.project, parcels: d.settings && d.settings.parcels, crs: d.settings && d.settings.crs }); delete j.id;
      if (d.parcelGeo) j.parcelGeo = d.parcelGeo;
      $('jobSel').value = ''; applyJob(j, 'job backup ' + name); return;
    }
    const r = parsePoints(text); trees = r.trees; checks = []; job = null; $('rpt').disabled = !trees.length; showTrees(r.src + ': ' + name);
  }
  $('ptsFile').onchange = async () => { const f = $('ptsFile').files[0]; if (!f) return; try { importText(await f.text(), f.name); } catch (e) { $('tStat').textContent = 'Import failed: ' + e.message; } };
  $('accC').onchange = () => showTrees('current set');

  // ---------- sketch + report ----------
  const canvas = $('sketch');
  function jobInfo() {
    const o = jur(); return Object.assign({}, job || {}, { name: $('proj').value, client: $('client').value, site: $('site').value, parcels: $('pids').value,
      jurisdiction: job && job.jurisdiction || (o && /^(PNS|ESC|SR)$/.test(o.key) ? o.key : 'OTHER'), jurisdictionLabel: o ? o.label : '' });
  }
  async function doRender() {
    const aerial = $('base').value === 'cfg' && !!BASEMAP;
    $('sStat').textContent = 'Rendering' + (aerial ? ' (fetching background, may take ~30 s)...' : '...');
    try {
      const r = await TSSketch.render(canvas, { parcels, trees, crs: $('crs').value, idField: parcelInfo && parcelInfo.idField, job: jobInfo(), page: $('page').value,
        title: 'Tree Location Sketch (approximate)', aerial, basemap: BASEMAP, accCircles: $('accC').checked,
        parcelSource: parcelInfo ? parcelInfo.source + (jur() ? ' (' + jur().label + ')' : '') : 'none loaded', retrieved });
      $('png').disabled = $('pdf').disabled = false; $('rpt').disabled = !trees.length;
      $('sStat').textContent = `Rendered ${r.page === 'tabloid' ? '11x17' : 'letter'}. Background: ` + r.aerialNote;
      document.body.dataset.rendered = '1'; document.body.dataset.page = r.page; document.body.dataset.aerial = r.aerialNote;
      if (innerWidth < 900) canvas.scrollIntoView({ block: 'start' }); return r;
    } catch (e) { $('sStat').textContent = 'Sketch failed: ' + e.message; document.body.dataset.rendered = 'error'; }
  }
  $('render').onclick = doRender;
  const nm = () => ($('proj').value || 'tree-sketch').replace(/[^\w-]+/g, '_') + '_sketch_' + ($('page').value === 'tabloid' ? '11x17' : 'letter');
  function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); self.TSLastExport = [name]; }
  $('png').onclick = () => canvas.toBlob(b => dl(b, nm() + '.png'), 'image/png');
  $('pdf').onclick = () => dl(TSSketch.exportPDF(canvas, nm(), $('page').value).output('blob'), nm() + '.pdf');
  $('rpt').onclick = async () => {
    $('sStat').textContent = 'Building report...';
    try {
      const j = jobInfo(), aerial = $('base').value === 'cfg' && !!BASEMAP;
      const doc = await TSReport.build({ job: j, jurisdictionLabel: j.jurisdictionLabel, trees: trees.map(t => { const ne = C.toNE(+t.lat, +t.lon, $('crs').value); return Object.assign({}, t, { northing: ne.northing, easting: ne.easting }); }),
        checks, crs: $('crs').value, parcels, parcelInfo: parcelInfo && Object.assign({}, parcelInfo, { source: parcelInfo.source }), aerial, basemap: BASEMAP });
      dl(doc.output('blob'), ($('proj').value || 'job').replace(/[^\w-]+/g, '_') + '_Tree_Inventory_Report.pdf'); $('sStat').textContent = 'Report exported.';
    } catch (e) { $('sStat').textContent = 'Report failed: ' + e.message; }
  };

  // URL params: ?job=<id on this device>&auto=1 (from the field app) or ?j=PNS|ESC|SR&parcels=..&points=sample/x.csv&project=..&page=tabloid&aerial=0&auto=1
  if (q.get('j')) $('jur').value = q.get('j') === 'escambia' ? 'ESC' : q.get('j') === 'santa-rosa' ? 'SR' : q.get('j');
  if (q.get('parcels')) $('pids').value = q.get('parcels');
  if (q.get('project')) $('proj').value = q.get('project');
  if (q.get('page')) $('page').value = q.get('page');
  if (q.get('aerial') === '0') $('base').value = 'none';
  $('base').onchange();
  if (q.get('job')) await loadDeviceJob(q.get('job'));
  if (q.get('points')) { const r = parsePoints(await (await fetch(q.get('points'))).text()); trees = r.trees; showTrees(r.src + ': ' + q.get('points')); }
  if (q.get('auto')) { if (!parcels.length && $('pids').value.trim()) await loadParcels(); if (trees.length || parcels.length) await doRender(); }
  document.body.dataset.ready = '1';
  self.TSDesk = { canvas, getState: () => ({ parcels, trees, job }), render: doRender, importText };
})();
