# Home test-run checklist: ZT Tree Inventory v1.0.1

Goal: before selling any job, prove at home that the app, its exports and its stated **10–30 ft** accuracy hold up on your own iPhone. Plan for about 1.5 hours. Print this page or keep it open on a laptop.

> Tool, not engineering or surveying advice. Locations approximate, for field reference only. Not a survey. Tree condition and risk determinations require an ISA Certified Arborist.

## 0. Before you go outside
- [ ] Get **2 known points** near the house with published coordinates: property corner pins or monuments from your recorded plat/survey (N/E in State Plane ft) or an NGS monument data sheet (lat/lon). Write down each point's coordinates **and where they came from**. County GIS parcel corners are *not* good enough: they are not survey quality.
- [ ] Open the HTTPS copy (the noindex preview) in **Safari** on the iPhone. GPS will not work on plain `http://`.
- [ ] iPhone: Settings › Privacy & Security › Location Services › Safari Websites › **While Using**, with **Precise Location** on.

## 1. Install and go offline
- [ ] Safari › Share › **Add to Home Screen**. Open it from the home-screen icon (it's a separate app with its own storage).
- [ ] More tab: the About line shows **v1.0.1**.
- [ ] Turn on **Airplane Mode** (Wi-Fi off too). Force-quit the app and reopen it. **Pass:** it loads and shows your job.
- [ ] Keep Airplane Mode on for steps 2–4. GPS still works without a data connection; the first fix may just be slower.

## 2. Job setup
- [ ] The app opens straight on Capture with a job already started ("Job <today>"). Optional: tap the job name at the top and fill in "Home test", client "Self", your address, your parcel ID, jurisdiction. Leave CRS at **EPSG:2238** (NAD83 / Florida North, ftUS) unless your known points use a different system. (If you skip this, the app offers the same sheet once at your first export.)
- [ ] GPS settings: readings to average **10**, max wait **45 s**, accuracy warning **30 ft**.

## 3. Capture about 5 trees (Capture tab)
For each tree: stand touching the trunk on the same side each time (for example south), tap **Capture**, wait for "Averaged 10 readings", fill species/DBH/canopy/condition, tap **Save**.
- [ ] Include at least one tree **under heavy canopy or next to the house** (the worst case).
- [ ] Include one **multi-trunk** tree (Multi-trunk › enter stems › Use combined DBH).
- [ ] Take a **photo** of one tree.
- [ ] Try a **duplicate tag** (type an existing tag): you should see the warning and be unable to save.
- [ ] If the accuracy chip turns red (above 30 ft), note it. Try moving a few feet into the open and re-capturing before using "Save anyway".
- [ ] Use **Undo** once after a save, then re-save.
- [ ] **Repeatability:** re-capture 2 of the trees later (at least 30 min apart, a different time of day if you can) as new tags such as 901/902 with a note "repeat of 3". Record each pair's distance from the sketch or the tree log N/E: `sqrt(dN² + dE²)`.

## 4. Field accuracy check (Check tab)
For each known point:
- [ ] Enter its name, its coordinates (N/E in the job CRS, or lat/lon) and the source. Hold the phone directly over the pin/monument and tap **Capture & average on this point**.
- [ ] Repeat each point **3 times** (different times if you can). Write down every offset.

## 5. Export everything (Airplane Mode off now)
Export tab, each one through the Share sheet › **Save to Files** (make a "Home test" folder):
- [ ] Tree Inventory Report (.pdf): open it and check the cover, summary, tree table, sketch, accuracy page with your checks, sources and limitations.
- [ ] PNEZD (.csv) + NOTES (.txt), tree log (.xlsx and .csv), photos (.zip), job backup (.json), Everything (.zip).
- [ ] **Open parcel sketch for this job**: the parcel loads, the trees are numbered, and you can export a Letter and an 11x17 PDF.
- [ ] Restore test: More › Restore a job backup (.json). It appears under More › Past jobs as "(restored)" with the same trees; tap Reopen to work on it, or Delete it.
- [ ] Finish test: Export › **Finish job & start new**. Confirm; a fresh empty job starts on Capture and the old one is under More › Past jobs (Reopen / Export / Delete).

## 6. Office checks
- [ ] **Civil 3D:** Insert › Points from File › format **PNEZD (comma delimited)**, with the coordinate system set to the drawing's FL North ftUS. The points land on the right lot over imagery or the parcel layer. *No Civil 3D?* Load the tree log CSV or PNEZD into the sketch page (desktop.html) and confirm the trees sit where you stood.
- [ ] Open the XLSX: the Tree Log, Calculator paste, PNEZD, About and Accuracy checks sheets are all present. Paste "Calculator paste" rows into the mitigation calculator and confirm the counts match the report worksheet.
- [ ] Read every page of the report as if you were the client engineer. Nothing should call it a survey or call you an engineer, arborist or surveyor.

## 7. Pass / fail (tied to the stated 10–30 ft)
| Test | Pass | Fail → what to do |
|---|---|---|
| Known-point checks (6 total) | every offset **≤ 30 ft**, and most ≤ 16 ft in the open | any > 30 ft: re-test in the open; if it is still over, raise the stated range or the averaging time before selling |
| Repeatability (2 trees) | the two captures of each tree are **≤ 30 ft** apart | > 30 ft: use 20+ readings under canopy; flag canopy trees in the report notes |
| Offline | the app loads and captures in Airplane Mode | stop: do not use on a job until fixed |
| Exports | all 7 files open on the iPhone and on the PC | note which one fails |
| PNEZD in Civil 3D / sketch | points on the right lot, numbered, with correct descriptions | check the CRS (EPSG:2238 ftUS) and the import format |
| Report wording | disclaimer, "Not a survey", ISA arborist sentence, exact credit "Zach Taylor, EI (Engineer Intern), ZT, LLC" | do not send; report the issue |

Record your results (offsets, phone model, iOS version, weather/canopy) in a note. They become the evidence behind the accuracy statement you give clients.
