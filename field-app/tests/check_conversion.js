// Worked check: proj4js (via lib/core.js) vs NOAA NGS NCAT (https://geodesy.noaa.gov/NCAT/, API /api/ncat/llh)
// Run: NODE_PATH=<dir with proj4> node tests/check_conversion.js   (fetches NCAT live, saves responses)
const fs = require('fs'), path = require('path');
const C = require('../lib/core.js');
const cases = [
  { id: 'FLN-Pensacola', lat: 30.4213, lon: -87.2169, crs: 'EPSG:2238', zone: '0903' },
  { id: 'FLN-Bristol Park (Escambia sample parcel)', lat: 30.5452, lon: -87.3331, crs: 'EPSG:2238', zone: '0903' },
  { id: 'FLN-Tallahassee', lat: 30.4381, lon: -84.2809, crs: 'EPSG:2238', zone: '0903' },
  { id: 'FLE-Orlando', lat: 28.5383, lon: -81.3792, crs: 'EPSG:2236', zone: '0901' },
  { id: 'FLW-Tampa', lat: 27.9506, lon: -82.4572, crs: 'EPSG:2237', zone: '0902' },
];
(async () => {
  const out = [];
  for (const k of cases) {
    const url = `https://geodesy.noaa.gov/api/ncat/llh?lat=${k.lat}&lon=${k.lon}&eht=0&inDatum=nad83(2011)&outDatum=nad83(2011)&spcZone=${k.zone}`;
    const r = await (await fetch(url)).json();
    const nN = +r.spcNorthing_usft.replace(/,/g, ''), nE = +r.spcEasting_usft.replace(/,/g, '');
    const p = C.toNE(k.lat, k.lon, k.crs);
    const dN = p.northing - nN, dE = p.easting - nE;
    out.push({ ...k, ncat_zone: r.spcZone, ncat_N_usft: nN, ncat_E_usft: nE, proj4_N: +p.northing.toFixed(3), proj4_E: +p.easting.toFixed(3),
      dN_ft: +dN.toFixed(3), dE_ft: +dE.toFixed(3), pass: Math.abs(dN) <= 0.01 && Math.abs(dE) <= 0.01, ncat_url: url, ncat_id: r.ID });
  }
  const res = { run: new Date().toString(), tolerance_ft: 0.01, source: 'NOAA NGS NCAT API (geodesy.noaa.gov/api/ncat/llh), NAD83(2011) in/out, SPC US survey ft', results: out };
  fs.writeFileSync(path.join(__dirname, 'check_conversion_results.json'), JSON.stringify(res, null, 2));
  console.table(out.map(o => ({ id: o.id, ncat_N: o.ncat_N_usft, proj4_N: o.proj4_N, ncat_E: o.ncat_E_usft, proj4_E: o.proj4_E, dN: o.dN_ft, dE: o.dE_ft, pass: o.pass })));
  if (!out.every(o => o.pass)) process.exit(1);
})();
