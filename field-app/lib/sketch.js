/* Parcel + tree location sketch renderer (canvas). Drawn in the chosen State Plane CRS (ft) so the scale bar is true.
 * Page sizes: letter (11x8.5 in) and tabloid / 11x17 (17x11 in) landscape at 200 dpi.
 * Labelled: "Locations approximate, for field reference only. Not a survey." */
(function () {
  'use strict';
  const C = self.TSCore;
  const PAGES = { letter: { W: 2200, H: 1700, inW: 11, inH: 8.5, label: 'Letter 8.5x11' }, tabloid: { W: 3400, H: 2200, inW: 17, inH: 11, label: 'Tabloid 11x17' } };
  const DPI = 200, M = 50;

  function ringsOf(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return geom.coordinates;
    if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
    return [];
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p; return 10 * p; }
  function layout(page) {
    const P = PAGES[page] || PAGES.letter, k = P.H / 1700; // scale fonts with page height
    const HEAD = Math.round(150 * k), FOOT = Math.round(250 * k), SIDE = Math.round(560 * k);
    return Object.assign({}, P, { k, HEAD, FOOT, SIDE, page: PAGES[page] ? page : 'letter' });
  }

  /** Build view: projected parcels/trees + bbox fitted to map box. */
  function view(opts) {
    const crs = opts.crs || C.DEFAULT_CRS, L = layout(opts.page);
    const parcels = (opts.parcels || []).map(f => ({ id: f.properties && (f.properties[opts.idField] || f.properties.REFNUM || f.properties.REFERENCE || f.properties.Parcel || f.properties.PATPCL_PIN) || '',
      rings: ringsOf(f.geometry).map(r => r.map(([lon, lat]) => { const p = C.toNE(lat, lon, crs); return [p.easting, p.northing]; })) }));
    const trees = (opts.trees || []).filter(t => isFinite(+t.lat) && isFinite(+t.lon)).map(t => { const p = C.toNE(+t.lat, +t.lon, crs); return Object.assign({}, t, { x: p.easting, y: p.northing }); });
    let xs = [], ys = [];
    parcels.forEach(p => p.rings.forEach(r => r.forEach(([x, y]) => { xs.push(x); ys.push(y); })));
    trees.forEach(t => { xs.push(t.x); ys.push(t.y); });
    if (!xs.length) throw new Error('Nothing to draw: load a parcel and/or trees first.');
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(40, 0.12 * Math.max(x1 - x0, y1 - y0)); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const box = { l: M, t: L.HEAD + 10, w: L.W - 2 * M - L.SIDE - 20, h: L.H - L.HEAD - L.FOOT - 20 };
    const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0)); // px per ft
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ex = { x0: cx - box.w / 2 / s, x1: cx + box.w / 2 / s, y0: cy - box.h / 2 / s, y1: cy + box.h / 2 / s };
    const P = (x, y) => [box.l + (x - ex.x0) * s, box.t + (ex.y1 - y) * s];
    return { parcels, trees, box, s, ex, P, crs, L };
  }

  /** Background map: XYZ (Web Mercator) tiles from the configured basemap (jurisdictions.json "basemap"). Each tile is drawn
   *  with its own affine transform into the State Plane canvas. Tiles must allow CORS or PNG/PDF export would be blocked. */
  function tileUrl(bm, z, x, y) {
    const subs = bm.subdomains || 'abc', sd = Array.isArray(subs) ? subs : String(subs).split('');
    return bm.url.replace('{s}', sd[(x + y) % sd.length] || '').replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '');
  }
  const lon2t = (lon, z) => (lon + 180) / 360 * 2 ** z;
  const lat2t = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
  const t2lon = (x, z) => x / 2 ** z * 360 - 180;
  const t2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  function tilePlan(v, bm) {
    const ll = [[v.ex.x0, v.ex.y0], [v.ex.x1, v.ex.y0], [v.ex.x0, v.ex.y1], [v.ex.x1, v.ex.y1]].map(([x, y]) => C.fromNE(y, x, v.crs));
    const lats = ll.map(p => p.lat), lons = ll.map(p => p.lon), latc = (Math.min(...lats) + Math.max(...lats)) / 2;
    const resM = (1 / v.s) / C.M_TO_USFT;
    let z = Math.min(bm.maxZoom || 19, Math.max(1, Math.ceil(Math.log2(156543.03392 * Math.cos(latc * Math.PI / 180) / resM))));
    let xs, ys;
    for (;; z--) {
      xs = [Math.floor(lon2t(Math.min(...lons), z)), Math.floor(lon2t(Math.max(...lons), z))];
      ys = [Math.floor(lat2t(Math.max(...lats), z)), Math.floor(lat2t(Math.min(...lats), z))];
      if ((xs[1] - xs[0] + 1) * (ys[1] - ys[0] + 1) <= 120 || z <= 1) break;
    }
    const tiles = []; for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) tiles.push({ z, x, y });
    return { z, tiles };
  }
  function loadImage(url, ms) {
    return new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous'; const to = setTimeout(() => rej(new Error('background timed out')), ms || 30000);
      img.onload = () => { clearTimeout(to); res(img); }; img.onerror = () => { clearTimeout(to); rej(new Error('background failed to load')); }; img.src = url;
    });
  }
  async function drawTiles(ctx, v, bm, ms) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    const plan = tilePlan(v, bm);
    const res = await Promise.all(plan.tiles.map(t => loadImage(tileUrl(bm, t.z, t.x, t.y), ms).then(img => ({ t, img }), () => null)));
    const ok = res.filter(Boolean); if (!ok.length) throw new Error('no tiles loaded');
    ctx.save(); ctx.beginPath(); ctx.rect(v.box.l, v.box.t, v.box.w, v.box.h); ctx.clip();
    for (const { t, img } of ok) {
      const c = (dx, dy) => { const lat = t2lat(t.y + dy, t.z), lon = t2lon(t.x + dx, t.z), p = C.toNE(lat, lon, v.crs); return v.P(p.easting, p.northing); };
      const nw = c(0, 0), ne = c(1, 0), sw = c(0, 1), k = 1 / 256, o = 1.004;
      ctx.setTransform((ne[0] - nw[0]) * k * o, (ne[1] - nw[1]) * k * o, (sw[0] - nw[0]) * k * o, (sw[1] - nw[1]) * k * o, nw[0], nw[1]);
      ctx.drawImage(img, 0, 0, 256, 256);
    }
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { loaded: ok.length, total: plan.tiles.length, z: plan.z };
  }
  function wrap(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(' '); let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; }
    if (line) ctx.fillText(line, x, y); return y + lh;
  }
  /** Greedy label placement: try 8 positions around each point, avoid other labels and points. */
  function placeLabels(ctx, pts, r) {
    const boxes = pts.map(p => ({ x0: p.px - r, y0: p.py - r, x1: p.px + r, y1: p.py + r })), out = [];
    const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    for (const p of pts) {
      const w = ctx.measureText(p.label).width + 6, h = r * 1.9, d = r + 4;
      const cands = [[d, -d - h * .1], [d, d + h * .7], [-d - w, -d - h * .1], [-d - w, d + h * .7], [-w / 2, -d - 4], [-w / 2, d + h * .9], [d * 2.2, -d * 2.4], [-d * 2.2 - w, -d * 2.4]];
      let best = null;
      for (const [dx, dy] of cands) { const b = { x0: p.px + dx, y0: p.py + dy - h * .8, x1: p.px + dx + w, y1: p.py + dy + h * .2 }; if (!hit(b)) { best = { dx, dy, b }; break; } }
      if (!best) { const [dx, dy] = cands[0]; best = { dx, dy, b: { x0: p.px + dx, y0: p.py + dy - h * .8, x1: p.px + dx + w, y1: p.py + dy + h * .2 }, leader: true }; }
      boxes.push(best.b); out.push(Object.assign({}, p, best));
    }
    return out;
  }

  async function render(canvas, opts) {
    const v = view(opts), L = v.L, W = L.W, H = L.H, k = L.k, F = 'Helvetica, Arial, sans-serif', fs = n => Math.round(n * k) + 'px ' + F;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'); const job = opts.job || {};
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    let aerialNote = 'none', onAir = false;
    if (opts.aerial && opts.basemap) {
      try { const r = await drawTiles(ctx, v, opts.basemap, opts.aerialTimeout); onAir = true;
        aerialNote = `${opts.basemap.label || 'basemap'}, zoom ${r.z}, ${r.loaded}/${r.total} tiles (${opts.basemap.attribution || 'see source'})`; }
      catch (e) { aerialNote = 'not available (' + e.message + ')'; }
    }
    // grid ticks
    ctx.save(); ctx.beginPath(); ctx.rect(v.box.l, v.box.t, v.box.w, v.box.h); ctx.clip();
    if (!onAir) { ctx.fillStyle = '#fafbf8'; ctx.fillRect(v.box.l, v.box.t, v.box.w, v.box.h); }
    const g = niceStep((v.ex.x1 - v.ex.x0) / 6); ctx.strokeStyle = onAir ? 'rgba(255,255,255,.35)' : '#e3e6df'; ctx.lineWidth = 1; ctx.font = fs(15); ctx.fillStyle = onAir ? '#fff' : '#777';
    for (let x = Math.ceil(v.ex.x0 / g) * g; x < v.ex.x1; x += g) { const [px] = v.P(x, 0); ctx.beginPath(); ctx.moveTo(px, v.box.t); ctx.lineTo(px, v.box.t + v.box.h); ctx.stroke(); ctx.fillText('E ' + x.toFixed(0), px + 4, v.box.t + v.box.h - 8); }
    for (let y = Math.ceil(v.ex.y0 / g) * g; y < v.ex.y1; y += g) { const [, py] = v.P(0, y); ctx.beginPath(); ctx.moveTo(v.box.l, py); ctx.lineTo(v.box.l + v.box.w, py); ctx.stroke(); ctx.fillText('N ' + y.toFixed(0), v.box.l + 6, py - 4); }
    for (const p of v.parcels) {
      ctx.beginPath(); for (const r of p.rings) r.forEach(([x, y], i) => { const [px, py] = v.P(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fillStyle = onAir ? 'rgba(255,230,0,.10)' : 'rgba(31,81,48,.06)'; ctx.fill('evenodd');
      ctx.lineWidth = 5 * k; ctx.strokeStyle = onAir ? '#ffe600' : '#1f5130'; ctx.stroke();
      const r0 = p.rings[0] || []; if (r0.length) {
        const cx = r0.reduce((a, q) => a + q[0], 0) / r0.length, cy = r0.reduce((a, q) => a + q[1], 0) / r0.length; const [px, py] = v.P(cx, cy);
        ctx.font = 'bold ' + fs(22); ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = onAir ? 'rgba(0,0,0,.7)' : '#fff'; ctx.fillStyle = onAir ? '#ffe600' : '#1f5130';
        ctx.strokeText('Parcel ' + p.id, px, py); ctx.fillText('Parcel ' + p.id, px, py); ctx.textAlign = 'left';
      }
    }
    for (const t of v.trees) {
      const [px, py] = v.P(t.x, t.y);
      if (opts.accCircles && +t.acc_ft > 0) { ctx.beginPath(); ctx.arc(px, py, +t.acc_ft * v.s, 0, 2 * Math.PI); ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = onAir ? 'rgba(255,255,255,.85)' : 'rgba(178,106,0,.8)'; ctx.stroke(); ctx.setLineDash([]); }
    }
    const R = 11 * k;
    ctx.font = 'bold ' + fs(22);
    const pts = v.trees.map(t => { const [px, py] = v.P(t.x, t.y); return { t, px, py, label: String(t.tag) }; });
    const placed = placeLabels(ctx, pts, R);
    for (const p of placed) {
      ctx.beginPath(); ctx.arc(p.px, p.py, R, 0, 2 * Math.PI); ctx.fillStyle = /^Y/i.test(p.t.heritage) ? '#c62828' : /^Y/i.test(p.t.protected) ? '#ef6c00' : '#2e7d4f'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    for (const p of placed) {
      if (p.leader) { ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.px + p.dx, p.py + p.dy - R * .5); ctx.lineWidth = 1.5; ctx.strokeStyle = onAir ? '#fff' : '#333'; ctx.stroke(); }
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
      ctx.strokeText(p.label, p.px + p.dx + 3, p.py + p.dy); ctx.fillText(p.label, p.px + p.dx + 3, p.py + p.dy);
    }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.strokeRect(v.box.l, v.box.t, v.box.w, v.box.h);
    // north arrow (grid north) + scale bar
    const nx = v.box.l + v.box.w - 70 * k, ny = v.box.t + 30 * k;
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .9; ctx.fillRect(nx - 45 * k, ny - 15 * k, 90 * k, 120 * k); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + 18 * k, ny + 60 * k); ctx.lineTo(nx, ny + 48 * k); ctx.lineTo(nx - 18 * k, ny + 60 * k); ctx.closePath(); ctx.fillStyle = '#222'; ctx.fill();
    ctx.font = 'bold ' + fs(26); ctx.textAlign = 'center'; ctx.fillText('N', nx, ny + 88 * k); ctx.font = fs(13); ctx.fillText('grid north', nx, ny + 102 * k); ctx.textAlign = 'left';
    const sbFt = niceStep((v.box.w / v.s) / 5), sbPx = sbFt * v.s, sx = v.box.l + 20, sy = v.box.t + v.box.h - 50 * k;
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .9; ctx.fillRect(sx - 10, sy - 34 * k, sbPx + 170 * k, 56 * k); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#222'; ctx.fillRect(sx + i * sbPx / 4, sy, sbPx / 4, 12 * k); }
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.strokeRect(sx, sy, sbPx, 12 * k);
    ctx.fillStyle = '#222'; ctx.font = fs(17); ctx.fillText('0', sx - 4, sy - 8); ctx.fillText(sbFt + ' ft (approx.)', sx + sbPx - 10, sy - 8);
    ctx.font = fs(14); ctx.fillText(`Scale: 1 in = ${Math.round(DPI / v.s)} ft on ${L.label} at full size`, sx, sy + 34 * k);
    // header
    ctx.fillStyle = '#1f5130'; ctx.fillRect(0, 0, W, 8);
    ctx.fillStyle = '#111'; ctx.font = 'bold ' + fs(40); ctx.fillText(opts.title || 'Tree Location Sketch (approximate)', M, 58 * k);
    ctx.fillStyle = '#b00020'; ctx.font = 'bold ' + fs(28); ctx.fillText(C.SKETCH_LABEL.toUpperCase(), M, 100 * k);
    ctx.fillStyle = '#5a3a00'; ctx.font = fs(17); wrap(ctx, 'Accuracy: ' + C.ACCURACY_NOTE, M, 128 * k, W - 2 * M - L.SIDE, 20 * k);
    // side panel: title block + legend + tree table
    const sx0 = W - M - L.SIDE; let yy = 30 * k;
    ctx.strokeStyle = '#1f5130'; ctx.lineWidth = 3; ctx.strokeRect(sx0 - 12, 14, L.SIDE + 12, L.H - 28 - L.FOOT + 20);
    ctx.fillStyle = '#1f5130'; ctx.fillRect(sx0 - 12, 14, L.SIDE + 12, 46 * k);
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + fs(22); ctx.fillText(C.PRODUCT_NAME + ' \u2014 tree inventory data', sx0, 46 * k);
    yy = 90 * k; ctx.fillStyle = '#111'; ctx.font = fs(18);
    const rows = [['Job', job.name || opts.project || '-'], ['Client', job.client || '-'], ['Site', job.site || '-'],
      ['Parcel(s)', v.parcels.map(p => p.id).join(', ') || job.parcels || '-'], ['Jurisdiction', job.jurisdictionLabel || '-'], ['Field date', job.date || '-'],
      ['Trees', String(v.trees.length)], ['CRS', (C.CRS[v.crs] ? C.CRS[v.crs].label : v.crs)], ['Prepared by', C.AUTHOR_NAME]];
    for (const [a, b] of rows) { ctx.font = 'bold ' + fs(16); ctx.fillText(a, sx0, yy); ctx.font = fs(16); yy = wrap(ctx, b, sx0 + 120 * k, yy, L.SIDE - 130 * k, 20 * k) + 2 * k; }
    yy += 8 * k; ctx.fillRect(sx0, yy, L.SIDE - 10, 2); yy += 28 * k;
    ctx.font = 'bold ' + fs(20); ctx.fillText('Legend', sx0, yy); yy += 28 * k; ctx.font = fs(16);
    for (const [col, txt] of [['#2e7d4f', 'Tree (tag # label)'], ['#ef6c00', 'Protected (field call, suggested by code DBH)'], ['#c62828', 'Heritage (field call, suggested by code DBH)']]) {
      ctx.beginPath(); ctx.arc(sx0 + 10, yy - 6, 9 * k, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#222'; ctx.fillText(txt, sx0 + 28 * k, yy); yy += 24 * k;
    }
    ctx.strokeStyle = '#1f5130'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx0, yy - 6); ctx.lineTo(sx0 + 22, yy - 6); ctx.stroke(); ctx.fillText('Parcel line (county GIS, approx., not survey)', sx0 + 28 * k, yy); yy += 24 * k;
    if (opts.accCircles) { ctx.setLineDash([6, 5]); ctx.strokeStyle = '#b26a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx0 + 10, yy - 6, 9 * k, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.fillText('Reported GPS accuracy radius', sx0 + 28 * k, yy); yy += 24 * k; }
    yy += 10 * k; ctx.font = 'bold ' + fs(16);
    const cols = [0, 60, 130, 390, 455].map(c => sx0 + c * k);
    ['Tag', 'Pt #', 'Species', 'DBH', '\u00b1ft'].forEach((h, i) => ctx.fillText(h, cols[i], yy)); yy += 6;
    ctx.fillRect(sx0, yy, L.SIDE - 10, 2); yy += 20 * k; ctx.font = fs(15);
    const maxRows = Math.floor((H - L.FOOT - yy - 10) / (19 * k));
    v.trees.slice(0, maxRows).forEach(t => {
      [String(t.tag), String(t.point_no || ''), String(t.species || '').slice(0, 24), String(t.dbh_in || ''), C.isManual(t) ? 'man.' : (t.acc_ft != null && t.acc_ft !== '' ? (+t.acc_ft).toFixed(0) : '')].forEach((x, i) => ctx.fillText(x, cols[i], yy));
      yy += 19 * k;
    });
    if (v.trees.length > maxRows) ctx.fillText(`+ ${v.trees.length - maxRows} more (see tree log / report)`, sx0, yy);
    // footer
    const fy = H - L.FOOT + 20; ctx.fillStyle = '#f3f3f0'; ctx.fillRect(0, fy - 10, W, L.FOOT); ctx.fillStyle = '#222'; ctx.font = fs(16);
    let y2 = wrap(ctx, 'Coordinate system: ' + (C.CRS[v.crs] ? C.CRS[v.crs].label : v.crs) + '. Positions are phone GPS readings (averaged where noted), projected with proj4js; no datum shift applied. Parcel lines: ' + (opts.parcelSource || 'county GIS') + (opts.retrieved ? ', retrieved ' + opts.retrieved : '') + '; parcel lines are approximate and not survey quality.', M, fy + 14 * k, W - 2 * M, 20 * k);
    y2 = wrap(ctx, 'Background map: ' + aerialNote + '.', M, y2, W - 2 * M, 20 * k);
    ctx.font = 'bold ' + fs(17); ctx.fillStyle = '#b00020';
    y2 = wrap(ctx, C.SKETCH_LABEL + ' ' + C.DISCLAIMER, M, y2 + 4, W - 2 * M, 21 * k);
    ctx.font = fs(14); ctx.fillStyle = '#666'; ctx.fillText(C.PRODUCT_NAME + ' ' + C.VERSION_TAG + ' \u00b7 ' + L.label + ' \u00b7 ' + new Date().toLocaleDateString(), M, H - 14);
    return { aerialNote, view: v, page: L.page };
  }
  function exportPDF(canvas, name, page) {
    const P = PAGES[page] || (canvas.width > 3000 ? PAGES.tabloid : PAGES.letter);
    const { jsPDF } = self.jspdf; const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [P.inH, P.inW] });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, P.inW, P.inH);
    pdf.setProperties({ title: name, subject: C.SKETCH_LABEL, author: C.AUTHOR_NAME, keywords: 'tree inventory; not a survey; locations approximate' });
    return pdf;
  }
  self.TSSketch = { render, exportPDF, tilePlan, tileUrl, view, PAGES };
})();
