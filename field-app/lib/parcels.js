/* Parcel outline lookup (county ArcGIS REST, returns GeoJSON in WGS84). Shared by the sketch page and the field app's report.
 * Sources/terms live in jurisdictions.json (synced from parcel-filter). City of Pensacola parcels come from the Escambia layer. */
(function () {
  'use strict';
  let cfg = null;
  async function config() {
    if (cfg) return cfg;
    const r = await fetch('jurisdictions.json'); cfg = await r.json(); return cfg;
  }
  /** Map a job jurisdiction code (PNS/ESC/SR) to a parcel source id in jurisdictions.json. */
  const sourceFor = code => (self.TSCore.JURISDICTIONS[code] || {}).parcelSource || '';
  const splitIds = s => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  async function query(srcId, ids, timeoutMs) {
    const c = await config(), j = (c.jurisdictions || []).find(x => x.id === srcId);
    if (!j) throw new Error('No parcel source for "' + srcId + '"');
    ids = Array.isArray(ids) ? ids : splitIds(ids);
    const bad = ids.filter(s => !/^[A-Za-z0-9.\-]+$/.test(s)); if (bad.length) throw new Error('Invalid parcel ID(s): ' + bad.join(', '));
    if (!ids.length) throw new Error('Enter at least one parcel ID (e.g., ' + j.idExample + ').');
    const idFields = j.idFields || [j.idField], inList = ids.map(s => `'${s}'`).join(',');
    const where = idFields.map(f => `${f} IN (${inList})`).join(' OR ');
    const url = `${j.parcelLayerUrl}/query?where=${encodeURIComponent(where)}&outFields=${encodeURIComponent((j.labelFields || idFields).join(','))}&outSR=4326&f=geojson`;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const to = ctl && setTimeout(() => ctl.abort(), timeoutMs || 20000);
    try {
      const gj = await (await fetch(url, ctl ? { signal: ctl.signal } : {})).json(); if (gj.error) throw new Error(gj.error.message);
      const features = gj.features || [], found = new Set(features.flatMap(f => idFields.map(k => f.properties[k])));
      return { features, missing: ids.filter(i => !found.has(i)), retrieved: new Date().toLocaleString(), j, idField: j.idField };
    } finally { if (to) clearTimeout(to); }
  }
  self.TSParcels = { config, query, sourceFor, splitIds };
})();
