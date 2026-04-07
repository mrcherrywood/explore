# CMS Clustering Replication 2026 Notes

This note explains the side-by-side comparison in `docs/cms-clustering-replication-2026-side-by-side.csv` between:

- the external workbook `CMS_Star_Ratings_Clustering_Replication.xlsx`
- the workspace replication run from this app

## Scope

This comparison is intentionally strict and apples-to-apples:

- `2026` only
- no guardrails
- same overlapping `34` measures
- same contract-level evaluation logic
- same core methodology family: Tukey outer-fence deletion, 10-fold leave-one-out mean resampling, Ward clustering, and averaged cut points

Overall results on the overlapping `16,607` contract rows:

- Our replication: `81.8%` exact, `99.0%` within-1
- Workbook replication: `82.2%` exact, `99.0%` within-1
- Our predicted star matched the workbook predicted star exactly on `95.0%` of rows

## Reading The CSV

- `ourExactPct` / `workbookExactPct`: exact predicted-star match against the public 2026 actual star
- `exactDiffPts`: our exact-match percentage minus the workbook exact-match percentage
- `predictionAgreementPct`: percent of contract rows where our predicted star exactly matches the workbook predicted star
- `deltaTwoStar` through `deltaFiveStar`: our simulated cut point minus the workbook cut point

Positive threshold deltas mean our threshold is higher. Negative deltas mean our threshold is lower.

## Why The Values Differ

The important point is that the contract universe is already aligned in this strict comparison:

- every overlapping measure has the same contract count in both outputs
- Tukey outlier counts also line up closely, and often exactly

That means most remaining differences are not caused by loading different rows. They mostly come from what happens after the cohort is fixed.

### 1. Fold assignment differences during mean resampling

Both replications use the same high-level resampling idea and the same seed value (`8675309`), but the workbook itself notes that SAS `SURVEYSELECT` can differ from non-SAS implementations. Since the final cut points are the mean across 10 leave-one-fold-out runs, different fold assignments can move the averaged thresholds.

This is the most likely explanation when:

- contract counts match
- outlier counts match
- but threshold values still differ

Example:

- `C02 Colorectal Cancer Screening` has the same contract count (`544`) and same outlier count (`5`)
- but our `3★`, `4★`, and `5★` thresholds are lower than the workbook by `2.0`, `0.4`, and `1.9`
- that is enough to change exact match from `63.4%` in the workbook to `76.7%` in our run

### 2. Ward clustering tie handling on public whole-number scores

The public CMS files only expose whole-number values. That creates many repeated scores, especially around the middle bands. Small differences in how ties are grouped or how cluster boundaries are selected can move thresholds even when the input cohort is the same.

This is especially visible on measures with dense integer piles near the thresholds.

### 3. Small threshold shifts can move many contracts when scores pile up at the boundary

Exact-match percentage is not a direct function of threshold delta size alone. It depends on how many contracts sit near the moved boundary.

Example:

- `C28 Complaints about the Health Plan`
- threshold deltas are tiny: `-0.03`, `0.00`, `+0.01`, `+0.02`
- but exact-match still differs by `+11.7` points

That happens because complaint measures are lower-is-better and the public values are tightly packed near a narrow set of repeated decimals. Tiny boundary changes can reassign a large number of contracts.

The reverse can also happen:

- `C17 Medication Reconciliation Post-Discharge`
- the `2★` threshold differs by `-4.5`
- but exact-match differs by only `+0.4` points

That suggests relatively few contracts were sitting near that specific boundary.

### 4. Inverted measures are more boundary-sensitive

Lower-is-better measures use upper-bound inclusive star assignment. With repeated public values, that makes exact percentages more sensitive to small threshold changes.

Examples:

- `C18 Plan All-Cause Readmissions`
- `C28 Complaints about the Health Plan`
- `D02 Complaints about the Drug Plan`
- `C29` / `D03 Members Choosing to Leave`

Some of these still line up almost perfectly, but when they diverge, they can diverge sharply.

### 5. Some measures are effectively identical, which validates the implementation

Several measures match the workbook exactly or nearly exactly:

- `C05 Improving or Maintaining Mental Health`
- `C16 Improving Bladder Control`
- `C18 Plan All-Cause Readmissions`
- `C19 Statin Therapy for Patients with Cardiovascular Disease`
- `C31 Plan Makes Timely Decisions about Appeals`
- `C32 Reviewing Appeals Decisions`
- `C33` and `D01` Call Center measures
- `D08 Medication Adherence for Diabetes Medications`

These exact or near-exact matches are strong evidence that the core methodology is aligned and that the remaining differences are measure-specific sensitivity, not a wholesale mismatch in approach.

## Practical Interpretation

The safest interpretation of the remaining value differences is:

- the two replications are methodologically aligned
- most remaining differences come from resampling/fold assignment and clustering behavior on tied public values
- exact-match deltas are amplified or muted depending on how many contracts sit right on each threshold boundary

So when the CSV shows a value difference, it usually means one of two things:

- the thresholds landed in slightly different places after resampling and clustering
- or a small threshold shift happened on a measure where many public scores pile up near that cut point

It usually does **not** mean the two runs used a meaningfully different contract universe.
