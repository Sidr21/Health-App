"""Lab results: a catalog of common analytes, unit normalization and conversion to one unit
per analyte, and flags from the reference range. Pure functions.

Documents are read by a model (sources/documents.py), which is good at finding the rows of a
messy report and bad at arithmetic, so everything numeric happens here: the model reports the
value, unit and range exactly as printed, and this module converts and flags them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# A conversion is (scale, offset): canonical = value * scale + offset.
Conv = tuple[float, float]


@dataclass(frozen=True)
class Analyte:
    key: str
    name: str
    category: str
    unit: str  # canonical, as displayed
    convert: dict[str, Conv] = field(default_factory=dict)  # normalized unit -> conversion
    plausible: tuple[float, float] | None = None  # in the canonical unit; outside = misread


def _a(key, name, category, unit, convert=None, plausible=None) -> Analyte:
    return Analyte(key, name, category, unit, convert or {}, plausible)


def _x(scale: float) -> Conv:
    return (scale, 0.0)


CHOL = {"mmol/l": _x(38.67)}
CATEGORIES = [
    "Metabolic",
    "Lipids",
    "Thyroid",
    "Hormones",
    "Vitamins",
    "Iron",
    "Kidney",
    "Liver",
    "Electrolytes",
    "Blood count",
    "Inflammation",
    "Other",
]

CATALOG: dict[str, Analyte] = {
    a.key: a
    for a in [
        # metabolic
        _a("hba1c", "HbA1c", "Metabolic", "%", {"mmol/mol": (0.09148, 2.152)}, (3, 20)),
        _a(
            "glucose_fasting",
            "Fasting glucose",
            "Metabolic",
            "mg/dL",
            {"mmol/l": _x(18.016)},
            (20, 700),
        ),
        _a("glucose", "Glucose", "Metabolic", "mg/dL", {"mmol/l": _x(18.016)}, (20, 900)),
        _a(
            "eag",
            "Estimated average glucose",
            "Metabolic",
            "mg/dL",
            {"mmol/l": _x(18.016)},
            (40, 500),
        ),
        _a(
            "insulin_fasting",
            "Fasting insulin",
            "Metabolic",
            "µIU/mL",
            {"pmol/l": _x(1 / 6)},
            (0.2, 300),
        ),
        _a("homa_ir", "HOMA-IR", "Metabolic", "", None, (0.05, 50)),
        # lipids
        _a("total_cholesterol", "Total cholesterol", "Lipids", "mg/dL", CHOL, (50, 600)),
        _a("hdl", "HDL cholesterol", "Lipids", "mg/dL", CHOL, (5, 200)),
        _a("ldl", "LDL cholesterol", "Lipids", "mg/dL", CHOL, (5, 500)),
        _a("vldl", "VLDL cholesterol", "Lipids", "mg/dL", CHOL, (1, 200)),
        _a("non_hdl", "Non-HDL cholesterol", "Lipids", "mg/dL", CHOL, (10, 550)),
        _a("triglycerides", "Triglycerides", "Lipids", "mg/dL", {"mmol/l": _x(88.57)}, (10, 5000)),
        _a("tc_hdl_ratio", "Total cholesterol / HDL", "Lipids", "", None, (0.5, 20)),
        _a("ldl_hdl_ratio", "LDL / HDL", "Lipids", "", None, (0.1, 15)),
        _a("tg_hdl_ratio", "Triglycerides / HDL", "Lipids", "", None, (0.1, 40)),
        _a("apob", "Apolipoprotein B", "Lipids", "mg/dL", {"g/l": _x(100)}, (10, 300)),
        _a("lpa", "Lipoprotein(a)", "Lipids", "nmol/L", None, (0, 1000)),
        # thyroid
        _a("tsh", "TSH", "Thyroid", "µIU/mL", None, (0.001, 200)),
        _a(
            "t3_total",
            "Total T3",
            "Thyroid",
            "ng/dL",
            {"nmol/l": _x(65.1), "ng/ml": _x(100)},
            (10, 800),
        ),
        _a("t4_total", "Total T4", "Thyroid", "µg/dL", {"nmol/l": _x(1 / 12.87)}, (0.5, 30)),
        _a("free_t3", "Free T3", "Thyroid", "pg/mL", {"pmol/l": _x(1 / 1.536)}, (0.5, 30)),
        _a("free_t4", "Free T4", "Thyroid", "ng/dL", {"pmol/l": _x(1 / 12.87)}, (0.1, 10)),
        # hormones
        _a(
            "testosterone_total",
            "Total testosterone",
            "Hormones",
            "ng/dL",
            {"nmol/l": _x(28.84), "ng/ml": _x(100)},
            (2, 3000),
        ),
        _a(
            "testosterone_free",
            "Free testosterone",
            "Hormones",
            "pg/mL",
            {"pmol/l": _x(0.2884), "ng/dl": _x(10)},
            (0.1, 500),
        ),
        _a("shbg", "SHBG", "Hormones", "nmol/L", None, (1, 300)),
        _a("estradiol", "Estradiol", "Hormones", "pg/mL", {"pmol/l": _x(1 / 3.671)}, (1, 5000)),
        _a("cortisol", "Cortisol", "Hormones", "µg/dL", {"nmol/l": _x(1 / 27.59)}, (0.1, 100)),
        _a("dhea_s", "DHEA-S", "Hormones", "µg/dL", {"umol/l": _x(36.81)}, (1, 1500)),
        _a("psa", "PSA", "Hormones", "ng/mL", {"ug/l": _x(1)}, (0, 1000)),
        # vitamins
        _a(
            "vitamin_d_25oh",
            "Vitamin D (25-OH)",
            "Vitamins",
            "ng/mL",
            {"nmol/l": _x(1 / 2.496)},
            (1, 200),
        ),
        _a("b12", "Vitamin B12", "Vitamins", "pg/mL", {"pmol/l": _x(1.355)}, (50, 5000)),
        _a("folate", "Folate", "Vitamins", "ng/mL", {"nmol/l": _x(1 / 2.266)}, (0.5, 50)),
        _a("magnesium", "Magnesium", "Vitamins", "mg/dL", {"mmol/l": _x(2.431)}, (0.5, 6)),
        _a("homocysteine", "Homocysteine", "Vitamins", "µmol/L", None, (1, 200)),
        # iron
        _a("iron", "Iron", "Iron", "µg/dL", {"umol/l": _x(5.585)}, (5, 500)),
        _a("tibc", "TIBC", "Iron", "µg/dL", {"umol/l": _x(5.585)}, (100, 800)),
        _a("uibc", "UIBC", "Iron", "µg/dL", {"umol/l": _x(5.585)}, (20, 700)),
        _a("transferrin", "Transferrin", "Iron", "mg/dL", {"g/l": _x(100)}, (50, 600)),
        _a("transferrin_sat", "Transferrin saturation", "Iron", "%", None, (1, 100)),
        _a(
            "ferritin",
            "Ferritin",
            "Iron",
            "ng/mL",
            {"ug/l": _x(1), "pmol/l": _x(1 / 2.247)},
            (1, 5000),
        ),
        # kidney
        _a("creatinine", "Creatinine", "Kidney", "mg/dL", {"umol/l": _x(1 / 88.4)}, (0.1, 20)),
        _a("egfr", "eGFR", "Kidney", "mL/min/1.73m²", None, (2, 200)),
        _a("urea", "Urea", "Kidney", "mg/dL", {"mmol/l": _x(6.006)}, (2, 400)),
        _a("bun", "Blood urea nitrogen", "Kidney", "mg/dL", {"mmol/l": _x(2.801)}, (1, 200)),
        _a("bun_creatinine_ratio", "BUN / creatinine", "Kidney", "", None, (1, 100)),
        _a("uric_acid", "Uric acid", "Kidney", "mg/dL", {"umol/l": _x(1 / 59.48)}, (0.5, 20)),
        _a("cystatin_c", "Cystatin C", "Kidney", "mg/L", None, (0.2, 10)),
        # liver
        _a(
            "bilirubin_total",
            "Bilirubin, total",
            "Liver",
            "mg/dL",
            {"umol/l": _x(1 / 17.1)},
            (0.05, 40),
        ),
        _a(
            "bilirubin_direct",
            "Bilirubin, direct",
            "Liver",
            "mg/dL",
            {"umol/l": _x(1 / 17.1)},
            (0, 30),
        ),
        _a(
            "bilirubin_indirect",
            "Bilirubin, indirect",
            "Liver",
            "mg/dL",
            {"umol/l": _x(1 / 17.1)},
            (0, 30),
        ),
        _a("alt", "ALT (SGPT)", "Liver", "U/L", {"ukat/l": _x(60)}, (1, 5000)),
        _a("ast", "AST (SGOT)", "Liver", "U/L", {"ukat/l": _x(60)}, (1, 5000)),
        _a("alp", "Alkaline phosphatase", "Liver", "U/L", {"ukat/l": _x(60)}, (5, 3000)),
        _a("ggt", "GGT", "Liver", "U/L", {"ukat/l": _x(60)}, (1, 3000)),
        _a("total_protein", "Total protein", "Liver", "g/dL", {"g/l": _x(0.1)}, (2, 15)),
        _a("albumin", "Albumin", "Liver", "g/dL", {"g/l": _x(0.1)}, (1, 8)),
        _a("globulin", "Globulin", "Liver", "g/dL", {"g/l": _x(0.1)}, (0.5, 10)),
        _a("ag_ratio", "Albumin / globulin", "Liver", "", None, (0.1, 5)),
        # electrolytes and minerals
        _a("sodium", "Sodium", "Electrolytes", "mmol/L", {"meq/l": _x(1)}, (100, 180)),
        _a("potassium", "Potassium", "Electrolytes", "mmol/L", {"meq/l": _x(1)}, (1.5, 9)),
        _a("chloride", "Chloride", "Electrolytes", "mmol/L", {"meq/l": _x(1)}, (60, 140)),
        _a("bicarbonate", "Bicarbonate", "Electrolytes", "mmol/L", {"meq/l": _x(1)}, (5, 50)),
        _a("calcium", "Calcium", "Electrolytes", "mg/dL", {"mmol/l": _x(4.008)}, (4, 16)),
        _a("phosphorus", "Phosphorus", "Electrolytes", "mg/dL", {"mmol/l": _x(3.097)}, (0.5, 12)),
        # blood count
        _a(
            "hemoglobin",
            "Hemoglobin",
            "Blood count",
            "g/dL",
            {"g/l": _x(0.1), "mmol/l": _x(1.611)},
            (3, 25),
        ),
        _a("hematocrit", "Hematocrit", "Blood count", "%", {"l/l": _x(100)}, (10, 75)),
        _a("rbc", "Red cells", "Blood count", "10⁶/µL", None, (1, 9)),
        _a("mcv", "MCV", "Blood count", "fL", None, (50, 150)),
        _a("mch", "MCH", "Blood count", "pg", None, (10, 50)),
        _a("mchc", "MCHC", "Blood count", "g/dL", {"g/l": _x(0.1)}, (20, 45)),
        _a("rdw", "RDW", "Blood count", "%", None, (5, 40)),
        _a("wbc", "White cells", "Blood count", "10³/µL", {"/ul": _x(0.001)}, (0.3, 100)),
        _a(
            "platelets",
            "Platelets",
            "Blood count",
            "10³/µL",
            {"lakh/ul": _x(100), "/ul": _x(0.001)},
            (5, 2000),
        ),
        _a("mpv", "MPV", "Blood count", "fL", None, (4, 20)),
        _a("neutrophils_pct", "Neutrophils", "Blood count", "%", None, (0, 100)),
        _a("lymphocytes_pct", "Lymphocytes", "Blood count", "%", None, (0, 100)),
        _a("monocytes_pct", "Monocytes", "Blood count", "%", None, (0, 100)),
        _a("eosinophils_pct", "Eosinophils", "Blood count", "%", None, (0, 100)),
        _a("basophils_pct", "Basophils", "Blood count", "%", None, (0, 100)),
        _a(
            "neutrophils_abs",
            "Neutrophils, absolute",
            "Blood count",
            "10³/µL",
            {"/ul": _x(0.001)},
            (0, 80),
        ),
        _a(
            "lymphocytes_abs",
            "Lymphocytes, absolute",
            "Blood count",
            "10³/µL",
            {"/ul": _x(0.001)},
            (0, 50),
        ),
        # inflammation
        _a("crp", "C-reactive protein", "Inflammation", "mg/L", {"mg/dl": _x(10)}, (0, 500)),
        _a("hs_crp", "hs-CRP", "Inflammation", "mg/L", {"mg/dl": _x(10)}, (0, 100)),
        _a("esr", "ESR", "Inflammation", "mm/h", None, (0, 150)),
    ]
}

# The model files each row under one of these, or "other".
KEYS = sorted(CATALOG)

FLAGS = ("low", "high", "normal", "abnormal", "critical_low", "critical_high")

_UNIT_ALIASES = {
    "mg%": "mg/dl",
    "gm/dl": "g/dl",
    "gm%": "g/dl",
    "g%": "g/dl",
    "miu/l": "uiu/ml",  # 1 mIU/L = 1 µIU/mL
    "uiu/ml": "uiu/ml",
    "uu/ml": "uiu/ml",
    "iu/l": "u/l",
    "mmol/mol": "mmol/mol",
    "mill/ul": "10^6/ul",
    "million/ul": "10^6/ul",
    "millions/ul": "10^6/ul",
    "10^6/ul": "10^6/ul",
    "10^12/l": "10^6/ul",
    "thou/ul": "10^3/ul",
    "thousand/ul": "10^3/ul",
    "10^3/ul": "10^3/ul",
    "10^9/l": "10^3/ul",
    "k/ul": "10^3/ul",
    "lakh/ul": "lakh/ul",
    "lakhs/ul": "lakh/ul",
    "cells/ul": "/ul",
    "/ul": "/ul",
    "mm/hr": "mm/h",
    "mm/1sthr": "mm/h",
    "mm/1sthour": "mm/h",
    "mm/h": "mm/h",
    "ml/min/1.73m2": "ml/min/1.73m2",
    "ml/min/1.73sqm": "ml/min/1.73m2",
    "ml/min": "ml/min/1.73m2",
    "ratio": "",
}


def norm_unit(unit: str | None) -> str:
    """A comparable spelling of a printed unit: lower case, no spaces, µ → u, "cumm" → µL,
    "x10³" → "10^3", and the common synonyms folded together."""
    if not unit:
        return ""
    u = unit.strip().lower().replace(" ", "")
    u = u.replace("µ", "u").replace("μ", "u").replace("³", "^3").replace("⁶", "^6")
    u = u.replace("²", "2").replace("⁹", "^9").replace("¹²", "^12")
    u = re.sub(r"^x", "", u).replace("*", "")
    u = re.sub(r"10e?\^?(12|9|6|3)/", r"10^\1/", u)  # 10e3/, 103/ (a lost superscript), 10^3/
    u = u.replace("cu.mm", "ul").replace("cumm", "ul").replace("mm3", "ul")
    u = u.replace("mcg", "ug").replace("mcl", "ul")
    u = re.sub(r"^cells?/", "/", u)
    return _UNIT_ALIASES.get(u, u)


def canonical_unit_key(a: Analyte) -> str:
    return norm_unit(a.unit)


@dataclass(frozen=True)
class Standardized:
    value: float | None  # in the analyte's canonical unit
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    method: str  # how value was obtained from the printed one
    issue: str | None = None  # why a reviewer should look twice


def standardize(
    key: str | None,
    value: float | None,
    unit: str | None,
    ref_low: float | None = None,
    ref_high: float | None = None,
) -> Standardized:
    """Convert a printed value (and its range) to the analyte's canonical unit."""
    a = CATALOG.get(key or "")
    if a is None:
        return Standardized(value, unit, ref_low, ref_high, "as printed (not in catalog)")
    if value is None:
        return Standardized(None, a.unit, None, None, "no number")
    u = norm_unit(unit)
    conv: Conv | None
    if u == canonical_unit_key(a) or (u == "" and a.unit == ""):
        conv, method = (1.0, 0.0), "as printed"
    elif u in a.convert:
        conv = a.convert[u]
        scale, offset = conv
        method = f"from {unit} × {scale:.4g}" + (f" + {offset:.4g}" if offset else "")
    elif u == "" and not a.convert:
        conv, method = (1.0, 0.0), f"no unit printed; assumed {a.unit or 'a ratio'}"
    else:
        conv, method = None, ""
    if conv is None:
        return Standardized(
            None,
            None,
            None,
            None,
            f"unit {unit!r} not convertible to {a.unit}",
            f"unit {unit or 'missing'} is not one we can convert to {a.unit}",
        )

    def f(x: float | None) -> float | None:
        return None if x is None else round(x * conv[0] + conv[1], 4)

    v = f(value)
    issue = None
    if a.plausible and v is not None and not (a.plausible[0] <= v <= a.plausible[1]):
        issue = f"{v:g} {a.unit} is outside what a person can have; check the reading"
    return Standardized(v, a.unit, f(ref_low), f(ref_high), method, issue)


