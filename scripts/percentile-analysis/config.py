"""
Shared configuration and utilities for Medicare Star Ratings percentile analysis.

Two percentile methods are available:
  - PERCENTRANK.INC (Excel-compatible): (count below) / (n - 1) * 100
  - percentileofscore (scipy): (count at or below) / n * 100

PERCENTRANK.INC is the industry standard used by CMS and most health plan analysts.
"""

import re
import numpy as np

# ============================================================
# FILE CONFIGURATION
# Each year: (csv_path, data_start_row, measure_code_row)
#   - data_start_row: row index where contract data begins
#   - measure_code_row: row index containing measure codes (e.g., "C01: Breast Cancer Screening")
#
# NOTE: 2025 has a different CSV structure (single header row)
# ============================================================

DATA_DIR = "../../data"  # Relative to this script directory, adjust as needed

FILES = {
    2022: ("2022 Star Ratings Data Table - Measure Data (Oct 06 2021).csv", 4, 2),
    2023: ("2023 Star Ratings Data Table - Measure Data (Oct 04 2022).csv", 4, 2),
    2024: ("2024 Star Ratings Data Table - Measure Data (Oct 12 2023).csv", 4, 2),
    2025: ("2025 Star Ratings Data Table - Measure Data (Oct 11 2024).csv", 1, 0),  # Different structure!
    2026: ("2026 Star Ratings Data Table - Measure Data (Oct 8 2025).csv", 4, 2),
}

CUT_POINTS_FILE = "Stars 2016-2028 Cut Points 12.2025 (1).xlsx"

# ============================================================
# CONTRACT FILTERS
# ============================================================

# H = MA local plans, R = MA regional plans
CONTRACT_PREFIXES = ("H", "R")

# ============================================================
# INVERTED MEASURES
# Lower score = better performance for these measures.
# Percentiles are flipped so higher percentile always = better.
# ============================================================

INVERTED_KEYWORDS = ["complaint", "choosing to leave", "readmission"]


def is_inverted(name: str) -> bool:
    return any(kw in name.lower() for kw in INVERTED_KEYWORDS)


# ============================================================
# NAME NORMALIZATION & MATCHING
# Needed because cut point names differ from measure data names
# ============================================================

# Manual mapping: cut point name -> normalized measure data name fragment
MANUAL_CP_TO_NORM = {
    "Glycemic Status Diabetes - GSD": "blood sugar controlled",
    "COA - Medication Review": "care for older adults medication review",
    "COA - Pain Assessment": "care for older adults pain assessment",
    "Call Center - FFI / TTY (Part C)": "call center foreign language interpreter and tty availability partc",
    "Call Center - FFI / TTY (Part D)": "call center foreign language interpreter and tty availability partd",
    "Getting Appts and Care Quickly": "getting appointments and care quickly",
    "Getting Needed RX Drugs": "getting needed prescription drugs",
    "Med Adh for Cholesterol": "medication adherence for cholesterol (statins)",
    "Med Adh for Diabetes Meds": "medication adherence for diabetes medications",
    "Med Adh for Hypertension": "medication adherence for hypertension (ras antagonists)",
    "Med Rec Post-Discharge": "medication reconciliation post-discharge",
    "MTM Program Comp Rate-CMR": "mtm program completion rate for cmr",
    "Osteo Mgmt in Women W Fracture": "osteoporosis management in women who had a fracture",
    "Plan Makes Timely Decs - Appeals": "plan makes timely decisions about appeals",
    "Statin Therapy-Patients with CVD": "statin therapy for patients with cardiovascular disease",
    "Statin Use with Diabetes (Part D)": "statin use in persons with diabetes (supd)",
    "SNP Care Management": "special needs plan (snp) care management",
    "Members Choosing to Leave": "members choosing to leave the plan",
    "Controlling Blood Pressure": "controlling",
    "Transitions of Care (Average)": "transitions of care",
    "Follow-up after Emergency Department Visit for Patients with Multiple Chronic Conditions (FMC)": "follow-up after emergency department visit",
    "Kidney Health Evaluation for Patients With Diabetes": "kidney disease monitoring",
    "KED (Kidney Health Evaluation for Patients with Diabetes)": "kidney health evaluation for patients with diabetes",
    "Plan All Cause Readmissions": "plan all-cause readmissions",
}


def normalize(s: str) -> str:
    """Normalize a measure name for fuzzy matching.
    Strips measure code prefix, replaces non-ASCII with space, lowercases.
    """
    s2 = re.sub(r"^[CD]\d+:\s*", "", s)
    s2 = re.sub(r"[^\x20-\x7e]", " ", s2)  # Strip all non-ASCII (em-dashes, etc.)
    s2 = re.sub(r"\s+", " ", s2).strip().lower()
    return s2


# ============================================================
# PERCENTILE METHODS
# ============================================================


def percentrank_inc(arr: np.ndarray, x: float) -> float:
    """Excel's PERCENTRANK.INC: (count of values strictly below x) / (n - 1) * 100.
    Industry standard for Medicare Star Ratings analysis.
    """
    n = len(arr)
    if n <= 1:
        return np.nan
    below = np.sum(arr < x)
    return round(below / (n - 1) * 100, 1)


def percentrank_inc_inverted(arr: np.ndarray, x: float) -> float:
    """PERCENTRANK.INC for inverted measures (lower = better).
    Returns (count of values strictly above x) / (n - 1) * 100.
    """
    n = len(arr)
    if n <= 1:
        return np.nan
    above = np.sum(arr > x)
    return round(above / (n - 1) * 100, 1)


def percentileofscore_normal(arr: np.ndarray, x: float) -> float:
    """scipy-style percentile: (count of values <= x) / n * 100.
    Alternative method — counts values at or below.
    """
    from scipy import stats
    return round(stats.percentileofscore(arr, x, kind="rank"), 1)


def percentileofscore_inverted(arr: np.ndarray, x: float) -> float:
    """scipy-style percentile for inverted measures.
    Uses negated values to flip the ranking.
    """
    from scipy import stats
    return round(stats.percentileofscore(-arr, -x, kind="rank"), 1)


def calc_percentile(arr: np.ndarray, x: float, inverted: bool = False, method: str = "percentrank_inc") -> float:
    """Calculate percentile using the specified method.

    Args:
        arr: Array of all valid scores for the measure
        x: The score to find the percentile for
        inverted: True if lower score = better performance
        method: "percentrank_inc" (Excel, default) or "percentileofscore" (scipy)

    Returns:
        Percentile as a percentage (0-100)
    """
    if method == "percentrank_inc":
        if inverted:
            return percentrank_inc_inverted(arr, x)
        return percentrank_inc(arr, x)
    elif method == "percentileofscore":
        if inverted:
            return percentileofscore_inverted(arr, x)
        return percentileofscore_normal(arr, x)
    else:
        raise ValueError(f"Unknown method: {method}. Use 'percentrank_inc' or 'percentileofscore'.")
