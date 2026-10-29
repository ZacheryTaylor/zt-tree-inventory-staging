/* ZT Tree Inventory v1.0 - field app (iPhone-first PWA). Jobs, one-handed capture, exports via the Share sheet.
 * Tree inventory / GPS tree mapping data only: approximate locations, not a survey. */
(function () {
  'use strict';
  const C = TSCore, S = TSStore, $ = id => document.getElementById(id);
  /** v1.0.1: "Proposed action" was removed; older saved trees may still carry `action`. It is ignored and dropped on save/export. */
  const dropLegacy = t => { const c = Object.assign({}, t); delete c.action; return c; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let job = null, jobs = [], trees = [], checks = [], allTrees = [];
  let editId = null, fix = null, kFix = null, readings = [], watchId = null, timer = null, poll = null, gpsTarget = null, gpsN = 10;
  let photoBlob = null, photoChanged = false, touched = { prot: false, her: false }, spVal = '', pendingShare = null;

  // ---------- small UI helpers ----------
  function setSeg(el, v) { for (const b of el.querySelectorAll('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); el.dataset.val = v || ''; }
  const getSeg = el => el.dataset.val || '';
  function chipGroup(el, values, onPick, allowNone) {
    el.innerHTML = values.map(v => `<button type="button" class="chip" data-v="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('');
    el.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const v = allowNone && getSeg(el) === b.dataset.v ? '' : b.dataset.v; setSeg(el, v); onPick && onPick(v); };
  }
  let toastT = null, undoFn = null;
  function toast(m, undo) {
    $('toastMsg').textContent = m; undoFn = undo || null; $('toastUndo').hidden = !undo; $('toast').classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => { $('toast').classList.remove('show'); undoFn = null; }, undo ? 7000 : 2600);
  }
  $('toastUndo').onclick = async () => { const f = undoFn; undoFn = null; $('toast').classList.remove('show'); if (f) { await f(); toast('Undone'); } };
  const localDate = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ---------- static text ----------
  document.title = C.PRODUCT_NAME + ' - Field'; $('appName').textContent = C.PRODUCT_NAME;
  $('appSub').textContent = C.SERVICE_DESC + ' \u00b7 ' + C.VERSION_TAG;
  $('accBanner').innerHTML = '<b>' + esc(C.SKETCH_LABEL) + '</b> Phone GPS: expect ~10&ndash;30 ft error.';
  $('foot').textContent = C.DISCLAIMER + ' ' + C.PRODUCT_NAME + ' ' + C.VERSION_TAG + '.';
  const setHH = () => document.documentElement.style.setProperty('--hh', $('hdr').offsetHeight + 'px'); setHH(); addEventListener('resize', setHH);

  // ---------- tabs ----------
  function showTab(name) {
    for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + name;
    $('bar').hidden = name !== 'capture'; document.body.dataset.tab = name; scrollTo(0, 0);
    if (name === 'trees') renderList(); if (name === 'more') refreshJobs().then(renderMore); if (name === 'check') renderChecks(); if (name === 'export') renderExport();
  }
  $('tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };

  // ---------- CRS ----------
  const userCrs = S.settings.get('userCrs') || {};
  for (const [k, v] of Object.entries(userCrs)) { try { C.addCrs(k, v.label, v.proj, v.src); } catch (e) {} }
  function fillCrs() { const sel = $('jCrs'); sel.innerHTML = ''; for (const [k, v] of Object.entries(C.CRS)) sel.add(new Option(v.label + (k === C.DEFAULT_CRS ? ' (default)' : ''), k)); }
  fillCrs();
  const crs = () => (job && C.CRS[job.crs]) ? job.crs : C.DEFAULT_CRS;
  $('cAdd').onclick = async () => {
    $('cErr').textContent = '';
    try {
      const code = $('cCode').value.trim(), p = $('cProj').value.trim(); if (!code || !p) throw new Error('Code and proj4 string required');
      const v = C.addCrs(code, $('cLabel').value.trim() || code, p, 'user-added'); userCrs[code] = { label: v.label, proj: p, src: 'user-added' };
      S.settings.set('userCrs', userCrs); fillCrs(); job.crs = code; $('jCrs').value = code; await saveJob(); toast('Added ' + code);
    } catch (e) { $('cErr').textContent = e.message; }
  };

  // ---------- jobs: single "current job" model (v1.0.1) ----------
  // The app always opens on the current job. Past jobs live under More. No job selection in the capture flow.
  for (const [k, v] of Object.entries(C.JURISDICTIONS)) $('jJur').add(new Option(v.label, k));
  for (const [k, v] of Object.entries(C.SR_LOCS)) $('jSrLoc').add(new Option(v, k));
  const JUR_SHORT = { PNS: 'Pensacola', ESC: 'Escambia', SR: 'Santa Rosa' };
  const JOB_DEFAULTS = () => ({ name: 'Job ' + localDate(), autoName: true, client: '', site: '', parcels: '', jurisdiction: 'OTHER', srLoc: 'S', date: localDate(), crew: '', notes: '',
    crs: C.DEFAULT_CRS, start: 1000, elev: 'zero', accLimit: C.DEFAULT_ACC_LIMIT_FT, nRead: 10, wait: 45, archived: false, created: new Date().toISOString() });
  /** Default name: "Job <date>" plus the first parcel ID or the jurisdiction when known. */
  function autoName(j) { const p = TSParcels.splitIds(j.parcels)[0], jr = JUR_SHORT[j.jurisdiction]; return 'Job ' + (j.date || localDate()) + (p ? ' ' + p : jr ? ' ' + jr : ''); }
  const JOB_FIELDS = { jName: 'name', jClient: 'client', jSite: 'site', jParcels: 'parcels', jJur: 'jurisdiction', jSrLoc: 'srLoc', jDate: 'date', jCrew: 'crew', jNotes: 'notes',
    jCrs: 'crs', jNRead: 'nRead', jWait: 'wait', jAccLim: 'accLimit', jStart: 'start', jElev: 'elev' };
  const NUMF = new Set(['nRead', 'wait', 'accLimit', 'start']);
  function fillJobForm() {
    for (const [id, k] of Object.entries(JOB_FIELDS)) $(id).value = job[k] == null ? '' : job[k];
    $('jSrBox').hidden = job.jurisdiction !== 'SR'; $('jobChip').textContent = job.name || 'Job';
  }
  let jobSaveT = null;
  for (const [id, k] of Object.entries(JOB_FIELDS)) {
    $(id).addEventListener(/^(SELECT)$/.test($(id).tagName) || $(id).type === 'date' ? 'change' : 'input', () => {
      job[k] = NUMF.has(k) ? (+$(id).value || JOB_DEFAULTS()[k]) : $(id).value;
      if (k === 'name') job.autoName = !$(id).value.trim();
      if (job.autoName || !String(job.name || '').trim()) { job.name = autoName(job); job.autoName = true; if (k !== 'name') $('jName').value = job.name; }
      if (k === 'parcels' || k === 'jurisdiction') delete job.parcelGeo; // cached outline no longer matches
      $('jSrBox').hidden = job.jurisdiction !== 'SR'; $('jobChip').textContent = job.name || 'Job';
      clearTimeout(jobSaveT); jobSaveT = setTimeout(saveJob, 350);
      if (k === 'jurisdiction' || k === 'srLoc') updateSugg(); if (k === 'crs') showFix(); if (k === 'start' && editId == null) $('tPt').value = nextPoint();
    });
  }
  async function saveJob() { clearTimeout(jobSaveT); job.updated = new Date().toISOString(); await S.putJob(job); $('jSaved').textContent = 'Saved ' + new Date().toLocaleTimeString(); }
  async function openJob(id) {
    const j = await S.getJob(id); if (!j) return; job = Object.assign(JOB_DEFAULTS(), j); job.archived = false; job.lastOpened = new Date().toISOString();
    await S.putJob(job); S.settings.set('jobId', job.id);
    fillJobForm(); await loadTrees(); checks = await S.checksFor(job.id) || []; clearForm(); updateSugg();
  }
  async function newJob(base) {
    const j = Object.assign(JOB_DEFAULTS(), base || {}); delete j.id; if (j.autoName !== false) { j.autoName = true; j.name = autoName(j); }
    const id = await S.putJob(j); return id;
  }
  /** Settings carried into the next job (same crew, area and GPS setup); client/site/parcels start blank. */
  const carry = prev => prev ? { jurisdiction: prev.jurisdiction, srLoc: prev.srLoc, crs: prev.crs, nRead: prev.nRead, wait: prev.wait, accLimit: prev.accLimit, elev: prev.elev, crew: prev.crew, start: prev.start } : {};
  async function refreshJobs() { jobs = await S.jobs() || []; allTrees = await S.all() || []; }
  async function deleteJobData(id) {
    for (const t of (await S.treesFor(id)) || []) { await S.del(t.id); await S.delPhoto(t.id); }
    for (const c of (await S.checksFor(id)) || []) await S.delCheck(c.id);
    await S.delJob(id);
  }
  const isBlankJob = (j, n) => !n && !j.client && !j.site && !j.parcels && !j.notes;

  // job details sheet: edit any time from the header chip; asked once (optional, prefilled, skippable) before the first export
  let sheetResolve = null;
  function openSheet(mode) {
    fillJobForm(); const exp = mode === 'export';
    $('jobSheetTitle').textContent = exp ? 'Add job details for the export? (optional)' : 'Current job';
    $('jobSheetNote').textContent = exp ? 'These print on the report and export headers. Fill in what you know, or skip. You will not be asked again for this job; you can still edit any time from the job name at the top.'
      : 'Everything here is optional and can be changed any time. Changes save automatically.';
    $('jSkip').hidden = !exp; $('jDone').textContent = exp ? 'Save & continue' : 'Done';
    $('jobSheet').hidden = false; document.body.dataset.sheet = mode; $('jobSheet').querySelector('.sheetcard').scrollTop = 0;
  }
  async function closeSheet(go) {
    $('jobSheet').hidden = true; delete document.body.dataset.sheet;
    const r = sheetResolve; sheetResolve = null; if (r) r(go); // continue the export inside the same tap (keeps the iOS share gesture)
    await saveJob(); renderMore(); renderExport();
  }
  $('jobChip').onclick = () => openSheet('edit');
  $('mEditJob').onclick = () => openSheet('edit');
  $('jDone').onclick = () => { if (sheetResolve) job.detailsAsked = true; closeSheet(true); };
  $('jSkip').onclick = () => { job.detailsAsked = true; closeSheet(true); };
  $('jobSheetBg').onclick = () => closeSheet(!sheetResolve);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('jobSheet').hidden) closeSheet(!sheetResolve); });
  const missingDetails = j => !j.client || !j.site || !j.parcels || j.jurisdiction === 'OTHER';
  /** Before the first export of a job: offer the details sheet once. Resolves true to continue, false if dismissed. */
  function ensureDetails() {
    if (job.detailsAsked || !missingDetails(job)) return Promise.resolve(true);
    return new Promise(res => { sheetResolve = res; openSheet('export'); });
  }

  // past jobs (More tab)
  function renderMore() {
    if (!job) return; const counts = {}; for (const t of allTrees) counts[t.jobId] = (counts[t.jobId] || 0) + 1;
    $('mJob').innerHTML = `<b>${esc(job.name)}</b> \u00b7 ${trees.length} trees \u00b7 ${esc(job.client || 'no client yet')} \u00b7 ${esc((C.JURISDICTIONS[job.jurisdiction] || {}).label)}`;
    const past = jobs.filter(j => j.id !== job.id).sort((a, b) => String(b.finished || b.updated || b.created).localeCompare(String(a.finished || a.updated || a.created)));
    $('pjCount').textContent = past.length;
    $('pastJobs').innerHTML = past.map(j => `<div class="jobitem" data-id="${j.id}"><b>${esc(j.name)}</b>${j.exportedAt ? '' : ' <span class="pill">not exported</span>'}
      <div class="small">${esc(j.client || 'no client')} \u00b7 ${counts[j.id] || 0} trees \u00b7 ${esc(j.date || '')}${j.finished ? ' \u00b7 finished ' + esc(new Date(j.finished).toLocaleDateString()) : ''}</div>
      <div class="acts"><button data-a="open">Reopen</button><button class="sec" data-a="exp">Export (.zip)</button><button class="danger" data-a="del">Delete</button></div></div>`).join('') || '<div class="small">No past jobs yet.</div>';
  }
  $('pastJobs').onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const id = +b.closest('[data-id]').dataset.id, j = jobs.find(x => x.id === id); if (!j) return;
    if (b.dataset.a === 'open') {
      if (!confirm(`Reopen "${j.name}" as the current job? "${job.name}" moves to Past jobs.`)) return;
      await saveJob(); const prev = job;
      if (isBlankJob(prev, trees.length) && !checks.length) await deleteJobData(prev.id); else { prev.archived = true; prev.updated = new Date().toISOString(); await S.putJob(prev); }
      await openJob(id); await refreshJobs(); renderMore(); toast('Reopened ' + j.name); showTab('capture');
    }
    if (b.dataset.a === 'exp') await busy(b, () => withJob(id, async () => exportAll()));
    if (b.dataset.a === 'del') {
      const n = allTrees.filter(t => t.jobId === id).length;
      if (!confirm(`Delete "${j.name}" and its ${n} trees from this device?${j.exportedAt ? '' : ' It was never exported.'} This cannot be undone.`)) return;
      await deleteJobData(id); await refreshJobs(); renderMore(); toast('Deleted ' + j.name);
    }
  };
  /** Run an export against a past job without switching the current job. */
  async function withJob(id, fn) {
    const saved = { job, trees, checks };
    job = Object.assign(JOB_DEFAULTS(), await S.getJob(id)); trees = ((await S.treesFor(id)) || []).sort((a, b) => a.point_no - b.point_no); checks = (await S.checksFor(id)) || [];
    try { await fn(); } finally { job = saved.job; trees = saved.trees; checks = saved.checks; await refreshJobs(); renderMore(); }
  }

  // ---------- GPS ----------
  const accClass = ft => ft == null ? 'none' : ft <= 16 ? 'good' : ft <= (job ? +job.accLimit : 30) ? 'ok' : 'poor';
  const limit = () => +(job && job.accLimit) || C.DEFAULT_ACC_LIMIT_FT;
  const tooPoor = f => f && !f.manual && f.acc_ft_mean > limit();
  function showFix() {
    const f = fix, chip = $('barAcc'), big = $('gAccBig');
    if (!f) { chip.className = big.dataset.c = 'acc none'; chip.textContent = 'no fix'; $('gAcc').className = 'acc none'; $('gAcc').textContent = 'no fix'; big.textContent = '--';
      $('gAccNote').textContent = 'no fix yet'; $('gLL').textContent = $('gNE').textContent = $('gCount').textContent = '\u2013'; updateAccWarn(); return; }
    const ne = C.toNE(f.lat, f.lon, crs());
    const txt = f.manual ? 'manual' : '\u00b1' + f.acc_ft_mean.toFixed(0) + ' ft', cls = 'acc ' + (f.manual ? 'poor' : accClass(f.acc_ft_mean));
    chip.className = $('gAcc').className = cls; chip.textContent = $('gAcc').textContent = txt; big.textContent = txt;
    $('gAccNote').textContent = f.manual ? 'manual entry, accuracy unknown' : (f.n > 1 ? `average of ${f.n} \u00b7 best \u00b1${f.acc_ft_best.toFixed(0)} ft \u00b7 spread ${f.spread_ft.toFixed(1)} ft` : 'single reading') + ' (phone estimate)';
    $('gLL').textContent = f.lat.toFixed(7) + ', ' + f.lon.toFixed(7);
    $('gNE').textContent = ne.northing.toFixed(1) + ' / ' + ne.easting.toFixed(1); $('gCount').textContent = f.n + (f.manual ? ' (manual)' : '');
    updateAccWarn();
  }
  function stopGps(msg) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; clearTimeout(timer); clearInterval(poll);
    $('gStop').disabled = true; $('gOne').disabled = false; $('gAvg').textContent = '\u25c9 Capture'; $('kCap').textContent = 'Capture & average on this point'; $('kCap').disabled = false;
    const tgt = gpsTarget; gpsTarget = null;
    if (msg) setGpsStat(tgt, msg);
    if (tgt === 'check' && readings.length) finishCheck();
  }
  const setGpsStat = (tgt, m) => { $(tgt === 'check' ? 'kStat' : 'gStat').textContent = m; };
  function startGps(target, n) {
    if (gpsTarget) { stopGps('Stopped at ' + readings.length + ' of ' + gpsN + ' readings.'); return; }
    setGpsStat(target, ''); $('permCard').hidden = true;
    if (!('geolocation' in navigator)) { setGpsStat(target, 'Location is not available in this browser. Use manual lat/long.'); return; }
    if (!isSecureContext) setGpsStat(target, 'GPS needs HTTPS (or localhost). Open the HTTPS copy or use manual lat/long.');
    readings = []; gpsTarget = target; gpsN = n; $('gProg').style.width = '0';
    $('gStop').disabled = false; $('gOne').disabled = true;
    if (target === 'tree') $('gAvg').textContent = 'Stop (0/' + n + ')'; else { $('kCap').textContent = 'Stop (0/' + n + ')'; }
    setGpsStat(target, 'Waiting for GPS\u2026');
    let lastKey = null, errs = 0;
    const onPos = p => {
      const key = [p.timestamp, p.coords.latitude, p.coords.longitude, p.coords.accuracy].join('|');
      if (watchId == null || key === lastKey) return; lastKey = key; // drop exact repeats (cached fixes)
      readings.push({ lat: p.coords.latitude, lon: p.coords.longitude, acc_m: p.coords.accuracy, alt_m: p.coords.altitude });
      const f = C.averageReadings(readings);
      if (target === 'tree') { fix = f; showFix(); $('gAvg').textContent = `Stop (${readings.length}/${n})`; }
      else { kFix = f; $('kCap').textContent = `Stop (${readings.length}/${n})`; }
      setGpsStat(target, `Reading ${readings.length} of ${n} \u00b7 \u00b1${(p.coords.accuracy * C.M_TO_USFT).toFixed(0)} ft this reading`);
      $('gProg').style.width = Math.min(100, 100 * readings.length / n) + '%';
      if (readings.length >= n) stopGps(`Averaged ${readings.length} readings.`);
    };
    const onErr = e => {
      if (e.code === 1) { stopGps('Location permission denied.'); $('permCard').hidden = false; if (target === 'check') setGpsStat('check', 'Location permission denied: see the Capture tab for how to allow it.'); document.body.dataset.perm = 'denied'; return; }
      errs++; setGpsStat(target, 'Weak signal, still trying\u2026 (' + (readings.length) + ' of ' + n + ' readings)'); // code 2/3: transient, keep going
    };
    const opt = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
    watchId = navigator.geolocation.watchPosition(onPos, onErr, opt);
    // some devices only push watch updates on movement: also poll about once a second while averaging
    poll = setInterval(() => navigator.geolocation.getCurrentPosition(onPos, e => { if (e.code === 1) onErr(e); }, opt), 1100);
    timer = setTimeout(() => { if (watchId != null) stopGps(readings.length ? `Stopped at ${readings.length} of ${n} readings (time limit). Position uses what was collected.` : `No GPS fix within ${job.wait} s. Move to open sky and try again, or use manual lat/long.`); }, (+job.wait || 45) * 1000);
  }
  $('gAvg').onclick = () => startGps('tree', Math.max(1, +job.nRead || 10));
  $('gOne').onclick = () => startGps('tree', 1);
  $('gStop').onclick = () => stopGps('Stopped at ' + readings.length + ' of ' + gpsN + ' readings.');
  $('mUse').onclick = () => {
    const lat = parseFloat($('mLat').value), lon = parseFloat($('mLon').value);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { $('gStat').textContent = 'Enter decimal degrees (longitude is negative in Florida).'; return; }
    fix = { lat, lon, n: 1, alt_m: null, acc_ft_mean: null, acc_ft_best: null, spread_ft: null, manual: true }; showFix(); toast('Manual position set');
  };
  function updateAccWarn() {
    const using = editId == null || getSeg($('tPos')) === 'new';
    const bad = using && tooPoor(fix);
    $('accWarn').hidden = !bad; if (bad) $('accWarnTxt').textContent = `Accuracy \u00b1${fix.acc_ft_mean.toFixed(0)} ft is worse than this job's ${limit()} ft limit.`;
    if (editId != null) $('tPosNote').textContent = fix ? (getSeg($('tPos')) === 'new' ? 'Will move this tree to the new fix.' : 'A new fix is available; choose "Use new GPS fix" to move this tree.') : 'Capture a fix first if you want to move this tree.';
  }

  // ---------- species picker ----------
  const recent = () => S.settings.get('recentSp') || ['Southern live oak', 'Laurel oak', 'Water oak', 'Longleaf pine', 'Slash pine', 'Southern magnolia'];
  function renderRecent() { $('spRecent').innerHTML = recent().slice(0, 6).map(s => `<button type="button" class="chip" data-sp="${esc(s)}" aria-pressed="${s === spVal}">${esc(s)}</button>`).join(''); }
  function pushRecent(s) { if (!s) return; S.settings.set('recentSp', [s, ...recent().filter(x => x !== s)].slice(0, 8)); }
  function lev(a, b) { a = a.toLowerCase(); b = b.toLowerCase(); const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; }
  function closest(q) { let best = null, bd = 1e9; for (const [c] of C.LISTS.species) { const d = Math.min(lev(q, c), ...c.split(' ').map(w => lev(q, w) + 2)); if (d < bd) { bd = d; best = c; } } return bd <= Math.max(3, q.length / 2) ? best : null; }
  function setSpecies(s) {
    spVal = s; $('tSpQ').value = s; $('spList').hidden = true; renderRecent();
    const rec = C.speciesRec(s);
    if (!s) $('spPicked').innerHTML = '';
    else if (rec) $('spPicked').textContent = rec[1] !== '-' ? rec[1] : '';
    else { const m = closest(s); $('spPicked').innerHTML = `<span class="err">Not in the calculator list</span>: exports map it to "Other / unlisted species".` + (m ? ` Did you mean <button type="button" class="chip" data-sp="${esc(m)}">${esc(m)}</button>?` : ''); }
    updateSugg();
  }
  function renderSpList() {
    const q = $('tSpQ').value.trim().toLowerCase(); if (!q) { $('spList').hidden = true; return; }
    const hits = C.LISTS.species.filter(([c, s]) => c.toLowerCase().includes(q) || String(s).toLowerCase().includes(q)).slice(0, 12);
    $('spList').innerHTML = hits.map(([c, s]) => `<button type="button" data-sp="${esc(c)}">${esc(c)} <i>${s !== '-' ? esc(s) : ''}</i></button>`).join('') +
      (hits.some(h => h[0].toLowerCase() === q) ? '' : `<button type="button" data-sp="${esc($('tSpQ').value.trim())}">Use "${esc($('tSpQ').value.trim())}" (not in list)</button>`);
    $('spList').hidden = false;
  }
  $('tSpQ').addEventListener('input', () => { spVal = ''; renderSpList(); });
  // typed text without picking: accept it after a short delay (a tap on the list wins; pointerdown on the list keeps focus so no blur race)
  $('tSpQ').addEventListener('change', () => setTimeout(() => { const v = $('tSpQ').value.trim(); if (v && v !== spVal) { const r = C.speciesRec(v); setSpecies(r ? r[0] : v); } }, 250));
  for (const id of ['spList', 'spRecent', 'spPicked']) {
    $(id).addEventListener('pointerdown', e => { if (e.target.closest('[data-sp]')) e.preventDefault(); });
    $(id).addEventListener('mousedown', e => { if (e.target.closest('[data-sp]')) e.preventDefault(); });
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) setSpecies(b.dataset.sp); });
  }

  // ---------- form ----------
  chipGroup($('tCond'), C.LISTS.conditions, v => { condNote(v); updateSugg(); });
  function condNote(v) {
    const w = $('condWarn');
    if (/^Hazard/.test(v)) { w.hidden = false; w.innerHTML = '<b>Only if the client already has tree-risk documentation.</b> Under F.S. 163.045 that documentation must come from an ISA Certified Arborist or a Florida licensed landscape architect. Selecting this records that the documentation exists; it is not your risk call.'; }
    else if (v === 'Dead') { w.hidden = false; w.textContent = 'Visual field note. Dead trees are not counted as protected/heritage by the mitigation calculator.'; }
    else w.hidden = true;
  }
  for (const [el, k] of [[$('tProt'), 'prot'], [$('tHer'), 'her']]) el.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; setSeg(el, b.dataset.v); touched[k] = true; updateSugg(); };
  $('tPos').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'new' && !fix) { toast('Capture a GPS fix first'); return; } setSeg($('tPos'), b.dataset.v); updateAccWarn(); };
  function formTree() { return { species: spVal || $('tSpQ').value.trim(), dbh_in: $('tDbh').value, condition: getSeg($('tCond')), prev: $('tPrev').value, ms: $('tMs').value, champ: $('tChamp').value }; }
  function updateSugg() {
    if (!job) return;
    const sg = C.suggestStatus(formTree(), job), out = $('tSugg');
    if (!sg.basis) { out.textContent = job.jurisdiction === 'OTHER' ? 'No jurisdiction set: protected/heritage are your field call.' : ''; return; }
    if (!touched.prot && sg.protected) setSeg($('tProt'), sg.protected);
    if (!touched.her && (sg.heritage === 'Y' || sg.heritage === 'N')) setSeg($('tHer'), sg.heritage);
    const diff = (sg.protected && getSeg($('tProt')) !== sg.protected) || ((sg.heritage === 'Y' || sg.heritage === 'N') && getSeg($('tHer')) !== sg.heritage);
    out.innerHTML = `Suggested, field judgement: protected <b>${sg.protected || '?'}</b>, heritage <b>${sg.heritage || '?'}</b>${diff ? ' (you changed this)' : ''}. <span class="small">${esc(sg.basis)}</span>`;
  }
  function stemOut() {
    const v = C.parseStems($('tStems').value), d = v && v.length ? C.combinedDBH(v) : null;
    $('tStemOut').textContent = v === null ? 'Enter numbers separated by commas.' : d != null ? `Combined DBH = ${d} in (${v.length} stems). ` + C.MULTI_STEM_NOTE : '';
    $('tStemUse').disabled = d == null; return d;
  }
  $('tStems').addEventListener('input', stemOut);
  $('tStemUse').onclick = () => { const d = stemOut(); if (d != null) { $('tDbh').value = d; updateSugg(); toast('DBH set to ' + d + ' in'); } };
  $('tDbh').addEventListener('input', updateSugg);
  for (const id of ['tPrev', 'tMs', 'tChamp']) $(id).addEventListener('change', updateSugg);
  $('tTag').addEventListener('input', tagWarn);
  function tagWarn() { const v = $('tTag').value.trim(); const d = v && trees.find(x => x.id !== editId && String(x.tag) === v); $('tTagWarn').textContent = d ? `Tag ${v} is already used (${d.species}, ${d.dbh_in} in).` : ''; return !!d; }
  $('tPhoto').onchange = async () => {
    const f = $('tPhoto').files[0]; if (!f) return;
    photoBlob = await shrink(f, 1600, 0.75); photoChanged = true; $('tThumb').src = URL.createObjectURL(photoBlob); $('tThumb').hidden = false;
    toast('Photo ' + Math.round(photoBlob.size / 1024) + ' KB');
  };
  function shrink(file, max, q) {
    return new Promise(res => {
      const img = new Image(); img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => res(b || file), 'image/jpeg', q);
      }; img.onerror = () => res(file); img.src = URL.createObjectURL(file);
    });
  }

  function nextPoint() { const m = trees.reduce((a, t) => Math.max(a, +t.point_no || 0), (+job.start || 1000) - 1); return m + 1; }
  function nextTag() {
    if (!trees.length) return '1';
    const last = trees.slice().sort((a, b) => (a.id || 0) - (b.id || 0)).pop(), m = String(last.tag).match(/^(.*?)(\d+)$/);
    const used = new Set(trees.map(t => String(t.tag)));
    if (m) { let n = +m[2]; let s; do { n++; s = m[1] + String(n).padStart(m[2].length, '0'); } while (used.has(s)); return s; }
    const nums = trees.map(t => parseInt(t.tag, 10)).filter(isFinite); return nums.length ? String(Math.max(...nums) + 1) : '';
  }
  function clearForm() {
    editId = null; photoBlob = null; photoChanged = false; touched = { prot: false, her: false };
    for (const id of ['tDbh', 'tCan', 'tType', 'tNotes', 'tStems', 'tWet', 'tPrev', 'tMs', 'tChamp', 'tCanPct', 'tRootPct', 'tAccReason']) $(id).value = '';
    $('tAccOk').checked = false; stemOut(); setSpecies(''); setSeg($('tCond'), 'Good'); condNote('Good'); setSeg($('tProt'), 'N'); setSeg($('tHer'), 'N');
    $('tTag').value = nextTag(); $('tPt').value = nextPoint(); $('tPhoto').value = ''; $('tThumb').hidden = true; $('stemBox').open = $('moreBox').open = false;
    $('formTitle').textContent = 'New tree'; $('tSave').textContent = 'Save'; $('tDel').hidden = true; $('tErr').textContent = ''; $('posBox').hidden = true; tagWarn(); updateSugg(); updateAccWarn();
  }
  $('tNew').onclick = () => { clearForm(); toast('Form cleared'); };
  async function editTree(id) {
    const t = trees.find(x => x.id === id); if (!t) return;
    clearForm(); editId = t.id; touched = { prot: true, her: true };
    $('tTag').value = t.tag; $('tPt').value = t.point_no; setSpecies(t.species); $('tDbh').value = t.dbh_in; $('tCan').value = t.canopy_ft;
    setSeg($('tCond'), t.condition); condNote(t.condition); setSeg($('tProt'), t.protected || 'N'); setSeg($('tHer'), t.heritage || 'N');
    $('tType').value = t.ph_type || ''; $('tNotes').value = t.notes || ''; $('tStems').value = t.stems || '';
    for (const [id2, k] of [['tWet', 'wet'], ['tPrev', 'prev'], ['tMs', 'ms'], ['tChamp', 'champ'], ['tCanPct', 'can_pct'], ['tRootPct', 'root_pct']]) $(id2).value = t[k] == null ? '' : t[k];
    stemOut(); $('stemBox').open = !!t.stems; $('moreBox').open = !!(t.ph_type || t.wet || t.prev || t.ms || t.champ || (t.can_pct !== '' && t.can_pct != null) || (t.root_pct !== '' && t.root_pct != null));
    $('tAccReason').value = t.acc_reason || '';
    const ph = t.photo_name ? await S.getPhoto(t.id) : null;
    if (ph && ph.blob) { $('tThumb').src = URL.createObjectURL(ph.blob); $('tThumb').hidden = false; }
    $('formTitle').textContent = 'Edit tree ' + t.tag; $('tSave').textContent = 'Save edit'; $('tDel').hidden = false;
    $('posBox').hidden = false; setSeg($('tPos'), 'keep'); updateSugg(); updateAccWarn();
    showTab('capture'); scrollTo(0, $('treeCard').getBoundingClientRect().top + scrollY - $('tabs').getBoundingClientRect().bottom - 8);
  }

  $('tSave').onclick = async () => {
    $('tErr').textContent = '';
    const old = editId != null ? trees.find(x => x.id === editId) : null;
    const sp = spVal || $('tSpQ').value.trim(), rec = C.speciesRec(sp);
    const t = Object.assign({}, old || {}, {
      jobId: job.id, tag: $('tTag').value.trim(), point_no: +$('tPt').value || nextPoint(), species: rec ? rec[0] : sp, sci: rec && rec[1] !== '-' ? rec[1] : '',
      dbh_in: $('tDbh').value === '' ? '' : +$('tDbh').value, canopy_ft: $('tCan').value === '' ? '' : +$('tCan').value,
      condition: getSeg($('tCond')) || 'Good', protected: getSeg($('tProt')) || 'N', heritage: getSeg($('tHer')) || 'N', ph_type: $('tType').value.trim(),
      notes: $('tNotes').value.trim(), stems: $('tStems').value.trim(),
      wet: $('tWet').value, prev: $('tPrev').value, ms: $('tMs').value, champ: $('tChamp').value,
      can_pct: $('tCanPct').value === '' ? '' : +$('tCanPct').value, root_pct: $('tRootPct').value === '' ? '' : +$('tRootPct').value,
    });
    delete t.action;
    const sg = C.suggestStatus(t, job); t.sugg_protected = sg.protected; t.sugg_heritage = sg.heritage;
    const useFix = !old || getSeg($('tPos')) === 'new';
    if (useFix && !fix) { $('tErr').textContent = 'Capture a GPS position first (Capture button), or use manual lat/long.'; return; }
    if (useFix && tooPoor(fix)) {
      if (!$('tAccOk').checked || !$('tAccReason').value.trim()) { $('tErr').textContent = `Accuracy \u00b1${fix.acc_ft_mean.toFixed(0)} ft is above the ${limit()} ft limit: re-capture, or tick "Save anyway" and give a reason.`; $('accWarn').scrollIntoView({ block: 'center' }); return; }
      t.acc_reason = $('tAccReason').value.trim();
    } else if (useFix) delete t.acc_reason;
    if (useFix) Object.assign(t, { lat: fix.lat, lon: fix.lon, acc_ft: fix.manual ? null : fix.acc_ft_mean, n_readings: fix.n, spread_ft: fix.manual ? null : fix.spread_ft,
      alt_m: fix.alt_m, manual: !!fix.manual, pos_src: fix.manual ? 'manual' : 'gps', captured: new Date().toLocaleString() });
    t.crs = crs(); const ne = C.toNE(t.lat, t.lon, crs()); t.northing = ne.northing; t.easting = ne.easting;
    t.elev_ft = job.elev === 'gps' && t.alt_m != null ? t.alt_m * C.M_TO_USFT : 0;
    const errs = C.validateTree(t);
    if (trees.some(x => x.id !== t.id && String(x.tag) === t.tag)) errs.push('Tag # ' + t.tag + ' already used in this job');
    if (trees.some(x => x.id !== t.id && +x.point_no === +t.point_no)) errs.push('Point # already used');
    if (errs.length) { $('tErr').textContent = errs.join(' \u00b7 '); return; }
    const oldPhoto = old && photoChanged ? await S.getPhoto(old.id) : null;
    if (photoChanged && photoBlob) t.photo_name = 'Tag_' + t.tag.replace(/[^\w-]/g, '_') + '.jpg';
    if (!old) delete t.id;
    const id = await S.put(t); t.id = t.id || id;
    if (photoChanged && photoBlob) await S.putPhoto(t.id, photoBlob);
    pushRecent(t.species); persist();
    const snap = old ? Object.assign({}, old) : null;
    if (useFix) { fix = null; showFix(); $('gStat').textContent = ''; $('gProg').style.width = '0'; $('manBox').open = false; }
    job.updated = new Date().toISOString(); S.putJob(job);
    await loadTrees(); clearForm();
    toast((old ? 'Updated tag ' : 'Saved tag ') + t.tag + (t.acc_reason ? ' (flagged)' : ''), async () => {
      if (snap) { await S.put(snap); if (oldPhoto) await S.putPhoto(snap.id, oldPhoto.blob); else if (photoChanged) await S.delPhoto(snap.id); }
      else { await S.del(t.id); await S.delPhoto(t.id); }
      await loadTrees(); clearForm();
    });
  };
  $('tDel').onclick = async () => {
    const t = trees.find(x => x.id === editId); if (!t) return; const ph = await S.getPhoto(t.id);
    await S.del(t.id); await S.delPhoto(t.id); await loadTrees(); clearForm();
    toast('Deleted tag ' + t.tag, async () => { await S.put(t); if (ph) await S.putPhoto(t.id, ph.blob); await loadTrees(); clearForm(); });
  };

  async function loadTrees() {
    trees = (await S.treesFor(job.id)) || []; trees.sort((a, b) => a.point_no - b.point_no); allTrees = await S.all() || [];
    $('lCount').textContent = trees.length; if (document.body.dataset.tab === 'trees') renderList();
    document.body.dataset.trees = String(trees.length);
  }
  function renderList() {
    const q = $('lFilter').value.trim().toLowerCase();
    const list = trees.filter(t => !q || String(t.tag).toLowerCase().includes(q) || String(t.species).toLowerCase().includes(q));
    const s = C.summarize(trees, job);
    $('lSummary').innerHTML = `${s.n} trees \u00b7 <span class="flag p">P</span>${s.prot} protected \u00b7 <span class="flag h">H</span>${s.her} heritage (field calls) \u00b7 ${s.lowAcc} low-accuracy \u00b7 ${s.manual} manual`;
    $('lList').innerHTML = list.map(t => {
      const flag = C.isManual(t) ? 'man.' : (t.acc_ft != null ? '\u00b1' + (+t.acc_ft).toFixed(0) + ' ft' : '');
      const warn = C.isManual(t) || +t.acc_ft > limit();
      return `<button type="button" class="treeitem" data-id="${t.id}"><span class="tg">${esc(t.tag)}</span><span class="mid"><div><b>${esc(t.species)}</b> ${esc(t.dbh_in)} in</div>
        <div class="small">Pt ${t.point_no} \u00b7 ${esc(t.condition)}${t.photo_name ? ' \u00b7 photo' : ''}</div></span>
        <span>${t.protected === 'Y' ? '<span class="flag p">P</span>' : ''}${t.heritage === 'Y' ? '<span class="flag h">H</span>' : ''}${warn ? '<span class="flag w">!</span>' : ''}<div class="small">${flag}</div></span></button>`;
    }).join('') || '<div class="small">No trees yet. Go to Capture.</div>';
  }
  $('lFilter').addEventListener('input', renderList);
  $('lList').onclick = e => { const b = e.target.closest('[data-id]'); if (b) editTree(+b.dataset.id); };

  // ---------- accuracy check ----------
  $('kMode').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; setSeg($('kMode'), b.dataset.v); $('kNE').hidden = b.dataset.v !== 'ne'; $('kLL').hidden = b.dataset.v !== 'll'; };
  setSeg($('kMode'), 'ne');
  let kKnown = null;
  $('kCap').onclick = () => {
    if (gpsTarget === 'check') { stopGps('Stopped at ' + readings.length + ' of ' + gpsN + ' readings.'); return; }
    if (gpsTarget) { toast('Tree capture in progress'); return; }
    const mode = getSeg($('kMode'));
    if (mode === 'ne') { const n = parseFloat($('kN').value), e = parseFloat($('kE').value); if (!(isFinite(n) && isFinite(e))) { $('kStat').textContent = 'Enter the known northing and easting (ft, ' + C.CRS[crs()].label + ').'; return; } kKnown = { northing: n, easting: e }; }
    else { const la = parseFloat($('kLat').value), lo = parseFloat($('kLon').value); if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) { $('kStat').textContent = 'Enter the known latitude and longitude (decimal degrees).'; return; } kKnown = { lat: la, lon: lo }; }
    kFix = null; startGps('check', Math.max(1, +job.nRead || 10));
  };
  async function finishCheck() {
    if (!kFix || !kKnown) return;
    const o = C.offsetFt(kFix, kKnown, crs());
    const c = { jobId: job.id, name: $('kName').value.trim() || 'Known point ' + (checks.length + 1), crs: crs(), kN: o.known.northing, kE: o.known.easting,
      kLat: kKnown.lat, kLon: kKnown.lon, cN: o.captured.northing, cE: o.captured.easting, cLat: kFix.lat, cLon: kFix.lon, dN: o.dN, dE: o.dE, horiz: o.horiz,
      acc_ft: kFix.acc_ft_mean, n: kFix.n, spread_ft: kFix.spread_ft, source: $('kSrc').value.trim(), captured: new Date().toLocaleString() };
    c.id = await S.putCheck(c); checks = await S.checksFor(job.id);
    const v = C.checkVerdict(c);
    $('kResult').innerHTML = `<div class="${/^PASS/.test(v) ? 'okbox' : 'badbox'}"><b>${esc(v)}</b>: horizontal offset <b>${c.horiz.toFixed(1)} ft</b> (dN ${c.dN.toFixed(1)}, dE ${c.dE.toFixed(1)}); phone reported \u00b1${c.acc_ft.toFixed(0)} ft over ${c.n} readings.</div>`;
    document.body.dataset.check = c.horiz.toFixed(2); renderChecks();
  }
  function renderChecks() {
    $('kCount').textContent = checks.length; $('kCrsNote').textContent = 'Job CRS: ' + C.CRS[crs()].label;
    $('kList').innerHTML = checks.length ? '<table><thead><tr><th>Point</th><th>Offset ft</th><th>\u00b1ft</th><th>Result</th><th></th></tr></thead><tbody>' +
      checks.map(c => `<tr><td>${esc(c.name)}<div class="small">${esc(c.captured)}</div></td><td><b>${(+c.horiz).toFixed(1)}</b></td><td>${(+c.acc_ft).toFixed(0)}</td><td>${esc(C.checkVerdict(c))}</td><td><button class="danger" data-del="${c.id}" aria-label="Delete check">\u2715</button></td></tr>`).join('') + '</tbody></table>' : '<div class="small">No checks yet.</div>';
  }
  $('kList').onclick = async e => { const b = e.target.closest('[data-del]'); if (!b) return; const id = +b.dataset.del, c = checks.find(x => x.id === id);
    await S.delCheck(id); checks = await S.checksFor(job.id); renderChecks(); toast('Check deleted', async () => { await S.putCheck(c); checks = await S.checksFor(job.id); renderChecks(); }); };

  // ---------- export ----------
  const jurLabel = () => (C.JURISDICTIONS[job.jurisdiction] || {}).label + (job.jurisdiction === 'SR' ? ' - ' + C.SR_LOCS[job.srLoc || 'S'] : '');
  function projected() { return trees.map(t => { const ne = C.toNE(t.lat, t.lon, crs()); return Object.assign({}, t, { northing: ne.northing, easting: ne.easting, crs: crs() }); }); }
  function meta(file) { return { project: job.name, client: job.client, site: job.site, parcels: job.parcels, jurisdiction: jurLabel(), crs: C.CRS[crs()].label, crsSrc: C.CRS[crs()].src,
    elev: job.elev, exported: new Date().toLocaleString(), job, file }; }
  const base = () => (job.name || 'tree-inventory').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) + '_' + localDate();
  function renderExport() {
    const s = C.summarize(trees, job);
    $('xJob').innerHTML = `<b>${esc(job.name)}</b> \u00b7 ${esc(job.client || 'no client')} \u00b7 ${s.n} trees \u00b7 ${checks.length} accuracy checks \u00b7 ${esc(C.CRS[crs()].label)}`;
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** Share sheet on phones (Save to Files / Mail / AirDrop), download elsewhere or when sharing is not possible. */
  async function saveAll(items) {
    self.TSLastExport = items.map(([, n]) => n);
    const files = items.map(([b, n]) => new File([b], n, { type: b.type || 'application/octet-stream' }));
    const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (mobile && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: files.map(f => f.name).join(', ') }); $('xStat').textContent = 'Shared ' + files.length + ' file(s).'; await markExported(); return; }
      catch (e) {
        if (e.name === 'AbortError') { $('xStat').textContent = 'Share cancelled.'; return; }
        if (e.name === 'NotAllowedError') { // iOS: the tap expired while the file was being built; one more tap shares it
          pendingShare = files; $('xStat').innerHTML = 'Ready: <button id="xShareNow">Share ' + files.length + ' file(s)</button>'; $('xShareNow').onclick = sharePending; return; }
      }
    }
    for (const [b, n] of items) download(b, n);
    $('xStat').textContent = 'Downloaded: ' + items.map(([, n]) => n).join(', '); await markExported();
  }
  async function markExported() { job.exportedAt = new Date().toISOString(); await S.putJob(job); }
  async function sharePending() { const files = pendingShare; pendingShare = null; try { await navigator.share({ files }); $('xStat').textContent = 'Shared.'; await markExported(); } catch (e) { $('xStat').textContent = 'Share failed: ' + e.message; } }
  const need = () => { if (!trees.length) { toast('No trees in this job yet'); return false; } return true; };
  const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Working\u2026'; try { await fn(); } catch (e) { $('xStat').textContent = 'Export failed: ' + e.message; console.error(e); } finally { btn.disabled = false; btn.textContent = t; } };
  function pnezdItems() { const name = base() + '_PNEZD_' + C.VERSION_TAG + '.csv', P = projected();
    return [[new Blob([C.pnezdCSV(P)], { type: 'text/csv' }), name], [new Blob([C.pnezdNote(meta(name))], { type: 'text/plain' }), name.replace(/\.csv$/, '_NOTES.txt')]]; }
  const logItem = () => [new Blob([C.treeLogCSV(projected(), meta())], { type: 'text/csv' }), base() + '_tree_log.csv'];
  function xlsxItem() { const wb = C.buildWorkbook(XLSX, projected(), meta(), C.LISTS.species, checks); const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return [new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), base() + '_tree_log.xlsx']; }
  async function photoFiles() { const out = []; for (const t of trees) { if (!t.photo_name) continue; const p = await S.getPhoto(t.id); if (p && p.blob instanceof Blob) out.push({ name: t.photo_name, data: p.blob }); } return out; }
  const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  async function backupItem() {
    const photos = {}; for (const t of trees) if (t.photo_name) { const p = await S.getPhoto(t.id); if (p && p.blob instanceof Blob) photos[t.id] = await blobToDataURL(p.blob); }
    const j = Object.assign({}, job); delete j.parcelGeo;
    return [new Blob([JSON.stringify({ app: 'zt-tree-inventory', format: 2, version: C.VERSION, exported: new Date().toISOString(), job: j, parcelGeo: job.parcelGeo || null, trees: trees.map(dropLegacy), checks, photos })], { type: 'application/json' }), base() + '_job_backup.json'];
  }
  async function parcelsForReport() {
    if (job.parcelGeo && job.parcelGeo.features && job.parcelGeo.features.length) return job.parcelGeo;
    const src = TSParcels.sourceFor(job.jurisdiction);
    if (!src || !job.parcels || navigator.onLine === false) return null;
    try { const r = await TSParcels.query(src, job.parcels, 10000); if (!r.features.length) return null;
      job.parcelGeo = { features: r.features, retrieved: r.retrieved, source: r.j.copyright, idField: r.idField }; await S.putJob(job); return job.parcelGeo; }
    catch (e) { return null; }
  }
  async function reportItem() {
    $('xStat').textContent = 'Building report\u2026';
    const pg = await parcelsForReport();
    const doc = await TSReport.build({ job, jurisdictionLabel: jurLabel(), trees: projected(), checks, crs: crs(), parcels: pg ? pg.features : [], parcelInfo: pg, photos: await photoFiles() });
    return [doc.output('blob'), base() + '_Tree_Inventory_Report.pdf'];
  }
  async function exportAll() {
    if (!trees.length) { toast('No trees in this job yet'); return; }
    const items = [...pnezdItems(), logItem(), xlsxItem(), await backupItem(), await reportItem()];
    const files = items.map(([b, n]) => ({ name: n, data: b })).concat((await photoFiles()).map(p => ({ name: 'photos/' + p.name, data: p.data })));
    await saveAll([[await TSZip.zip(files), base() + '_all.zip']]);
  }
  /** Every export first offers the optional job-details sheet once per job (prefilled, skippable). */
  const gate = (id, needTrees, fn) => { $(id).onclick = async () => { if (needTrees && !need()) return; if (!(await ensureDetails())) return; busy($(id), fn); }; };
  gate('xReport', true, async () => saveAll([await reportItem()]));
  gate('xPnezd', true, () => saveAll(pnezdItems()));
  gate('xLog', true, () => saveAll([logItem()]));
  gate('xXlsx', true, () => saveAll([xlsxItem()]));
  gate('xPhotos', false, async () => { const ph = await photoFiles(); if (!ph.length) { toast('No photos in this job'); return; } await saveAll([[await TSZip.zip(ph), base() + '_photos.zip']]); });
  gate('xBackup', false, async () => saveAll([await backupItem()]));
  gate('xAll', true, exportAll);
  $('xFinish').onclick = async () => {
    await saveJob();
    const msg = job.exportedAt ? `Finish "${job.name}" and start a new job?\n\nIt moves to More \u203a Past jobs with all its trees and photos; you can reopen, export or delete it there.`
      : `Nothing has been exported from "${job.name}" yet.\n\nTap Cancel and export first (Everything .zip is the safest), or OK to finish anyway. It moves to More \u203a Past jobs with all its data.`;
    if (!confirm(msg)) return;
    const prev = job; prev.archived = true; prev.finished = new Date().toISOString(); await S.putJob(prev);
    const id = await newJob(carry(prev)); await openJob(id); await refreshJobs(); $('xStat').textContent = '';
    showTab('capture'); toast('Finished ' + prev.name + '. Started ' + job.name);
  };
  $('xSketch').onclick = () => { location.href = 'desktop.html?job=' + job.id + '&auto=1'; };

  // ---------- restore / clear ----------
  $('xRestore').onchange = async () => {
    const f = $('xRestore').files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'zt-tree-inventory' && d.app !== 'zt-tree-survey') throw new Error('Not a ' + C.PRODUCT_NAME + ' backup');
      const jb = d.job || { name: (d.settings && d.settings.project) || 'Restored job', parcels: d.settings && d.settings.parcels, crs: d.settings && d.settings.crs, start: d.settings && +d.settings.start };
      const nid = await newJob(Object.assign({}, jb, { name: (jb.name || 'Job') + ' (restored)', autoName: false, parcelGeo: d.parcelGeo || undefined, archived: true }));
      for (const t of d.trees || []) { const oldId = t.id; delete t.id; delete t.action; t.jobId = nid; const id = await S.put(t);
        if (d.photos && d.photos[oldId]) await S.putPhoto(id, await (await fetch(d.photos[oldId])).blob()); else await S.delPhoto(id); }
      for (const c of d.checks || []) { delete c.id; c.jobId = nid; await S.putCheck(c); }
      await refreshJobs(); renderMore(); toast('Restored ' + (d.trees || []).length + ' trees into Past jobs (Reopen to keep working on it)');
    } catch (e) { toast('Restore failed: ' + e.message); }
    $('xRestore').value = '';
  };
  $('xClear').onclick = async () => {
    if (!confirm('Delete ALL ' + jobs.length + ' jobs and ' + allTrees.length + ' trees on this device? Export backups first. This cannot be undone.')) return;
    await S.clear(); await init();
  };
  async function persist() {
    if (S.settings.get('persistAsked') || !navigator.storage || !navigator.storage.persist) return; S.settings.set('persistAsked', true);
    try { const ok = await navigator.storage.persist(); $('persistNote').textContent = ok ? 'Storage marked persistent.' : 'Browser may clear data if storage runs low: export backups.'; } catch (e) {}
  }

  // ---------- help ----------
  const R = self.TSReport || {};
  $('hAcc').textContent = C.ACCURACY_NOTE;
  $('hLegal').textContent = C.SERVICE_DESC + '. ' + C.DISCLAIMER;
  $('hLegalList').innerHTML = (R.LIMITATIONS || []).map(x => '<li>' + esc(x) + '</li>').join('');
  $('hSources').innerHTML = (R.SOURCES || []).map(([t, u]) => `<li>${esc(t)}${u ? ` <a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ''))}</a>` : ''}</li>`).join('');
  $('hAbout').innerHTML = `${esc(C.PRODUCT_NAME)} ${esc(C.VERSION_TAG)} (${esc(C.RELEASE_DATE)}). ${esc(C.AUTHOR)}. Works offline after the first load; data stays on this device until you export. Free libraries: proj4js, SheetJS, jsPDF, Leaflet.`;
  const hc = S.settings.get('hc'); $('hcMode').checked = !!hc; document.body.classList.toggle('hc', !!hc);
  $('hcMode').onchange = () => { S.settings.set('hc', $('hcMode').checked); document.body.classList.toggle('hc', $('hcMode').checked); };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $('installCard').hidden = !(ios && !standalone);

  // ---------- init + migration ----------
  // v0.x: trees without a job go into a migrated job. v1.0.0 (several open jobs): the most recently used becomes current, the rest go to Past jobs.
  async function init() {
    await refreshJobs();
    const orphans = allTrees.filter(t => t.jobId == null);
    if (orphans.length) {
      const st = k => S.settings.get(k);
      const id = await newJob({ name: (st('project') || 'Job') + ' (migrated)', autoName: false, parcels: st('parcels') || '', crs: C.CRS[st('crs')] ? st('crs') : C.DEFAULT_CRS, start: +st('start') || 1000, elev: st('elev') || 'zero' });
      for (const t of orphans) { t.jobId = id; await S.put(t); }
      S.settings.set('jobId', id); await refreshJobs();
    }
    const recent = j => String(j.lastOpened || j.updated || j.created || '');
    const open = jobs.filter(j => !j.archived), saved = S.settings.get('jobId');
    let cur = open.find(j => j.id === saved) || open.slice().sort((a, b) => recent(b).localeCompare(recent(a)))[0];
    for (const j of open) if (cur && j.id !== cur.id) { j.archived = true; await S.putJob(j); }
    let id = cur && cur.id;
    if (id == null) { const last = jobs.slice().sort((a, b) => recent(b).localeCompare(recent(a)))[0]; id = await newJob(carry(last)); }
    await openJob(id); await refreshJobs(); showFix(); showTab('capture'); document.body.dataset.ready = '1';
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  init();
  self.TSField = { getTrees: () => trees, getJob: () => job, getChecks: () => checks, openJob, showTab, init, refreshJobs };
})();
