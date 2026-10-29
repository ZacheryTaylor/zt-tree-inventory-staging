// Builds 5 FAKE trees inside the real Escambia parcel 031S311500001003 and exports PNEZD + tree log (CSV/XLSX) with the app's own core.js.
const fs = require('fs'), path = require('path');
const C = require('../lib/core.js'); const XLSX = require('../vendor/xlsx.full.min.js'); XLSX.set_fs(fs);
const L = C.LISTS; // species list copied from the mitigation calculator (lib/core.js SPECIES)
const gj = JSON.parse(fs.readFileSync(path.join(__dirname, 'esc_parcel_031S311500001003.geojson')));
const ring = gj.features[0].geometry.coordinates[0];
const inside = (x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// pick 5 points: fractions along the long axis between two far vertices, nudged to be inside
const a = ring[0], b = ring[4]; const pts = [];
for (const f of [0.15, 0.32, 0.5, 0.68, 0.85]) { const lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f; pts.push([lat, lon]); }
const base = [
  { tag: '101', species: 'Southern live oak', dbh_in: 32, canopy_ft: 30, condition: 'Good', protected: 'Y', heritage: 'Y', ph_type: 'Heritage', notes: 'FAKE sample tree',
    wet: 'N', prev: 'N', ms: 'N', champ: 'N', can_pct: 10, root_pct: 20 },
  { tag: '102', species: 'Longleaf pine', dbh_in: 14, canopy_ft: 12, condition: 'Good', protected: 'N', heritage: 'N', notes: 'FAKE sample tree' },
  { tag: '103', species: 'Laurel oak', dbh_in: 22.5, stems: '18, 13.5', canopy_ft: 22, condition: 'Fair', protected: 'Y', heritage: 'N', notes: 'FAKE, co-dominant stems' },
  { tag: '104', species: 'Southern magnolia', dbh_in: 11, canopy_ft: 10, condition: 'Good', protected: 'Y', heritage: 'N', notes: 'FAKE sample tree, position typed in (manual)', pos_src: 'manual' },
  { tag: '105', species: 'Sweet bay (field ID, unlisted)', dbh_in: 8, canopy_ft: 8, condition: 'Poor', protected: 'N', heritage: 'N', notes: 'FAKE, free-text species, "quoted", comma, test' },
];
const accs = [14.2, 18.7, 22.4, 16.0, 27.9];
const trees = base.map((t, i) => {
  const [lat, lon] = pts[i]; if (!inside(lon, lat)) throw new Error('point ' + i + ' outside parcel');
  const sp = L.species.find(s => s[0] === t.species); const ne = C.toNE(lat, lon, 'EPSG:2238');
  const man = t.pos_src === 'manual';
  return Object.assign({ pos_src: 'gps' }, t, { sci: sp && sp[1] !== '-' ? sp[1] : '', point_no: 1000 + i, lat, lon, northing: ne.northing, easting: ne.easting, elev_ft: 0,
    acc_ft: man ? null : accs[i], n_readings: man ? 1 : 10, spread_ft: man ? null : accs[i] / 3, crs: 'EPSG:2238', captured: '10/17/2026, 9:0' + i + ':00 AM', photo_name: i === 0 ? 'Tag_101.jpg' : '' });
});
trees.forEach(t => { const e = C.validateTree(t); if (e.length) throw new Error(t.tag + ': ' + e); });
if (C.combinedDBH(trees[2].stems) !== 22.5) throw new Error('combinedDBH check failed: ' + C.combinedDBH(trees[2].stems));
const job = { name: 'SAMPLE - Bristol Park (fake trees)', client: 'Sample Engineering Co. (fake)', site: 'Escambia County, FL (sample)', parcels: '03-1S-31-1500-001-003',
  jurisdiction: 'ESC', srLoc: 'S', date: '2026-10-22', crew: 'ZT', notes: 'Sample data, not a real job', crs: 'EPSG:2238', start: 1000, elev: 'zero', accLimit: 30, nRead: 10, wait: 45 };
const meta = { project: job.name, client: job.client, site: job.site, parcels: job.parcels, jurisdiction: C.JURISDICTIONS.ESC.label, crs: C.CRS['EPSG:2238'].label, crsSrc: C.CRS['EPSG:2238'].src, elev: 'zero', exported: '10/22/2026',
  job, file: 'sample_PNEZD_' + C.VERSION_TAG + '.csv' };
// one FAKE accuracy check: known point = parcel vertex 0, "captured" 12 ft north-east of it
const kv = C.toNE(ring[0][1], ring[0][0], 'EPSG:2238'), capLL = C.fromNE(kv.northing + 8.5, kv.easting + 8.5, 'EPSG:2238');
const o = C.offsetFt(capLL, { northing: kv.northing, easting: kv.easting }, 'EPSG:2238');
const checks = [{ name: 'Parcel corner (FAKE)', crs: 'EPSG:2238', kN: o.known.northing, kE: o.known.easting, cN: o.captured.northing, cE: o.captured.easting, cLat: capLL.lat, cLon: capLL.lon,
  dN: o.dN, dE: o.dE, horiz: o.horiz, acc_ft: 15.2, n: 10, spread_ft: 4.1, source: 'County GIS vertex (sample only)', captured: '10/22/2026, 9:30:00 AM' }];
if (Math.abs(o.horiz - Math.hypot(8.5, 8.5)) > 0.01 || C.checkVerdict(checks[0]) !== 'PASS') throw new Error('offset check failed ' + o.horiz);
const out = path.join(__dirname, '../sample'); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^sample_PNEZD|^sample_job_backup/.test(f)) fs.unlinkSync(path.join(out, f));
fs.writeFileSync(path.join(out, meta.file), C.pnezdCSV(trees));
fs.writeFileSync(path.join(out, meta.file.replace(/\.csv$/, '_NOTES.txt')), C.pnezdNote(meta));
fs.writeFileSync(path.join(out, 'sample_tree_log.csv'), C.treeLogCSV(trees, meta));
const wb = C.buildWorkbook(XLSX, trees, meta, L.species, checks);
XLSX.writeFile(wb, path.join(out, 'sample_tree_log.xlsx'));
// job backup (same format as the field app's "Job backup (.json)"), with the cached parcel outline, for the sketch page / browser test
fs.writeFileSync(path.join(out, 'sample_job_backup.json'), JSON.stringify({ app: 'zt-tree-inventory', format: 2, version: C.VERSION, exported: '2026-10-22T09:45:00-05:00', job: Object.assign({ id: 1 }, job),
  parcelGeo: { features: gj.features, retrieved: '10/17/2026 (test fixture)', source: 'Escambia County Property Appraiser (parcels); source acknowledgment: Escambia County IMAGiNE GIS', idField: 'REFNUM' },
  trees: trees.map((t, i) => Object.assign({ id: i + 1, jobId: 1 }, t)), checks, photos: {} }, null, 1));
for (const t of trees) { const sg = C.suggestStatus(t, job); console.log('suggest', t.tag, t.species, t.dbh_in, '->', sg.protected, sg.heritage); }
console.log(fs.readFileSync(path.join(out, meta.file), 'utf8'));
