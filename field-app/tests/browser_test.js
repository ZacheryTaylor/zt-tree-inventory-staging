// v1.0.1 headless Chrome test (single current-job model). Field app at iPhone size (390x844, iPhone UA, simulated jittered GPS), jobs, capture, suggestions,
// accuracy warning, undo, edit position toggle, permission denied, accuracy check, every export incl. the report PDF, restore,
// offline reload/capture/report, banned-wording scan; then the sketch page at 390x844 (job deep link, letter + 11x17) and at desktop size
// (live parcels for Pensacola/Escambia/Santa Rosa/Okaloosa, JSON import, PNEZD inverse). Exits 1 on any failed check or page error.
// Run: python3 -m http.server 8777 --bind 127.0.0.1 (in app dir); TS_PORT=8777 NODE_PATH=<dir with puppeteer-core> node tests/browser_test.js
const puppeteer = require('puppeteer-core'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const XLSX = require('../vendor/xlsx.full.min.js'), C = require('../lib/core.js');
const BASE = 'http://127.0.0.1:' + (process.env.TS_PORT || 8777) + '/', APP = path.join(__dirname, '..'), OUT = path.join(APP, 'screenshots'), SAMPLE = path.join(APP, 'sample');
const R = { run: new Date().toString(), version: C.VERSION, checks: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(name, ok, detail) { R.checks.push({ name, pass: !!ok, detail }); if (!ok) { failed++; console.error('FAIL:', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)); } else console.log('ok  ', name); }
const FAKE_GPS = () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const watchers = new Map(); let id = 0;
  const geo = {
    watchPosition(ok, err) { const w = ++id;
      if (window.__deny) { setTimeout(() => err && err({ code: 1, message: 'User denied Geolocation' }), 50); return w; }
      watchers.set(w, setInterval(() => { const g = window.__gps; if (!g) return;
        ok({ coords: { latitude: g.lat + rnd() * (g.j || 4e-5), longitude: g.lon + rnd() * (g.j || 4e-5), accuracy: g.acc_m * (0.8 + 0.4 * (rnd() + 0.5)), altitude: 30 + rnd() * 10 }, timestamp: Date.now() + Math.random() }); }, 120)); return w; },
    clearWatch(w) { clearInterval(watchers.get(w)); watchers.delete(w); },
    getCurrentPosition(ok, err) { const w = geo.watchPosition(p => { geo.clearWatch(w); ok(p); }, err); },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
};
// Banned wording: survey / engineering / arborist / LA / risk claims, unless in an allowed negation or credit context.
const ALLOWED = [/not a survey/i, /not survey (grade|data|quality)/i, /licensed surveyor/i, /surveyor or engineer/i, /engineering or surveying advice/i, /Engineer Intern/i, /not engineering work/i,
  /ISA Certified Arborist/i, /licensed professional engineer, surveyor, landscape architect or arborist/i, /not .*landscape architecture/i, /licensed landscape architect/i, /arborist report/i,
  /No tree risk or hazard assessment was performed/i, /risk determinations require/i, /tree-risk documentation/i, /tree risk documentation/i, /not your risk call/i, /surveying advice/i, /Tree Risk Assessment/i, /US survey f(ee)?t/i, /survey monument/i, /recorded survey/i];
function bannedScan(label, text) {
  const hits = [];
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.;:!?])\s+|\u2022/);
  for (const s of sentences) {
    if (/tree survey|tree protection plan|arborist assessment|surveying services|engineering services|\bsurvey report\b/i.test(s)) hits.push(s);
    else if (/\b(surveyor|engineer|arborist|landscape architect(ure)?|risk assessment|hazard assessment|survey)\b/i.test(s) && !ALLOWED.some(a => a.test(s))) hits.push(s);
  }
  check('banned-wording scan: ' + label, hits.length === 0, hits.slice(0, 5));
}
const pdfText = f => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const pdfInfo = f => execFileSync('pdfinfo', [f]).toString();

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = [], cerrs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', async m => { if (m.type() === 'error') cerrs.push(m.text() + ' ' + (await Promise.all(m.args().map(a => a.evaluate(x => x && x.stack ? x.stack : String(x)).catch(() => '')))).join(' ').slice(0, 400)); }); const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 TSTest');
  await p.evaluateOnNewDocument(FAKE_GPS);
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdl-'));
  const cdp = await p.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle0' });
  await p.evaluate(() => { localStorage.clear(); return TSStore.clear(); }); await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  const tab = async n => { await p.click(`nav.tabs button[data-tab=${n}]`); await sleep(150); };
  const shot = async (n, full) => p.screenshot({ path: path.join(OUT, n), fullPage: !!full });
  const val = sel => p.$eval(sel, e => e.value), txt = sel => p.$eval(sel, e => e.textContent);
  const setVal = (sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, String(v));

  // ---------- basics ----------
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
  check('product name consistent (core, manifest, title, header)', manifest.name === C.PRODUCT_NAME && (await p.title()).startsWith(C.PRODUCT_NAME) && (await txt('#appName')) === C.PRODUCT_NAME &&
    (await p.$eval('meta[name=apple-mobile-web-app-title]', e => e.content)) === C.PRODUCT_NAME, { manifest: manifest.name, core: C.PRODUCT_NAME });
  const foot = await txt('#foot'), banner = await txt('#accBanner');
  check('footer: disclaimer + arborist note + exact branding + ' + C.VERSION_TAG, foot.includes(C.DISCLAIMER) && foot.includes('Zach Taylor, EI (Engineer Intern), ZT, LLC') && foot.includes('ISA Certified Arborist') && foot.includes(C.VERSION_TAG), foot);
  check('banner: Not a survey label', banner.includes('Locations approximate, for field reference only. Not a survey.'), banner);
  check('first job created, default CRS EPSG:2238', (await p.evaluate(() => TSField.getJob().crs)) === 'EPSG:2238');
  const today = await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  const tabsList = await p.$$eval('nav.tabs [data-tab]', b => b.map(x => x.dataset.tab));
  check('no Job tab; tabs are Capture/Trees/Check/Export/More', JSON.stringify(tabsList) === JSON.stringify(['capture', 'trees', 'check', 'export', 'more']) && !(await p.$('#tab-job')), tabsList);
  check('opens straight on Capture with an auto-named current job, no prompt', await p.$eval('#tab-capture', e => !e.hidden) && await p.$eval('#jobSheet', e => e.hidden) &&
    (await txt('#jobChip')) === 'Job ' + today, await txt('#jobChip'));
  check('tag 1 prefilled', (await val('#tTag')) === '1');
  check('bottom bar visible on Capture', await p.$eval('#bar', e => !e.hidden && getComputedStyle(e).position === 'fixed'));
  const small = await p.evaluate(() => [...document.querySelectorAll('#tab-capture button, #bar button, nav.tabs button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.id || b.textContent));
  check('no Proposed action field in the capture form', !(await p.$('#tAct')) && !/Proposed action/i.test(await p.evaluate(() => document.body.innerText)));
  check('touch targets >= 44 px on Capture', small.length === 0, small);

  // ---------- job details from the header chip (all optional) ----------
  await p.click('#jobChip'); await sleep(200);
  check('job chip opens the details sheet (edit mode, no Skip)', await p.$eval('#jobSheet', e => !e.hidden) && await p.$eval('#jSkip', e => e.hidden) && (await txt('#jDone')) === 'Done');
  await p.select('#jJur', 'ESC'); await sleep(100);
  check('auto name adds jurisdiction', (await txt('#jobChip')) === 'Job ' + today + ' Escambia', await txt('#jobChip'));
  await setVal('#jParcels', '03-1S-31-1500-001-003'); await sleep(100);
  check('auto name prefers first parcel ID', (await txt('#jobChip')) === 'Job ' + today + ' 03-1S-31-1500-001-003', await txt('#jobChip'));
  await p.evaluate(() => document.querySelectorAll('#jobCard details')[0].open = true);
  await setVal('#jNRead', 6); await setVal('#jWait', 20); await sleep(200);
  await shot('field_job_sheet_iphone.png');
  await p.click('#jDone'); await sleep(500);
  const job1Id = await p.evaluate(() => TSField.getJob().id);
  const j1a = await p.evaluate(() => TSStore.getJob(TSField.getJob().id));
  check('sheet Done closes and saves (ESC, 6 readings, client still blank)', await p.$eval('#jobSheet', e => e.hidden) && j1a.jurisdiction === 'ESC' && j1a.nRead === 6 && !j1a.client, j1a);

  // ---------- capture 5 trees ----------
  await tab('capture');
  const trees = [[30.54534953, -87.33307668, '101', 'Southern live oak', 32, 30], [30.5454004, -87.33322968, null, 'Longleaf pine', 14, 12],
    [30.5454543, -87.3333880, null, 'Laurel oak', null, 22], [30.5455082, -87.3335464, null, 'Southern magnolia', 11, 10], [30.5455591, -87.3336960, null, 'Sweet bay', 8, 8]];
  const capture = async (lat, lon, acc) => { await p.evaluate((lat, lon, acc) => { window.__gps = { lat, lon, acc_m: acc }; }, lat, lon, acc); await p.click('#gAvg');
    await p.waitForFunction(() => /Capture/.test(document.getElementById('gAvg').textContent), { timeout: 30000 }); };
  for (const [i, t] of trees.entries()) {
    if (i === 3) {
      await p.evaluate(() => document.getElementById('manBox').open = true);
      await setVal('#mLat', t[0]); await setVal('#mLon', t[1]); await p.click('#mUse');
      check('manual fix shows "manual" accuracy', (await txt('#barAcc')) === 'manual');
    } else {
      await capture(t[0], t[1], 4 + i);
      const n = +(await txt('#gCount')); check(`tree ${i + 1}: averaged 6 readings`, n === 6, [n, await txt('#gStat')]);
      if (i === 0) check('live accuracy readout in bar', /^\u00b1\d+ ft$/.test(await txt('#barAcc')), await txt('#barAcc'));
    }
    if (t[2]) await setVal('#tTag', t[2]); else check(`tag auto-increment -> ${101 + i}`, (await val('#tTag')) === String(101 + i), await val('#tTag'));
    await p.click('#tSpQ', { clickCount: 3 }); await p.type('#tSpQ', i === 4 ? 'Sweet bay' : t[3].split(' ').slice(-2).join(' ').toLowerCase());
    if (i === 4) { await p.click('#spList button:last-child'); check('unlisted species warning', /Not in the calculator list/.test(await txt('#spPicked')), await txt('#spPicked')); }
    else await p.click(`#spList button[data-sp="${t[3]}"]`);
    if (t[4] != null) await setVal('#tDbh', t[4]);
    await setVal('#tCan', t[5]);
    if (i === 2) { await p.evaluate(() => document.getElementById('stemBox').open = true); await setVal('#tStems', '18, 13.5'); await p.$eval('#tStemUse', e => e.click());
      check('multi-trunk combined DBH = 22.5', (await val('#tDbh')) === '22.5', await val('#tDbh')); }
    if (i === 0) {
      check('suggestion: ESC live oak 32 in -> protected Y (auto-set)', (await p.$eval('#tProt', e => e.dataset.val)) === 'Y' && /Suggested, field judgement/.test(await txt('#tSugg')), await txt('#tSugg'));
      await p.click('#tHer [data-v=Y]'); check('manual heritage override marked', /you changed this/.test(await txt('#tSugg')));
      await p.evaluate(() => document.getElementById('moreBox').open = true);
      await p.select('#tWet', 'N'); await p.select('#tPrev', 'N'); await p.select('#tMs', 'N'); await p.select('#tChamp', 'N');
      await setVal('#tCanPct', 10); await setVal('#tRootPct', 20); await setVal('#tNotes', 'FAKE sample tree');
      const up = await p.$('#tPhoto'); await up.uploadFile(path.join(APP, 'icons', 'icon-512.png')); await p.waitForFunction(() => !document.getElementById('tThumb').hidden, { timeout: 10000 });
      await p.evaluate(() => document.getElementById('treeCard').scrollIntoView()); await shot('field_capture_form_iphone.png');
    }
    if (i === 1) check('suggestion: ESC longleaf pine exempt -> N', (await p.$eval('#tProt', e => e.dataset.val)) === 'N' && /Exempt species/.test(await txt('#tSugg')), await txt('#tSugg'));
    if (i === 3) { await p.$eval('#tCond [data-v="Fair"]', e => e.scrollIntoView({ block: 'center' })); await p.click('#tCond [data-v="Fair"]'); } // keep the chip clear of the fixed bottom bar
    if (i === 4) { await p.$eval('#tProt [data-v=N]', e => e.scrollIntoView({ block: 'center' })); await p.click('#tProt [data-v=N]'); }
    await p.$eval('#toastMsg', e => e.textContent = ''); await p.click('#tSave'); await sleep(400);
    const tm = await txt('#toastMsg'); check(`tree ${i + 1} saved (toast with Undo)`, /Saved tag/.test(tm) && !(await p.$eval('#toastUndo', e => e.hidden)), [tm, await txt('#tErr')]);
  }
  await p.evaluate(() => scrollTo(0, 0)); await shot('field_capture_top_iphone.png');
  let ft = await p.evaluate(() => TSField.getTrees());
  check('5 trees saved', ft.length === 5, ft.length);
  check('GPS trees store n_readings = 6, manual = accuracy null', ft.filter(t => t.pos_src === 'gps').every(t => t.n_readings === 6) && ft.find(t => t.pos_src === 'manual').acc_ft === null);
  check('averaged positions within 10 ft of truth', ft.filter(t => t.pos_src === 'gps').every(t => { const k = trees.find(x => x[3] === t.species || (x[3] === 'Sweet bay' && t.species === 'Sweet bay')); return Math.hypot((t.lat - k[0]) * 364000, (t.lon - k[1]) * 314000) < 10; }));
  check('mitigation + photo saved on tag 101', ft[0].wet === 'N' && ft[0].can_pct === 10 && ft[0].photo_name === 'Tag_101.jpg' && ft[0].heritage === 'Y');

  // ---------- duplicate tag, hard accuracy warning ----------
  await capture(30.5453, -87.3332, 5);
  await setVal('#tTag', '101'); check('duplicate-tag warning shown', /already used/.test(await txt('#tTagWarn')));
  await p.click('#tSpQ', { clickCount: 3 }); await p.type('#tSpQ', 'water oak'); await p.click('#spList button[data-sp="Water oak"]'); await setVal('#tDbh', 12);
  await p.click('#tSave'); await sleep(200);
  check('duplicate tag blocks save', /already used/.test(await txt('#tErr')) && (await p.evaluate(() => TSField.getTrees().length)) === 5, await txt('#tErr'));
  await setVal('#tTag', '106');
  await capture(30.5453, -87.3332, 15); // ~49 ft reported
  check('hard accuracy warning visible above 30 ft', await p.$eval('#accWarn', e => !e.hidden) && /worse than this job's 30 ft limit/.test(await txt('#accWarnTxt')), await txt('#accWarnTxt'));
  await p.click('#tSave'); await sleep(200);
  check('poor accuracy blocks save without reason', /above the 30 ft limit/.test(await txt('#tErr')) && (await p.evaluate(() => TSField.getTrees().length)) === 5);
  await p.evaluate(() => document.getElementById('accWarn').scrollIntoView({ block: 'center' })); await shot('field_accuracy_warning_iphone.png');
  await setVal('#tAccReason', 'dense canopy, re-shoot later'); await p.click('#tAccOk'); await p.click('#tSave'); await sleep(400);
  ft = await p.evaluate(() => TSField.getTrees());
  check('save anyway with reason flags tree', ft.length === 6 && ft[5].acc_reason === 'dense canopy, re-shoot later', ft[5] && ft[5].acc_reason);
  // undo of a save
  await p.click('#toastUndo'); await sleep(400);
  check('undo removes the just-saved tree', (await p.evaluate(() => TSField.getTrees().length)) === 5);
  await capture(30.5453, -87.3332, 15); await setVal('#tTag', '106'); await p.click('#tSpQ', { clickCount: 3 }); await p.type('#tSpQ', 'water oak'); await p.click('#spList button[data-sp="Water oak"]'); await setVal('#tDbh', 12);
  await setVal('#tAccReason', 'dense canopy, re-shoot later'); await p.click('#tAccOk'); await p.click('#tSave'); await sleep(400);

  // ---------- legacy data: a v1.0.0 record that still carries "Proposed action" loads and is ignored ----------
  const t102 = ft.find(t => t.tag === '102');
  await p.evaluate(async id => { const t = await TSStore.get(id); t.action = 'Remove'; await TSStore.put(t); await TSField.openJob(TSField.getJob().id); }, t102.id);
  check('legacy tree with action loads (6 trees, no page errors)', (await p.evaluate(() => TSField.getTrees().length)) === 6 && errs.length === 0, errs);
  // ---------- Trees tab, edit with explicit position toggle, delete + undo ----------
  await tab('trees'); await shot('field_trees_iphone.png');
  check('Trees list does not show the legacy action', !/\bRemove\b|Preserve/.test(await txt('#lList')), await txt('#lList'));
  check('Trees list shows 6 with flags', (await p.$$('#lList .treeitem')).length === 6 && (await p.$$('#lList .flag.w')).length === 2);
  await p.click(`#lList [data-id="${t102.id}"]`); await sleep(300);
  check('edit opens on Capture with Keep/Use-new toggle (keep default)', (await p.$eval('#posBox', e => !e.hidden)) && (await p.$eval('#tPos', e => e.dataset.val)) === 'keep');
  const titleTop = await p.$eval('#formTitle', e => e.getBoundingClientRect().top), hdrBottom = await p.$eval('nav.tabs', e => e.getBoundingClientRect().bottom);
  check('edit title scrolled below sticky header', titleTop >= hdrBottom - 2, { titleTop, hdrBottom });
  await capture(30.5460, -87.3340, 4); // new fix available, but Keep is selected
  await setVal('#tDbh', 15); await p.click('#tSave'); await sleep(400);
  let e102 = await p.evaluate(id => TSField.getTrees().find(t => t.id === id), t102.id);
  check('edit with Keep keeps position, updates DBH', e102.dbh_in === 15 && e102.lat === t102.lat, { dbh: e102.dbh_in });
  check('saving a legacy tree drops the old action value', !('action' in e102), e102.action);
  await p.click('#toastUndo'); await sleep(400);
  e102 = await p.evaluate(id => TSField.getTrees().find(t => t.id === id), t102.id);
  check('undo of edit restores DBH 14', e102.dbh_in === 14, e102.dbh_in);
  await tab('trees'); await p.click(`#lList [data-id="${t102.id}"]`); await sleep(200); await p.click('#tPos [data-v=new]'); await p.click('#tSave'); await sleep(400);
  e102 = await p.evaluate(id => TSField.getTrees().find(t => t.id === id), t102.id);
  check('edit with "Use new GPS fix" moves the tree', Math.abs(e102.lat - 30.5460) < 0.0002, e102.lat);
  await p.click('#toastUndo'); await sleep(300);
  await tab('trees'); await p.click(`#lList [data-id="${t102.id}"]`); await sleep(200); await p.click('#tDel'); await sleep(300);
  check('delete removes tree', (await p.evaluate(() => TSField.getTrees().length)) === 5);
  await p.click('#toastUndo'); await sleep(400);
  check('undo restores deleted tree (same id, position)', await p.evaluate((id, lat) => { const t = TSField.getTrees().find(x => x.id === id); return !!t && t.lat === lat; }, t102.id, t102.lat));

  // ---------- permission denied ----------
  await tab('capture'); await p.evaluate(() => { window.__deny = true; }); await p.click('#gAvg'); await sleep(300);
  check('permission denied card shown', await p.$eval('#permCard', e => !e.hidden) && /Settings/.test(await txt('#permCard')));
  await p.evaluate(() => { window.__deny = false; document.getElementById('gpsCard').scrollIntoView(); }); await shot('field_permission_denied_iphone.png');

  // ---------- accuracy check ----------
  await tab('check');
  await setVal('#kName', 'NE corner iron rod (FAKE)'); await p.click('#kMode [data-v=ll]'); await setVal('#kLat', '30.5450'); await setVal('#kLon', '-87.3330'); await setVal('#kSrc', 'test fixture');
  await p.evaluate(() => { window.__gps = { lat: 30.5450 + 0.00005, lon: -87.3330, acc_m: 5, j: 1e-6 }; });
  await p.click('#kCap'); await p.waitForFunction(() => document.body.dataset.check, { timeout: 30000 });
  const off1 = +(await p.evaluate(() => document.body.dataset.check));
  check('accuracy check (lat/lon): ~18.2 ft offset, PASS', Math.abs(off1 - 18.2) < 1 && /PASS/.test(await txt('#kResult')), { off1, r: await txt('#kResult') });
  const kne = C.toNE(30.5452, -87.3333, 'EPSG:2238');
  await p.click('#kMode [data-v=ne]'); await setVal('#kName', 'Monument (FAKE)'); await setVal('#kN', kne.northing.toFixed(3)); await setVal('#kE', kne.easting.toFixed(3));
  await p.evaluate(() => { delete document.body.dataset.check; window.__gps = { lat: 30.5452 + 0.0001, lon: -87.3333 + 0.0001, acc_m: 6, j: 1e-6 }; });
  await p.click('#kCap'); await p.waitForFunction(() => document.body.dataset.check, { timeout: 30000 });
  const off2 = +(await p.evaluate(() => document.body.dataset.check)), exp2 = (() => { const a = C.toNE(30.5453, -87.3332, 'EPSG:2238'); return Math.hypot(a.northing - kne.northing, a.easting - kne.easting); })();
  check('accuracy check (N/E): offset matches proj4 within 0.5 ft and FAILs > 30 ft', Math.abs(off2 - exp2) < 0.5 && /FAIL/.test(await txt('#kResult')), { off2, exp2 });
  check('checks listed', (await txt('#kCount')) === '2');
  await shot('field_check_iphone.png');

  // ---------- exports ----------
  await tab('export'); await shot('field_export_iphone.png');
  const before = new Set(fs.readdirSync(dl));
  const waitFile = async (re, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const f = fs.readdirSync(dl).find(x => re.test(x) && !/crdownload$/.test(x)); if (f) { await sleep(300); return f; } await sleep(250); } return null; };
  // first export: the optional details sheet appears once, prefilled
  await p.click('#xReport'); await sleep(300);
  check('first export offers the details sheet once (prefilled, skippable)', await p.$eval('#jobSheet', e => !e.hidden) && await p.$eval('#jSkip', e => !e.hidden) &&
    (await val('#jParcels')) === '03-1S-31-1500-001-003' && /optional/i.test(await txt('#jobSheetTitle')), await txt('#jobSheetTitle'));
  await setVal('#jName', 'SAMPLE - Bristol Park (fake trees)'); await setVal('#jClient', 'Sample Engineering Co. (fake)'); await setVal('#jSite', '123 Sample St, Pensacola FL (fake)');
  await setVal('#jCrew', 'ZT'); await setVal('#jNotes', 'Home test-run style sample'); await sleep(200);
  await shot('field_export_prompt_iphone.png');
  await p.click('#jDone'); const rp = await waitFile(/_Tree_Inventory_Report\.pdf$/, 60000);
  const job1 = await p.evaluate(() => TSField.getJob());
  check('details saved from the export sheet; report continued', !!rp && job1.name.startsWith('SAMPLE') && job1.autoName === false && job1.client.includes('Sample') && job1.detailsAsked === true, job1.name);
  check('job chip shows job name', (await txt('#jobChip')).startsWith('SAMPLE'));
  let sheetAgain = false;
  for (const b of ['#xPnezd', '#xLog', '#xXlsx', '#xPhotos', '#xBackup']) { await p.click(b); await sleep(900); sheetAgain = sheetAgain || await p.$eval('#jobSheet', e => !e.hidden); }
  check('details sheet not shown again for later exports', !sheetAgain);
  await p.click('#xAll'); const all = await waitFile(/_all\.zip$/, 60000); await sleep(1000);
  const files = fs.readdirSync(dl); R.downloads = files;
  const f = re => files.find(x => re.test(x));
  const pn = f(/_PNEZD_v1\.0\.1\.csv$/), pnN = f(/_PNEZD_v1\.0\.1_NOTES\.txt$/), xl = f(/_tree_log\.xlsx$/), lg = f(/_tree_log\.csv$/), ph = f(/_photos\.zip$/), bk = f(/_job_backup\.json$/);
  check('all exports downloaded (report, PNEZD+NOTES, log csv/xlsx, photos zip, backup, all zip)', rp && pn && pnN && xl && lg && ph && bk && all, files);
  if (pn) { const rows = fs.readFileSync(path.join(dl, pn), 'utf8').trim().split(/\r?\n/); check('PNEZD 6 rows x 5 cols, no header', rows.length === 6 && rows.every(r => r.split(',').length === 5) && /^\d+$/.test(rows[0].split(',')[0]), rows); }
  if (pnN) { const t = fs.readFileSync(path.join(dl, pnN), 'utf8'); check('PNEZD notes: product, client, disclaimer, branding', t.includes(C.PRODUCT_NAME) && t.includes('Sample Engineering') && t.includes(C.DISCLAIMER)); }
  if (lg) { const t = fs.readFileSync(path.join(dl, lg), 'utf8'); check('tree log has no Proposed action column/value', !/Proposed action|,Remove,|,Preserve,/.test(t)); check('tree log: manual label + accuracy flag + suggestion columns', /Manual lat\/long entry \(accuracy unknown\)/.test(t) && /Reported accuracy worse than 30 ft \(dense canopy/.test(t) && /Suggested protected/.test(t)); }
  if (xl) { const wb = XLSX.read(fs.readFileSync(path.join(dl, xl))); check('XLSX sheets incl. Accuracy checks', JSON.stringify(wb.SheetNames) === JSON.stringify(['Tree Log', 'Calculator paste', 'PNEZD', 'About', 'Accuracy checks']), wb.SheetNames);
    const cp = XLSX.utils.sheet_to_json(wb.Sheets['Calculator paste'], { header: 1 }); check('calc paste keeps blank Proposed action column + note', cp[1][5] === 'Proposed action' && cp.slice(2).every(r => r[5] == null || r[5] === '') && /Proposed action.*column-for-column/.test(cp[0][0]), cp[0][0]);
    check('Tree Log sheet has no Proposed action', !XLSX.utils.sheet_to_csv(wb.Sheets['Tree Log']).includes('Proposed action'));
    check('calc paste row 1 G-L filled', JSON.stringify(cp[2].slice(6, 12)) === JSON.stringify(['N', 'N', 'N', 'N', 10, 20]), cp[2]); }
  for (const z of [ph, all].filter(Boolean)) {
    const out = execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("\\n".join(z.namelist()))', path.join(dl, z)]).toString().trim().split('\n');
    check('zip valid: ' + z.replace(/^.*?_(photos|all)/, '$1'), out[0] === 'None' && (z === ph ? out.includes('Tag_101.jpg') : out.some(n => /Report\.pdf$/.test(n)) && out.includes('photos/Tag_101.jpg')), out);
  }
  if (bk) { const j = JSON.parse(fs.readFileSync(path.join(dl, bk), 'utf8')); check('backup: job + 6 trees + 2 checks + photo, no action field', !j.trees.some(t => 'action' in t) && j.app === 'zt-tree-inventory' && j.trees.length === 6 && j.checks.length === 2 && Object.keys(j.photos).length === 1); }
  let reportText = '';
  if (rp) {
    fs.copyFileSync(path.join(dl, rp), path.join(SAMPLE, 'sample_Tree_Inventory_Report.pdf'));
    reportText = pdfText(path.join(SAMPLE, 'sample_Tree_Inventory_Report.pdf')); const info = pdfInfo(path.join(SAMPLE, 'sample_Tree_Inventory_Report.pdf'));
    R.report = { file: 'sample/sample_Tree_Inventory_Report.pdf', pages: +(info.match(/Pages:\s+(\d+)/) || [])[1], bytes: fs.statSync(path.join(SAMPLE, 'sample_Tree_Inventory_Report.pdf')).size };
    const flat = reportText.replace(/\s+/g, ' ');
    const must = ['Tree Inventory Report', C.PRODUCT_NAME, 'Zach Taylor, EI (Engineer Intern), ZT, LLC', 'Not a survey', 'Tool, not engineering or surveying advice', 'ISA Certified Arborist', 'gps.gov/gps-accuracy',
      'Escambia County IMAGiNE GIS', 'Protected-tree count & mitigation worksheet', 'Tree table', 'Field accuracy checks', 'Data sources', 'Limitations', 'Sample Engineering Co.', 'NE corner iron rod', 'dense canopy'];
    const miss = must.filter(m => !flat.includes(m));
    check('report PDF contains cover/summary/table/accuracy/sources/limitations', miss.length === 0 && R.report.pages >= 6, { miss, pages: R.report.pages });
    bannedScan('report PDF', flat);
    check('report has no Proposed action / Action column', !/Proposed action|\bAction\b|\bRemove\b|\bPreserve\b/.test(flat), (flat.match(/.{40}(Action|Remove|Preserve).{40}/) || [])[0]);
    execFileSync('pdftoppm', ['-png', '-r', '60', path.join(SAMPLE, 'sample_Tree_Inventory_Report.pdf'), path.join(OUT, 'report_page')]);
  }
  // banned wording on every screen
  for (const n of ['capture', 'trees', 'check', 'export', 'more']) { await tab(n); bannedScan('screen ' + n, await p.evaluate(() => document.body.innerText)); }
  await tab('more'); await shot('field_more_iphone.png', true);
  check('More has accuracy, legal limits, sources, version', /GPS\.gov/i.test(await txt('#tab-more')) && /ISA Certified Arborist/.test(await txt('#tab-more')) && /flsenate|IMAGiNE/.test(await txt('#hSources')) && (await txt('#hAbout')).includes(C.VERSION_TAG));

  // ---------- finish job & start new / past jobs / restore ----------
  check('job marked exported', !!(await p.evaluate(() => TSField.getJob().exportedAt)));
  await tab('export'); dialogs.length = 0; await p.click('#xFinish'); await sleep(800);
  const job2 = await p.evaluate(() => TSField.getJob());
  check('finish (after export): confirm without export reminder', dialogs.length === 1 && /Finish "SAMPLE/.test(dialogs[0]) && !/Nothing has been exported/.test(dialogs[0]), dialogs);
  check('finish starts a fresh current job on Capture (empty, tag 1, carries ESC)', job2.id !== job1Id && (await p.evaluate(() => TSField.getTrees().length)) === 0 && (await val('#tTag')) === '1' &&
    job2.name === 'Job ' + today + ' Escambia' && job2.jurisdiction === 'ESC' && !job2.client && await p.$eval('#tab-capture', e => !e.hidden), job2.name);
  await tab('more');
  check('finished job listed under Past jobs', (await txt('#pjCount')) === '1' && !!(await p.$(`#pastJobs [data-id="${job1Id}"]`)));
  // finish an un-exported job: reminder
  await tab('export'); dialogs.length = 0; await p.click('#xFinish'); await sleep(800);
  const job3 = await p.evaluate(() => TSField.getJob());
  check('finish without any export reminds to export first', /Nothing has been exported/.test(dialogs[0] || ''), dialogs);
  await tab('more');
  check('Past jobs now 2', (await txt('#pjCount')) === '2' && /not exported/.test(await txt('#pastJobs')));
  // reopen job 1: the blank current job is dropped, not archived
  await p.click(`#pastJobs [data-id="${job1Id}"] [data-a=open]`); await sleep(800);
  const st = await p.evaluate(async () => ({ cur: TSField.getJob().id, n: TSField.getTrees().length, jobs: await TSStore.jobs() }));
  check('reopen past job: becomes current with 6 trees; blank job removed; other job stays past', st.cur === job1Id && st.n === 6 && !st.jobs.some(j => j.id === job3.id) &&
    st.jobs.filter(j => !j.archived).length === 1 && st.jobs.find(j => j.id === job2.id).archived === true, st.jobs.map(j => [j.id, j.name, j.archived]));
  await tab('more');
  await p.click(`#pastJobs [data-id="${job2.id}"] [data-a=del]`); await p.waitForFunction(id => !document.querySelector(`#pastJobs [data-id="${id}"]`), { timeout: 5000 }, job2.id).catch(() => {});
  check('delete past job', !(await p.$(`#pastJobs [data-id="${job2.id}"]`)) && !(await p.evaluate(async id => (await TSStore.jobs()).some(j => j.id === id), job2.id)), { dialogs: dialogs.slice(-2), html: (await p.$eval('#pastJobs', e => e.innerHTML)).slice(0, 300) });
  const rs = await p.$('#xRestore'); await rs.uploadFile(path.join(SAMPLE, 'sample_job_backup.json')); await sleep(1500);
  const rst = await p.evaluate(async () => { const js = await TSStore.jobs(); const r = js.find(j => /restored/.test(j.name)); return { cur: TSField.getJob().id, n: TSField.getTrees().length, r, rn: r ? (await TSStore.treesFor(r.id)).length : 0 }; });
  check('restore goes into Past jobs (5 trees, cached parcel); current job unchanged', rst.cur === job1Id && rst.n === 6 && rst.r && rst.r.archived && rst.rn === 5 && !!rst.r.parcelGeo, rst.r && rst.r.name);
  await tab('more');
  const pre = new Set(fs.readdirSync(dl));
  await p.click(`#pastJobs [data-id="${rst.r.id}"] [data-a=exp]`);
  const t0 = Date.now(); let pz = null; while (!pz && Date.now() - t0 < 60000) { await sleep(300); pz = fs.readdirSync(dl).find(x => !pre.has(x) && /_all\.zip$/.test(x)); }
  const zl = pz ? execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("\\n".join(z.namelist()))', path.join(dl, pz)]).toString() : '';
  check('export a past job (.zip) without switching', !!pz && /restore/.test(pz) && /^None/.test(zl) && /Report\.pdf/.test(zl) && (await p.evaluate(() => TSField.getJob().id)) === job1Id && (await p.evaluate(() => TSField.getTrees().length)) === 6, { pz, stat: await txt('#xStat') });
  await p.evaluate(() => scrollTo(0, 0)); await shot('field_past_jobs_iphone.png');
  await tab('capture');
  const cachedParcel = await p.evaluate(() => !!(TSField.getJob().parcelGeo && TSField.getJob().parcelGeo.features.length));
  check('report fetched + cached the parcel outline into job 1', cachedParcel);

  // ---------- service worker + offline ----------
  await sleep(1000); const swOk = await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.active)));
  const cacheInfo = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); const reqs = await c.keys(); return { keys: ks, n: reqs.length, report: !!(await c.match('lib/report.js')), zip: !!(await c.match('lib/zip.js')) }; });
  const swName = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/)[1];
  check('service worker active', swOk); check('cache name ' + swName + ' (only cache) with new libs', swName === 'zt-tree-inventory-v' + C.VERSION && cacheInfo.keys.length === 1 && cacheInfo.keys[0] === swName && cacheInfo.report && cacheInfo.zip, cacheInfo);
  await p.setOfflineMode(true);
  try {
    await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 15000 });
    check('offline reload works, job 1 open with 6 trees', (await p.evaluate(() => TSField.getTrees().length)) === 6);
    await capture(30.5453, -87.3334, 4); await p.click('#tSpQ', { clickCount: 3 }); await p.type('#tSpQ', 'live oak'); await p.click('#spList button[data-sp="Southern live oak"]'); await setVal('#tDbh', 26);
    await p.click('#tSave'); await sleep(500);
    check('offline: capture + save', (await p.evaluate(() => TSField.getTrees().length)) === 7);
    await shot('field_offline_iphone.png');
    await tab('export'); await p.evaluate(() => { document.getElementById('xStat').textContent = ''; }); await p.click('#xReport');
    await p.waitForFunction(() => /Downloaded|failed/.test(document.getElementById('xStat').textContent), { timeout: 60000 });
    const xs = await txt('#xStat'); check('offline: report PDF builds (cached parcel)', /Downloaded: .*Tree_Inventory_Report\.pdf/.test(xs), xs);
    // remove the offline tree so job 1 stays the 6-tree sample
    await p.evaluate(async () => { const t = TSField.getTrees().find(x => x.dbh_in === 26); await TSStore.del(t.id); await TSField.openJob(TSField.getJob().id); });
  } catch (e) { check('offline run', false, e.message); }
  await p.setOfflineMode(false);
  // ---------- migration of v1.0.0 multi-job data: one current job, the rest go to Past jobs ----------
  const reloadReady = async () => { await p.reload({ waitUntil: 'networkidle0' }); await p.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 15000 }); };
  const xId = await p.evaluate(() => TSStore.putJob({ name: 'Old open job A', archived: false, created: '2026-01-01T00:00:00Z', lastOpened: '2030-01-01T00:00:00Z' }));
  await reloadReady();
  let mg = await p.evaluate(async () => ({ cur: TSField.getJob().id, open: (await TSStore.jobs()).filter(j => !j.archived).map(j => j.id), tab: !document.getElementById('tab-capture').hidden }));
  check('migration: saved current job stays current, other open job -> Past jobs, opens on Capture', mg.cur === job1Id && mg.open.length === 1 && mg.tab && (await p.evaluate(id => TSStore.getJob(id), xId)).archived === true, mg);
  const yId = await p.evaluate(() => { localStorage.setItem('zts:jobId', '99999'); return TSStore.putJob({ name: 'Most recent open job B', archived: false, created: '2026-01-01T00:00:00Z', lastOpened: '2031-01-01T00:00:00Z' }); });
  await reloadReady();
  mg = await p.evaluate(async () => ({ cur: TSField.getJob().id, open: (await TSStore.jobs()).filter(j => !j.archived).map(j => j.id) }));
  check('migration: without a saved current job, the most recently used becomes current; rest -> Past jobs', mg.cur === yId && mg.open.length === 1 && mg.open[0] === yId, mg);
  await p.evaluate(async (a, b, j1) => { await TSStore.delJob(a); await TSStore.delJob(b); await TSField.openJob(j1); }, xId, yId, job1Id); await reloadReady();
  check('back on job 1 after migration checks', (await p.evaluate(() => TSField.getJob().id)) === job1Id && (await p.evaluate(() => TSField.getTrees().length)) === 6);
  R.field = { page_errors: errs.slice(), console_errors: cerrs.slice() };
  check('field: no page errors', errs.length === 0, errs);
  check('field: no console errors (offline network errors excluded)', cerrs.filter(m => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR/.test(m)).length === 0, cerrs);

  // ---------- sketch page at iPhone size via the job deep link ----------
  const derrs = []; p.removeAllListeners('pageerror'); p.on('pageerror', e => derrs.push(e.message));
  await p.goto(BASE + 'desktop.html?job=' + job1Id + '&auto=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.body.dataset.rendered, { timeout: 200000 }); await sleep(1500);
  const sk = await p.evaluate(() => ({ r: document.body.dataset.rendered, page: document.body.dataset.page, bg: document.body.dataset.aerial, t: document.getElementById('tStat').textContent, p: document.getElementById('pStat').textContent, w: TSDesk.canvas.width }));
  check('sketch @390x844 from job deep link (6 trees, cached parcel, letter)', sk.r === '1' && sk.page === 'letter' && /6 tree/.test(sk.t) && /cached parcel/.test(sk.p) && sk.w === 2200, sk);
  check('sketch background drawn (USGS)', !/not available/.test(sk.bg || ''), sk.bg);
  await shot('sketch_page_iphone.png');
  fs.writeFileSync(path.join(OUT, 'sketch_letter.png'), Buffer.from((await p.evaluate(() => TSDesk.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  let pdf = await p.evaluate(() => TSSketch.exportPDF(TSDesk.canvas, 'sketch', 'letter').output('datauristring'));
  fs.writeFileSync(path.join(SAMPLE, 'sample_sketch_letter.pdf'), Buffer.from(pdf.split(',')[1], 'base64'));
  await p.select('#page', 'tabloid'); await p.click('#render'); await p.waitForFunction(() => document.body.dataset.page === 'tabloid' && /Rendered/.test(document.getElementById('sStat').textContent), { timeout: 200000 });
  fs.writeFileSync(path.join(OUT, 'sketch_11x17.png'), Buffer.from((await p.evaluate(() => TSDesk.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  pdf = await p.evaluate(() => TSSketch.exportPDF(TSDesk.canvas, 'sketch', 'tabloid').output('datauristring'));
  fs.writeFileSync(path.join(SAMPLE, 'sample_sketch_11x17.pdf'), Buffer.from(pdf.split(',')[1], 'base64'));
  const i1 = pdfInfo(path.join(SAMPLE, 'sample_sketch_letter.pdf')), i2 = pdfInfo(path.join(SAMPLE, 'sample_sketch_11x17.pdf'));
  check('sketch PDFs: letter 792x612 pt, 11x17 1224x792 pt', /792 x 612/.test(i1) && /1224 x 792/.test(i2), [i1.match(/Page size:.*/)[0], i2.match(/Page size:.*/)[0]]);
  bannedScan('sketch page', await p.evaluate(() => document.body.innerText));
  // sketch page offline (cached parcel, background unavailable -> still renders)
  await p.setOfflineMode(true);
  try { await p.goto(BASE + 'desktop.html?job=' + job1Id + '&auto=1', { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.rendered, { timeout: 60000 });
    check('sketch page offline renders with cached parcel', (await p.evaluate(() => document.body.dataset.rendered)) === '1' && (await p.evaluate(() => document.body.dataset.parcels)) === '1'); }
  catch (e) { check('sketch page offline', false, e.message); }
  await p.setOfflineMode(false);
  check('sketch @iPhone: no page errors', derrs.length === 0, derrs);

  // ---------- sketch page at desktop size: live parcels for all counties, JSON import ----------
  const d = await browser.newPage(); const d2errs = []; d.on('pageerror', e => d2errs.push(e.message));
  await d.setViewport({ width: 1440, height: 1000 }); R.desktop = {};
  for (const [j, ids, label] of [['PNS', '03-1S-31-1500-001-003', 'City of Pensacola (Escambia REFNUM)'], ['ESC', '031S311500001003', 'Escambia REFERENCE'],
    ['SR', '34-2N-28-0570-00A00-0190', 'Santa Rosa'], ['okaloosa', '18-3N-23-0000-0034-001B', 'Okaloosa']]) {
    await d.goto(BASE + 'desktop.html', { waitUntil: 'networkidle2' }); await d.waitForFunction(() => document.body.dataset.ready);
    await d.select('#jur', j); await d.$eval('#pids', (e, v) => e.value = v, ids); await d.click('#loadP');
    try { await d.waitForFunction(() => /Loaded|failed/.test(document.getElementById('pStat').textContent), { timeout: 60000 }); } catch (e) {}
    const st = await d.$eval('#pStat', e => e.textContent); check(`parcel loads: ${label}`, /^Loaded 1 parcel/.test(st), st.split('\n')[0]); R.desktop[label] = st.split('\n')[0];
  }
  await d.goto(BASE + 'desktop.html', { waitUntil: 'networkidle2' }); await d.waitForFunction(() => document.body.dataset.ready);
  await d.evaluate(async () => TSDesk.importText(await (await fetch('sample/sample_job_backup.json')).text(), 'sample_job_backup.json'));
  await d.select('#base', 'none'); await d.click('#render'); await d.waitForFunction(() => document.body.dataset.rendered, { timeout: 60000 });
  check('desktop: job JSON import renders 5 trees + cached parcel', (await d.evaluate(() => document.body.dataset.rendered)) === '1' && /5 tree/.test(await d.$eval('#tStat', e => e.textContent)));
  await d.screenshot({ path: path.join(OUT, 'desktop_page.png') });
  const pnFile = fs.readdirSync(SAMPLE).find(x => /^sample_PNEZD_v[\d.]+\.csv$/.test(x));
  const imp = await d.evaluate(async f => { const rows = TSCore.parseCSV(await (await fetch('sample/' + f)).text()); return rows.map(r => { const ll = TSCore.fromNE(+r[1], +r[2], 'EPSG:2238'); return [r[0], +ll.lat.toFixed(8), +ll.lon.toFixed(8)]; }); }, pnFile);
  check('PNEZD inverse projection round-trips', imp.length === 5 && imp.every(r => Math.abs(r[1] - 30.5454) < 0.001), imp);
  check('desktop: no page errors', d2errs.length === 0, d2errs);
  R.failed = failed; R.passed = R.checks.length - failed;
  fs.writeFileSync(path.join(__dirname, 'browser_test_results.json'), JSON.stringify(R, null, 2));
  console.log(`${R.passed}/${R.checks.length} checks passed`); await browser.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
