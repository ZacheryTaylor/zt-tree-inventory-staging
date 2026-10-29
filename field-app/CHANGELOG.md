# Changelog: ZT Tree Inventory (folder `tree-survey-app`)

## 1.0.1 (2026-10-22): less friction, no proposed actions
Removed
- **"Proposed action" field** everywhere: capture form, Trees list, job display, tree log CSV and XLSX "Tree Log", Tree Inventory Report (no Action column; the worksheet no longer counts removals), sketch table and job backups. Which trees are removed or preserved is decided by the client's design team. **Exception:** the XLSX "Calculator paste" sheet keeps the "Proposed action" header with blank cells so the paste still lines up column-for-column with the calculator's 13 inputs (calculator not modified); a note on that sheet says so.
- Old saved trees (and old job backups) that carry an action load without errors; the value is ignored and dropped on the next save, export or restore.
- The Job tab, job switching, duplicate and archive buttons.

Changed: single "current job" model
- The app always opens on **Capture** in the current job. No job prompt, picker or required field.
- First launch (and after finishing a job) auto-creates a job named "Job YYYY-MM-DD", plus the first parcel ID or the jurisdiction when known (renames itself until you type your own name). A new job carries over jurisdiction, CRS, GPS settings, accuracy limit, crew and start point #.
- Every job detail is optional and editable any time: tap the job name chip in the header (a bottom sheet; autosaves).
- At the first export or report of a job, the same sheet is offered **once** (prefilled, optional, Skip or Save & continue); it is not shown again for that job.
- Export tab: **Finish job & start new** confirms (reminds you to export first if nothing was exported), moves the job to Past jobs and starts a fresh one.
- Tabs are now Capture | Trees | Check | Export | **More**. More holds the current job summary, **Past jobs** (Reopen, Export .zip, Delete), restore and device data, then help.
- Restoring a job backup puts it in Past jobs (Reopen to work on it) instead of switching.
- Migration from 1.0.0 multi-job data: the last open job stays current (or the most recently used one); every other job goes to Past jobs. v0.x orphan trees still migrate into a "(migrated)" job.
- Sketch page job picker lists the current job first, then past jobs.
- Version 1.0.1; service worker cache `zt-tree-inventory-v1.0.1`.

Tests
- `browser_test.js` (118 checks): no Job tab, opens on Capture with the auto name, chip sheet and auto naming, once-only export details sheet, Finish job (with and without the export reminder), Past jobs reopen/export/delete, restore into Past jobs, migration of several open jobs, legacy tree with an action value, no action in any output, blank calculator column + note. New screenshots `field_job_sheet_iphone.png`, `field_export_prompt_iphone.png`, `field_past_jobs_iphone.png`, `field_more_iphone.png` (replace `field_job_iphone.png`, `field_jobs_iphone.png`, `field_help_iphone.png`).
- `validate_exports.py`: v1.0.1 names, no Proposed action in the tree log or backup, blank calculator column + note.

## 1.0.0 (2026-10-22): field-ready release
**Renamed** the user-facing product from "ZT Tree Survey" to **ZT Tree Inventory** (one config string, `PRODUCT_NAME` in `lib/core.js`; decision for Zach). All wording follows PLAN.md §12: tree inventory / GPS tree mapping data only, never a survey, engineering, arborist or landscape architecture product.

Added
- **Jobs**: many jobs per device (client, site, parcel IDs, jurisdiction, field date, crew, notes, CRS, GPS settings, accuracy limit); switch, duplicate (with trees/photos), archive. Exports are per job. v0.x data migrates into a "(migrated)" job.
- **One-handed iPhone capture**: tabs (Capture, Trees, Job, Check, Export, Help); sticky bottom bar (Capture, live accuracy chip, Save); ≥48 px targets; high-contrast mode.
- Auto-increment tag # (Tag 1 prefilled); species search plus recent chips plus "did you mean"; condition and action chips; condition labelled as a visual field note, with a warning on "Hazard – documented".
- **Suggested protected/heritage** from Pensacola / Escambia / Santa Rosa DBH thresholds (same rules as the mitigation calculator), labelled "suggested, field judgement".
- **Hard accuracy warning** above the job limit (default 30 ft): re-capture, or save with a reason; the tree is flagged in all outputs.
- GPS robustness: transient errors no longer abort; "Weak signal, still trying…"; "Stopped at k of N"; a permission-denied card with iPhone Settings steps.
- **Explicit Keep / Use new GPS fix toggle** when editing (replaces the v0.2 confirm dialog). Undo for save, edit and delete. Duplicate-tag warning and block.
- **Field accuracy check** (Check tab): known point (N/E or lat/lon) vs averaged phone fix, giving dN, dE, horizontal offset (ft) and PASS/FAIL. Included in the XLSX ("Accuracy checks") and the report.
- **Tree Inventory Report PDF**: cover, summary, protected-tree count & mitigation worksheet, tree table, sketch, accuracy statement (GPS.gov), checks, data sources (IMAGiNE GIS credit), limitations.
- Exports via the iOS Share sheet with a download fallback: photos `.zip`, "Everything (.zip)", job backup/restore (restore creates a new job).
- **Sketch page**: City of Pensacola / Escambia / Santa Rosa (plus Okaloosa) parcels; job deep link from the phone (`desktop.html?job=<id>&auto=1`); job JSON import; parcel outline cached into the job for offline use; title block; tag-label de-confliction; Point # in the legend table; Letter and **11x17** PNG/PDF; report export.
- Help/About page, iOS install hint, `navigator.storage.persist()`, favicon, `noindex` meta.
- `HOME_TEST_CHECKLIST.md`; Florida statute sources for the wording rules (PLAN.md §4.5).

Changed
- IndexedDB schema v2 (`jobs`, `trees` by `jobId`, `photos`, `checks`); DB name unchanged.
- The disclaimer now includes the ISA Certified Arborist sentence. Tree log gains suggested-status and accuracy-flag columns; XLSX gains an "Accuracy checks" sheet.
- The species list now lives in `lib/core.js` (with thresholds); `lib/species.js` and `species.json` removed.
- Service worker cache `zt-tree-inventory-v1.0.0`; the shell adds `lib/zip.js`, `lib/parcels.js` and `lib/report.js`. Only successful responses are cached.
- Toasts no longer block taps on the content underneath.

Tests
- `browser_test.js` rewritten (94 checks): jobs, capture, suggestions, warnings, undo, permission denied, accuracy check, all exports incl. the report PDF (text-checked with pdftotext), zips, restore, offline reload/capture/report, sketch at 390x844 (letter and 11x17, offline), live parcels, banned-wording scan, product-name consistency, screenshots.
- `validate_exports.py`: new sheet, suggestion columns, job backup, wording.

## 0.2 (2026-10-17)
Takeover pass: manual positions = accuracy unknown; PNEZD NOTES file; mitigation inputs and multi-trunk DBH; Escambia FeatureServer/REFNUM; Santa Rosa and Okaloosa; USGS basemap; cache v0.2.

## 0.1 (2026-10-17)
Product Shop prototype.
