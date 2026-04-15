"""Parse the KPI Dictionary Excel and generate all 620 KPIs with dummy data."""
import pandas as pd
import random
import uuid
import os
from pathlib import Path

SECTOR_CODE_MAP = {
    "Agriculture & Allied Sectors": "AGR",
    "Economy, Macro Growth & Public Finance": "ECO",
    "Education, Skill Development & Employment": "EDU",
    "Environment, Climate, Tourism & Culture": "ENV",
    "Governance, Public Service Delivery & Law Enforcement": "GOV",
    "Industry, Manufacturing, MSME & Logistics": "IND",
    "Infrastructure, Utilities & Urban-Rural Development": "INF",
    "Health, Nutrition & Public Healthcare Systems": "HLT",
    "Social Inclusion, Welfare & Community Development": "SOC",
    "Program Management Unit, Monitoring & AI Governance": "PMU",
}

# Value ranges by unit type: (baseline_min, baseline_max, improvement_factor_min, improvement_factor_max, target_2029_mult, target_2047_mult)
UNIT_RANGES = {
    "%": (15, 75, 1.1, 1.4, 1.6, 2.2),
    "₹ Cr": (500, 25000, 1.1, 1.3, 1.8, 3.5),
    "₹": (50000, 500000, 1.1, 1.25, 1.8, 3.0),
    "Rate": (5, 200, 0.8, 0.95, 0.6, 0.3),  # lower is better for rates like mortality
    "Score": (2.0, 3.8, 1.05, 1.2, 1.4, 1.7),
    "Index": (0.25, 0.65, 1.05, 1.2, 1.5, 1.9),
    "Count": (50, 5000, 1.05, 1.25, 1.6, 2.5),
    "Ratio": (0.5, 1.5, 1.02, 1.1, 1.2, 1.4),
    "Days": (10, 90, 0.8, 0.9, 0.5, 0.2),  # lower is better
    "Years": (55, 70, 1.01, 1.04, 1.08, 1.15),
    "Hours": (12, 22, 1.02, 1.08, 1.15, 1.3),
    "Hours/day": (12, 22, 1.02, 1.08, 1.15, 1.3),
    "ha": (5000, 500000, 1.05, 1.2, 1.5, 2.5),
    "MT": (1000, 100000, 1.05, 1.2, 1.6, 2.5),
    "MT/ha": (5, 50, 1.05, 1.15, 1.3, 1.8),
    "qtl/ha": (15, 50, 1.05, 1.15, 1.3, 1.8),
    "Lit/day": (3, 8, 1.05, 1.15, 1.4, 2.0),
    "HP/ha": (1.0, 3.0, 1.05, 1.15, 1.4, 2.0),
    "MW": (500, 20000, 1.1, 1.3, 1.8, 3.0),
    "MW / %": (10, 50, 1.1, 1.3, 1.8, 3.0),
    "km/sq km": (0.5, 2.0, 1.05, 1.15, 1.3, 1.6),
    "Gap": (20, 50, 0.85, 0.95, 0.6, 0.3),  # lower is better
    "Tons/day": (100, 5000, 1.05, 1.2, 1.5, 2.5),
    "tCO2e": (100, 10000, 0.9, 0.95, 0.7, 0.4),  # lower is better
    "₹ per m3": (5, 30, 1.05, 1.2, 1.5, 2.0),
    "₹ per worker": (100000, 500000, 1.08, 1.2, 1.5, 2.5),
    "Minutes": (15, 120, 0.8, 0.9, 0.5, 0.2),  # lower is better
    "Unit": (10, 500, 1.05, 1.2, 1.5, 2.0),
    "% / absolute": (5, 50, 0.85, 0.95, 0.6, 0.3),
}

LOWER_IS_BETTER = {"Rate", "Days", "Gap", "tCO2e", "Minutes", "% / absolute"}

