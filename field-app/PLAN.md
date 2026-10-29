# ZT Tree Inventory: plan (v1.0.1, 2026-10-22)

> Tool, not engineering or surveying advice. Not survey grade and not a substitute for a licensed surveyor or engineer; the client's licensed surveyor locates the tags. Tree condition and risk determinations require an ISA Certified Arborist; condition entries here are visual field notes only. Prepared by Zach Taylor, EI (Engineer Intern), ZT, LLC.
>
> **Locations approximate, for field reference only. Not a survey.**

(The quoted disclaimer above is the exact `DISCLAIMER` string in `lib/core.js`, used in the app footer, export headers, PNEZD notes file, sketch and report. `tests/validate_exports.py` fails if they drift apart.)

History: v0.1 Product Shop prototype (2026-10-17 08:09 CT), v0.2 takeover pass (same morning), v1.0.0 field-ready release (2026-10-22), **v1.0.1 (same night): "Proposed action" removed and a single current-job model**. Folder stays `tree-survey-app`; the user-facing name is the single config string `PRODUCT_NAME` in `lib/core.js` (plus `manifest.webmanifest` and the two HTML `<title>`/apple-title tags, which a test keeps in sync). See `CHANGELOG.md`.

## 0. Business use and decisions for Zach
Zach (non-licensed, EI) sells per-job **tree inventory / GPS tree mapping data** to engineers, landscape architects and developers in Escambia County, Santa Rosa County and the City of Pensacola. Deliverables per job: Tree Inventory Report PDF, Civil 3D PNEZD + notes, tree log XLSX/CSV (with the mitigation-calculator paste sheet), photos, parcel sketch (letter or 11x17). He test-runs it at home first (`HOME_TEST_CHECKLIST.md`).

**Decisions needed:**
1. **Product name.** Default `ZT Tree Inventory` (one string in `lib/core.js`; also `manifest.webmanifest` name/short_name and the apple-mobile-web-app-title meta tags). Avoid "survey" in any new name.
2. **iPhone HTTPS hosting** (section 7): keep using the existing noindex preview, or a local/tunnel option. No account was created and nothing was deployed by this workstream.
3. **Apple Developer Program ($99/yr)**: only needed for an App Store/TestFlight build (section 7). Not needed for the PWA.
4. **Rule uncertainties** to confirm with each jurisdiction before relying on suggestions: Escambia/Santa Rosa multi-trunk DBH method (unverified), Santa Rosa north-of-Yellow-River live oak heritage (code conflict, shown as POSSIBLE), Pensacola single-family/duplex exemption (suggestion text says so).
5. **Insurance / contract wording** for selling data (general liability; scope letter that repeats section 12). Not legal advice; consider a short review by a Florida attorney.