def flag_for(value: float | None, ref_low: float | None, ref_high: float | None) -> str | None:
    """low / high / normal against the reference range; None without a number or range."""
    if value is None or (ref_low is None and ref_high is None):
        return None
    if ref_low is not None and value < ref_low:
        return "low"
    if ref_high is not None and value > ref_high:
        return "high"
    return "normal"


def resolve_flag(printed: str | None, computed: str | None) -> tuple[str | None, str]:
    """The lab's own flag wins (it knows the method's cut-offs); else ours from the range."""
    if printed in FLAGS:
        return printed, "printed"
    if computed:
        return computed, "range"
    return None, "none"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:60] or "unnamed"


def analyte_id(key: str | None, name: str) -> str:
    """History key: the catalog key, else `other:<slug of the printed name>`."""
    return key if key in CATALOG else f"other:{slug(name)}"


def dedupe(rows: list[dict]) -> list[dict]:
    """Reports often repeat a value (a summary page, then the full panel). Keep one row per
    analyte and value, preferring the one that carries a reference range."""
    best: dict[tuple, int] = {}
    out: list[dict] = []
    for r in rows:
        k = (r["analyte"], r.get("value"), (r.get("value_text") or "").strip().lower())
        has_range = r.get("ref_low") is not None or r.get("ref_high") is not None
        if k in best:
            i = best[k]
            prev = out[i]
            if has_range and prev.get("ref_low") is None and prev.get("ref_high") is None:
                out[i] = r
            continue
        best[k] = len(out)
        out.append(r)
    return out