def generate_values(unit):
    ranges = UNIT_RANGES.get(unit, UNIT_RANGES["%"])
    bmin, bmax, imp_min, imp_max, t29_mult, t47_mult = ranges
    baseline = round(random.uniform(bmin, bmax), 2)
    if unit in LOWER_IS_BETTER:
        current = round(baseline * random.uniform(imp_min, imp_max), 2)
        target_2029 = round(baseline * t29_mult, 2)
        target_2036 = round(baseline * (t29_mult + t47_mult) / 2, 2)
        target_2047 = round(baseline * t47_mult, 2)
    else:
        current = round(baseline * random.uniform(imp_min, imp_max), 2)
        target_2029 = round(baseline * t29_mult, 2)
        target_2036 = round(baseline * (t29_mult + t47_mult) / 2, 2)
        target_2047 = round(baseline * t47_mult, 2)
    # Cap percentages at 100
    if unit == "%":
        target_2029 = min(target_2029, 100)
        target_2036 = min(target_2036, 100)
        target_2047 = min(target_2047, 100)
        current = min(current, 100)
    return baseline, current, target_2029, target_2036, target_2047


def compute_status(baseline, current, target_2029):
    if target_2029 == baseline:
        return "on_track"
    progress = (current - baseline) / (target_2029 - baseline)
    if progress >= 0.35:
        return "on_track"
    elif progress >= 0.15:
        return "at_risk"
    else:
        return "off_track"


def generate_trend(baseline, current, months=12):
    if months == 0:
        return []
    step = (current - baseline) / months
    month_names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
    return [
        {"month": m, "value": round(baseline + step * (i + 1) + random.uniform(-abs(step) * 0.5, abs(step) * 0.5), 2)}
        for i, m in enumerate(month_names)
    ]


def load_kpis_from_excel():
    """Load all 620 KPIs from the Excel file."""
    excel_path = Path(__file__).parent / "kpi_dictionary.xlsx"
    if not excel_path.exists():
        return []

    df = pd.read_excel(excel_path, sheet_name="KPI Dictionary")
    kpi_docs = []
    random.seed(42)  # Reproducible dummy data

    for _, row in df.iterrows():
        sector_name = str(row.get("Sector", "")).strip()
        sector_code = SECTOR_CODE_MAP.get(sector_name, "")
        if not sector_code:
            continue

        kpi_id = str(row.get("KPI ID", "")).strip()
        kpi_name = str(row.get("KPI Name", "")).strip()
        theme = str(row.get("Theme", "")).strip()
        formula = str(row.get("Formula / Definition", "")).strip()
        unit = str(row.get("Unit", "%")).strip()
        frequency = str(row.get("Frequency", "Quarterly")).strip()
        level = str(row.get("Level", "")).strip()
        owner = str(row.get("Owner", "")).strip()
        kpi_type = str(row.get("Type", "")).strip()

        if not kpi_id or not kpi_name:
            continue

        baseline, current, t29, t36, t47 = generate_values(unit)
        status = compute_status(baseline, current, t29)

        kpi_docs.append({
            "id": str(uuid.uuid4()),
            "kpi_id": kpi_id,
            "kpi_name": kpi_name,
            "kpi_name_hi": kpi_name,  # Placeholder - use English
            "sector_code": sector_code,
            "theme": theme,
            "formula": formula,
            "unit": unit,
            "frequency": frequency,
            "level": level,
            "owner": owner,
            "kpi_type": kpi_type,
            "baseline_2024": baseline,
            "current_value": current,
            "target_2029": t29,
            "target_2036": t36,
            "target_2047": t47,
            "status": status,
            "trend_data": generate_trend(baseline, current),
        })

    return kpi_docs


def get_sector_stats(kpi_docs):
    """Compute sector-level stats from KPI docs."""
    from collections import defaultdict
    stats = defaultdict(lambda: {"total": 0, "on_track": 0, "at_risk": 0, "off_track": 0})
    for kpi in kpi_docs:
        code = kpi["sector_code"]
        stats[code]["total"] += 1
        stats[code][kpi["status"]] += 1
    return dict(stats)