## 1. What it is
- **Field app** (`index.html` + `field.js`): iPhone-first PWA with tabs **Capture | Trees | Check | Export | More** and a sticky bottom bar (**Capture**, live accuracy chip, **Save**) for one-handed use; touch targets ≥ 48 px; high-contrast (sun) mode.
  - **Jobs: one current job at a time (v1.0.1)**. The app always opens on Capture in the current job; no job prompt, picker or required field. A job is created automatically on first launch and after "Finish job & start new", named "Job YYYY-MM-DD" plus the first parcel ID or the jurisdiction when known (keeps renaming itself until a name is typed); it carries over jurisdiction, CRS, GPS settings, accuracy limit, crew and start point # from the previous job. All details (name, client, site address, parcel ID(s), jurisdiction PNS/ESC/SR/Other, Santa Rosa north/south of the Yellow River, field date, crew, notes, CRS, GPS settings, accuracy limit) are optional and edited from the **job chip in the header** (bottom sheet, autosaves). At the first export/report of a job the same sheet is offered **once**, prefilled and skippable. Export › **Finish job & start new** confirms (with a reminder if nothing was exported), moves the job to **More › Past jobs** and starts a fresh one. Past jobs: Reopen (the current job moves to Past jobs; an empty untouched one is dropped), Export (.zip, without switching), Delete. Every export is per job. Migration: v0.x trees go into a "(migrated)" job; with v1.0.0 multi-job data the last open job (or the most recently used) stays current and the rest go to Past jobs.
  - **GPS**: `watchPosition` plus a ~1.1 s `getCurrentPosition` poll (Product Shop's 08:08 fix, kept), exact repeats dropped, 1/acc² weighted average of N readings with live per-reading accuracy, progress and "Reading k of N". Transient errors (timeout / position unavailable) no longer abort: "Weak signal, still trying…"; the time limit reports "Stopped at k of N readings". Permission denied shows iOS Settings steps and points to manual entry.
  - **Hard accuracy warning**: when the averaged accuracy is worse than the job limit (default 30 ft, the top of the stated 10–30 ft range) Save is blocked until the user re-captures or ticks "Save anyway" **and** gives a reason; the tree is flagged in the list, tree log ("Accuracy flag" column), and report.
  - **Capture form**: auto-increment tag # (keeps prefixes/zero padding; Tag 1 prefilled), point # auto, duplicate-tag warning (blocks save), species search over the calculator list plus recent-species chips and a "did you mean" for unlisted names, DBH with multi-stem combine (√Σd²), canopy radius, condition chips (labelled visual field note; "Hazard – documented (F.S. 163.045)" shows a warning that it only records existing arborist/LA documentation), protected/heritage auto-suggested from jurisdiction thresholds ("suggested, field judgement", with the code basis), mitigation inputs, notes, photo (compressed on the phone to 1600 px JPEG q0.75).
  - **Edit/delete with undo**: editing shows an explicit **Keep saved position / Use new GPS fix** toggle (replaces v0.2's confusing confirm dialog); every save, edit and delete shows an Undo toast; deleting a check can be undone too.
  - **Field accuracy check** (Check tab): enter a known point (N/E in the job CRS or lat/lon) plus its source, capture an averaged fix on it, and get dN, dE, horizontal offset (ft) and PASS/FAIL (PASS ≤ 30 ft). Checks are stored per job and exported (XLSX sheet "Accuracy checks", report page).
  - **Exports** (Export tab), via the iOS Share sheet (Web Share API with files) and a download fallback; if iOS expires the tap while a big file builds, a one-tap "Share" button appears: Tree Inventory Report PDF; PNEZD CSV + `_NOTES.txt`; tree log XLSX (Tree Log, Calculator paste, PNEZD, About, Accuracy checks) and CSV; photos `.zip` (built in the browser, `lib/zip.js`); job backup `.json` (restore puts it in Past jobs); "Everything (.zip)". "Open parcel sketch for this job" opens `desktop.html?job=<id>&auto=1` on the same device.
  - **More** tab: current job summary, Past jobs, restore a backup, device data; then help: how to use, accuracy limits, what the product is and is not, sources, version. iOS install hint; `navigator.storage.persist()` requested after the first save.
- **Tree Inventory Report** (`lib/report.js`, jsPDF, letter): cover (job info, prepared-by, disclaimer box), summary by species and the **protected-tree count & mitigation worksheet**, tree table (landscape), location sketch page, accuracy statement citing GPS.gov plus the known-point checks, data sources (incl. "Escambia County IMAGiNE GIS" credit), limitations; page footer "Locations approximate, for field reference only. Not a survey." on every page. If the job has parcel IDs and the phone is online the report fetches and caches the parcel outline; offline it draws trees only.
- **Parcel sketch page** (`desktop.html` + `desktop.js` + `lib/sketch.js` + `lib/parcels.js`): works on desktop and phone. Trees from a job on this device, a job backup JSON, a tree log CSV or a PNEZD CSV. Parcels for **City of Pensacola (Escambia layer), Escambia, Santa Rosa** (and Okaloosa) from live county ArcGIS REST; the outline is cached into the job so the phone report can use it offline. Sketch: numbered tag labels with overlap avoidance and leader lines, legend, grid north arrow, scale bar with "1 in = X ft", title block (job, client, site, parcels, jurisdiction, date, CRS, prepared by), tree table with Point #, accuracy statement and disclaimer. **PNG/PDF at Letter (11x8.5) or Tabloid (17x11)**, plus the report PDF.

## 2. Architecture
Static files only, no server or accounts. Libraries are vendored in `vendor/` and are free/open: Leaflet 1.9.4 (BSD-2), proj4js 2.22 (MIT), SheetJS CE 0.20.3 (Apache-2.0), jsPDF (MIT). The photo zip writer is ~40 lines in `lib/zip.js` (store-only, CRC32).
- `lib/core.js` (browser + Node): product config, CRS registry, conversion, averaging, CSV/PNEZD/tree log/XLSX builders, species thresholds and `suggestStatus`, `offsetFt`/`checkVerdict`, `summarize`, validation.
- `lib/store.js`: IndexedDB `zt-tree-survey` **version 2** (name kept so v0.x data carries over) with stores `jobs`, `trees` (index `jobId`), `photos`, `checks` (index `jobId`); settings in localStorage (`zts:` keys).
- Service worker (`sw.js`): cache-first app shell; cache name **`zt-tree-inventory-v1.0.1`**. **Bump the cache name on every shell-file change.** County GIS and basemap requests go straight to the network.
- Deploy file list (everything is static): `index.html, desktop.html, styles.css, field.js, desktop.js, sw.js, manifest.webmanifest, jurisdictions.json, lib/{core,store,zip,parcels,sketch,report}.js, vendor/{proj4.js, xlsx.full.min.js, jspdf.umd.min.js, leaflet.js, leaflet.css, images/*.png}, icons/icon-{180,192,512}.png`. Not needed on the server: `tests/`, `sample/`, `screenshots/`, `*.md`.

## 3. Coordinates (verified)
- Default **EPSG:2238 = "NAD83 / Florida North (ftUS)"** (name from https://epsg.io/2238.wkt, fetched 2026-10-17). Also EPSG:2236 (FL East ftUS), 2237 (FL West ftUS), 6441 (NAD83(2011) FL North ftUS) and 2883 (NAD83(HARN) FL North ftUS, Escambia GIS native). Users can add more by pasting a code and proj4 string, which is validated.
- The proj4 strings in `lib/core.js` match `https://epsg.io/<code>.proj4` exactly for all five codes (re-fetched 2026-10-17; epsg.io only adds a trailing `+type=crs`).
- Datum: phone GPS is WGS84. No WGS84→NAD83 shift is applied (about 1–2 m in FL), which is far below phone GPS error, and the outputs say so.
- **NOAA NGS NCAT check** (`tests/check_conversion.js`): see §8 for the latest run and response IDs.

## 4. Data sources and terms of use
### 4.1 Parcels (synced from `/workspace/products/parcel-filter/app/jurisdictions.json`, read-only, on 2026-10-17)
| County | Layer | ID field(s) | Live test 2026-10-17 |
|---|---|---|---|
| Escambia | `https://gismaps.myescambia.com/arcgis/rest/services/Individual_Layers/parcels/FeatureServer/0` | `REFNUM` (e.g. 03-1S-31-1500-001-003) **and** `REFERENCE` (031S311500001003); both are queried | ~0.4 s, CORS `*` |
| Santa Rosa | `https://cloud.santarosa.fl.gov/arcgis/rest/services/SRCAgencies/SRCAddressParcelData/MapServer/1` | `Parcel` (e.g. 34-2N-28-0570-00A00-0190) | ~0.3 s, CORS origin echoed |
| Okaloosa | `https://okgis.myokaloosa.com/arcgis/rest/services/Land-Ownership/Parcels/MapServer/0` | `PATPCL_PIN` (e.g. 18-3N-23-0000-0034-001B); address field not mapped (meaning of PATPCL_ADDR1 unverified) | ~0.35 s, CORS `*` |

**Escambia source choice:** switched from v0.1's `Escambia_County/MapServer/0` (field `REFERENCE`) to Parcel Filter's `Individual_Layers/parcels/FeatureServer/0` with `REFNUM`. Testing showed it is not worse: for parcel 031S311500001003 both returned identical geometry (0.0° max vertex difference, 25 vertices, same as the saved fixture), similar speed (~0.4–0.5 s), CORS allowed on both. The FeatureServer also carries `REFERENCE`, so the app queries `REFNUM IN (...) OR REFERENCE IN (...)` and users can type either format. One source for both products.

### 4.2 Terms of use (as found by the Parcel Filter workstream; not legal advice)
| Source | What it says | Commercial-reuse language | URL |
|---|---|---|---|
| Escambia County Property Appraiser | Assessment data is mainly for the current tax roll; other uses not warranted. Parcels are **NOT survey quality**; maps approximate. | None found. | https://escpa.org/default.aspx, https://www.escpa.org/MapMain.aspx |
| Escambia County IMAGiNE GIS | Not a legal representation; user responsible for conclusions; acknowledge Escambia County IMAGiNE GIS as a source. | ⚠ "Data in its original form shall not be sold for profit." | https://myescambia.com/docs/default-source/sharepoint-developmental-services/gis-fee-schedule.pdf |
| Santa Rosa County BOCC GIS | No warranty on accuracy, completeness, currency or suitability; no liability; no duty to maintain. | None found. | https://www.santarosa.fl.gov/470/Mapping-GIS/ |
| Okaloosa County PA / GIS | Appraisal purposes only; not for conveyances; not survey data; "as is"; may be out of date. | None found. | https://www.okaloosapa.com/gis-mapping/, https://gis.myokaloosa.com/gisdata/ftp_DataReadmefile.pdf |

City of Pensacola jobs use the Escambia layer (the city is inside Escambia County). The sketch page shows each county's owner, freshness note and disclaimer under the parcel status. Parcel data is queried live on each load; nothing is stored or resold.

### 4.3 Sketch background map
Same as Parcel Filter's commercial-use basemap choice: its default `shared.basemaps` entry **`usgs-imagery`, "Aerial: USGS imagery (NAIP)"** (`https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`), "Imagery: USGS The National Map / USDA NAIP (public domain)", U.S. public domain so commercial use is allowed (https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits, https://www.fpacbc.usda.gov/geospatial-services/customer-services). Re-read from Parcel Filter's `jurisdictions.json` at 08:12 CT, 2026-10-17. Max native zoom 16 (~2 m/px, soft at parcel scale); CORS `*`, so PNG/PDF export works. It is used for both the desktop Leaflet map ("same as sketch") and the sketch background, replacing v0.1's NAIP Plus exportImage call (which timed out). To switch, replace the `basemap` entry in this app's `jurisdictions.json` (any CORS-enabled XYZ URL); no code change.

### 4.4 Other sources
- GPS accuracy: GPS.gov, "GPS-enabled smartphones are typically accurate to within a 4.9 m (16 ft.) radius under open sky... However, their accuracy worsens near buildings, bridges, and trees." https://www.gps.gov/gps-accuracy (re-checked 2026-10-17).
- CRS definitions: epsg.io (§3). NCAT: https://geodesy.noaa.gov/api/ncat/llh (§8).
- Calculator field names, pick lists and DBH thresholds (`SPECIES` columns C–I) plus the rule logic in `p2_rules.py`: `/workspace/products/tree-mitigation-calculator/src/parts/p4_inventory.py` (COLS) and `p1_data.py` (SPECIES, CONDS, ACTIONS, YN), read-only.


### 4.5 Florida law used for the wording rules (section 12)
All from the Florida Statutes (2025) on flsenate.gov, fetched 2026-10-22. Not legal advice.
| Statute | What it says (summary) | URL |
|---|---|---|
| 471.005(5), (6) | "Engineer" means a person licensed under ch. 471; "Engineer intern" is a person who has passed the fundamentals exam (not licensed to practice). | https://www.flsenate.gov/Laws/Statutes/2025/471.005 |
| 471.031(1)(b) | No person may use the name or title "professional engineer" or "engineer" or any other title tending to indicate a license, unless licensed. | https://www.flsenate.gov/Laws/Statutes/2025/471.031 |
| 472.005(3), (4) | Defines "surveyor and mapper" and the practice of surveying and mapping, including determining/locating the position of features on the earth's surface. | https://www.flsenate.gov/Laws/Statutes/2025/472.005 |
| 472.031(1)(a), (b) | No unlicensed person may practice surveying and mapping or use the title "surveyor" / "surveyor and mapper". | https://www.flsenate.gov/Laws/Statutes/2025/472.031 |
| 481.303(4) | Defines "landscape architecture" (professional services incl. planning and design of land). | https://www.flsenate.gov/Laws/Statutes/2025/481.303 |
| 481.323(1)(a), (b) | No unlicensed person may practice landscape architecture or use the titles "landscape architect" / "landscape architecture". | https://www.flsenate.gov/Laws/Statutes/2025/481.323 |
| 163.045 | Tree pruning/removal on residential property: documentation of danger must come from an ISA certified arborist or a Florida licensed landscape architect (Tree Risk Assessment BMP). | https://www.flsenate.gov/Laws/Statutes/2025/163.045 |

## 5. Accuracy (shown in the app, export headers, PNEZD notes, sketch and report)
Phone GPS is roughly 10–30 ft and not survey grade (GPS.gov, §4.4). Tree canopy is the worst case, so averaging helps but doesn't fix it. The client's licensed surveyor locates the tags. Elevation defaults to 0.00, and phone altitude is opt-in and labelled unreliable. Manual positions have unknown accuracy and are labelled. v1.0 adds a hard warning above the job limit (default 30 ft) and the known-point **Field accuracy check** so each job can carry measured offsets, not just the phone's estimate.

## 6. Tie-in with the tree calculator (ON HOLD, not modified)
Field names match `tree-mitigation-calculator`; the species pick list and conditions are copied from `src/parts/p1_data.py` (verified identical 2026-10-17). The XLSX "Calculator paste" sheet has the calculator's 13 Tree Inventory input columns in order, header text identical (checked by `validate_exports.py`), now filled for G–L from the optional mitigation inputs. Since v1.0.1 the app records no proposed action: column F ("Proposed action") is kept as a header with blank cells so the paste stays column-for-column, and the sheet's note says so (enter actions in the calculator if needed). Unlisted species map to "Other / unlisted species", with the field name kept in the notes. Blank Y/N cells are read by the calculator as not "Y" and blank % as 0 (from its formulas), and the paste sheet says so.
Multi-trunk DBH: √(sum of squared stem DBHs), rounded to 0.1 in, per Pensacola LDC 12-6-2(e) (calculator rule PNS-06, VERIFIED). Escambia and Santa Rosa methods are UNVERIFIED in the calculator (ESC-19, SR-24); the app says so next to the result and only fills DBH when you tap "Use combined DBH".
Protected?/Heritage? in the app are field calls. v1.0 **suggests** them from the calculator's own thresholds (`suggestStatus` in `lib/core.js`, mirroring calculator columns S/T: PNS App. A min DBH and heritage = 4× min (12-6-2(d)); ESC protected 12 in / heritage 60 in with pine, cherry laurel, turkey oak and FISC invasive exemptions (DSM 2-1.1, 2-3.1); SR small species 4 in / large 8 in, heritage 36 in south of the Yellow River (live oak 24 in) and 48 in north, north live oak 24–48 in = POSSIBLE (code conflict SR-09), champion trees protected; dead trees not counted). Suggestions are labelled "suggested, field judgement" and are overwritten only until the user taps Y/N. The calculator computes its own values; these columns are not pasted.


## 7. Path to the iPhone, and decisions for Zach
GPS and the service worker need **HTTPS** on iPhone (plain `http://<LAN-IP>` from a laptop will not get location). Free options (none set up; each needs Zach's decision):
1. **Local, no account:** serve from a laptop over local HTTPS with a self-signed certificate (e.g. mkcert) and install/trust its root certificate profile on the iPhone. Private, $0, but fiddly, and the laptop must be on the same Wi-Fi.
2. **Temporary tunnel, no account:** Cloudflare "quick tunnel" (`cloudflared tunnel --url http://localhost:8777`) gives a random `https://*.trycloudflare.com` URL while the laptop runs it. $0; the URL is public but unguessable; not for long-term use.
3. **Free static hosting (needs an account, public by default):** Cloudflare Pages (can be put behind Cloudflare Access for private testing, free tier), GitHub Pages (free for public repos), Netlify free tier. Publishing is public-facing, so it needs Zach's approval.
Then on the iPhone: Safari > Share > Add to Home Screen. iOS can evict PWA storage after long non-use, so export or back up after each job.
4. **Capacitor wrap (later, $0 to build):** same code, plus `@capacitor/geolocation`, `@capacitor/camera` and filesystem/share plugins, giving native storage that iOS won't evict. Building requires a Mac with Xcode.
The existing noindex preview (redeployed by Webby, not by this workstream) is already HTTPS, which is the simplest way to test on the iPhone.
5. **App Store:** the Apple Developer Program costs **$99/yr. This needs Zach's approval before enrolling.** It also needs a privacy policy (location stays on the device), App Review, and an EI-only disclaimer in the listing.


## 8. Tests (see `tests/`; latest run results in section 9)
- `check_conversion.js`: proj4js (vendored) vs NOAA NGS NCAT API, 5 points (FL N ×3, FL E, FL W), tolerance 0.01 ft. Results and NCAT response IDs in `check_conversion_results.json`.
- `make_sample.js` + `validate_exports.py`: a FAKE job (ESC) with 5 fake trees inside real Escambia parcel 03-1S-31-1500-001-003 (one manual, one multi-trunk, one unlisted species, one with mitigation inputs) and one fake accuracy check (8.5 ft N, 8.5 ft E → 12.02 ft, PASS). Checks: PNEZD 5×5 numeric, no header, version in the file name; NOTES carries product name/version, CRS, accuracy, arborist note and the disclaimer; tree log manual row has blank accuracy; suggested-status columns (ESC live oak 32 in → Y; longleaf pine exempt → N); XLSX sheets Tree Log / Calculator paste / PNEZD / About / Accuracy checks; calculator header matches; pyproj independently reproduces N/E; job backup JSON; no "tree survey" wording in outputs; PLAN.md disclaimer equals the app's.
- `browser_test.js`: headless Chrome at **390x844** with an iPhone user agent and simulated jittered GPS. Covers the current-job model (opens on Capture, no Job tab, auto name, header-chip sheet, once-only export details sheet, Finish job & start new with/without export reminder, Past jobs reopen/export/delete, restore into Past jobs, migration of several open jobs), legacy trees carrying a "Proposed action" value, no action in any output, capture with averaging, auto tag #, species search, suggestions, duplicate-tag block, hard accuracy warning + flagged save, edit with Keep/Use-new toggle, undo of save and delete, permission-denied card, accuracy check (known point → offset), every export incl. the **report PDF** (parsed for text with pdftotext) and photos zip, restore, service worker cache name, **offline reload + offline capture + offline report**, sketch page at 390x844 (job deep link, cached parcels, letter and 11x17 PDF), live parcel loads for Pensacola/Escambia/Santa Rosa, a **banned-wording scan** of every screen and the report, product name consistency, and screenshots. **Exits 1 on any failed check, page error or console error.** Run: `python3 -m http.server 8777 --bind 127.0.0.1` in the app folder, then `TS_PORT=8777 NODE_PATH=<dir with puppeteer-core> node tests/browser_test.js`.

## 9. Status log
- 2026-10-17 v0.1 (Product Shop): prototype, Escambia only, NAIP aerial.
- 2026-10-17 v0.2 (takeover): PLAN merged; manual positions = accuracy unknown; PNEZD NOTES; mitigation inputs + multi-trunk; Escambia FeatureServer/REFNUM, Santa Rosa + Okaloosa; USGS basemap; cache v0.2.
- 2026-10-22 v1.0.0: see section 1 and `CHANGELOG.md`.
- 2026-10-22 v1.0.1: "Proposed action" removed from capture and every output (blank header kept only in the XLSX Calculator paste); single current-job model (no Job tab, header job chip, once-only export details sheet, Finish job & start new, More › Past jobs, migration). Cache `zt-tree-inventory-v1.0.1`.
- Latest test run, 2026-10-22 ~23:02 CT, v1.0.1 (all pass):
  - `check_conversion.js`: 5/5 within 0.01 ft (max 0.001 ft). NOAA NCAT response IDs: FLN-Pensacola 1792728044657, FLN-Bristol Park 1792728044929, FLN-Tallahassee 1792728044944, FLE-Orlando 1792728044957, FLW-Tampa 1792728044970.
  - `make_sample.js` + `validate_exports.py`: ALL EXPORT CHECKS PASS (pyproj max diff 0.0021 ft; accuracy-check sample 12.02 ft PASS).
  - `browser_test.js` at 390x844 (iPhone UA) + offline: 118/118 checks, 0 page errors, 0 console errors. Report PDF 6 pages (342 KB) at `sample/sample_Tree_Inventory_Report.pdf`; sketch PDFs `sample/sample_sketch_letter.pdf`, `sample/sample_sketch_11x17.pdf`; screenshots in `screenshots/`.

## 10. Selling the data (per job; nothing public or priced without Zach's approval)
- Sell per-job **tree inventory data** packages (report PDF + PNEZD + tree log + photos + sketch) to engineers, landscape architects and developers. The client's licensed surveyor locates the tags; the client's licensed professional uses the data in their own design/permit work.
- Scope letter should repeat section 12 wording and state that condition entries are visual notes and no tree risk assessment is performed.
- Constraint: Escambia GIS says "Data in its original form shall not be sold for profit". Sell the field data and the work, not the county data; query parcels live, show them only as a sketch backdrop and credit "Escambia County Property Appraiser / IMAGiNE GIS".

## 11. Limits
- Not survey grade. No RTK/GNSS receiver support (a Bluetooth receiver is a possible future add; out of scope).
- iOS Safari web geolocation has no raw GNSS, no fix-quality metadata beyond `accuracy`, and the browser must stay in the foreground. Averaging is tested with simulated GPS only until the home test-run (`HOME_TEST_CHECKLIST.md`).
- Parcel lines are appraiser GIS (not survey quality). County services can be slow or down.
- Sketch imagery tops out at zoom 16 (~2 m/px).
- Photos are stored in IndexedDB; iOS can evict web-app storage after long non-use. Export a job backup after each job.

## 12. Wording rules (legal; see §4.5 for sources)
User-facing text and outputs:
- **Use:** "tree inventory", "tree data collection", "GPS tree mapping (approximate, not a survey)", "protected-tree count & mitigation worksheet", "Tree Inventory Report", "Tree Location Sketch (approximate)".
- **Never** call the work a survey, an engineering service, an arborist assessment, a tree risk/hazard assessment, a tree protection plan or landscape architecture, and never call Zach an engineer, arborist or surveyor. His credit is exactly "Zach Taylor, EI (Engineer Intern), ZT, LLC".
- **Always keep:** "Locations approximate, for field reference only. Not a survey."; "Tool, not engineering or surveying advice"; "the client's licensed surveyor locates the tags"; "Tree condition and risk determinations require an ISA Certified Arborist" (condition = visual field note); protected/heritage flags are "suggested, field judgement".
- Negations such as "not a survey" and "not a licensed professional engineer, surveyor, landscape architect or arborist" are allowed. `browser_test.js` scans every screen and the report for banned wording.
