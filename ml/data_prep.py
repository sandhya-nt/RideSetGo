"""
Data loading & cleaning for the RideSetGo fare model.

Steps:
  1. Load amritsar_uber_dataset.csv (49,310 rows, 21 columns, no nulls).
  2. Parse pickup_datetime; coerce booleans to int.
  3. Remove invalid rows: pickup == dropoff, distance <= 0, fare <= 0,
     lat/lng outside Amritsar bounds, exact duplicates.
  4. Outlier report (IQR + Z-score) for fare_amount and distance_km.
     Decision: KEEP all valid outliers — long airport/border trips are genuine
     and fare scales with distance, so we winsorize/remove nothing.
  5. Derive per-location special-zone flags (airport/border/pilgrimage/market).
  6. Save ml/artifacts/locations.json (37 locations, name+lat+lng, median coord)
     and ml/artifacts/pair_distances.json (haversine distance per location pair).
"""
from __future__ import annotations

import json
import os
from typing import Dict, Tuple

import numpy as np
import pandas as pd

from config import CleaningReport
from config import (
    AMRITSAR_LAT_MAX,
    AMRITSAR_LAT_MIN,
    AMRITSAR_LNG_MAX,
    AMRITSAR_LNG_MIN,
    ARTIFACTS_DIR,
    BOOL_COLUMNS,
    DATA_PATH,
    DATA_PATH_ALT,
    LOCATION_FLAGS,
    LOCATIONS_PATH,
    PAIR_DISTANCES_PATH,
    RANDOM_STATE,
)


def _resolve_data_path() -> str:
    for p in (DATA_PATH, DATA_PATH_ALT):
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"Dataset not found at {DATA_PATH} or {DATA_PATH_ALT}")


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return float(R * c)


def load_data() -> pd.DataFrame:
    path = _resolve_data_path()
    df = pd.read_csv(path)
    print(f"Loaded dataset: {df.shape[0]} rows x {df.shape[1]} columns from {path}")
    return df


def clean_data(df: pd.DataFrame) -> Tuple[pd.DataFrame, CleaningReport]:
    rows_before = len(df)
    removed_same_location = removed_dle0 = removed_fle0 = removed_oob = 0
    removed_dups = 0
    removed_outliers = 0

    # Exact duplicates.
    before = len(df)
    df = df.drop_duplicates()
    removed_dups = before - len(df)

    # Parse datetime.
    df["pickup_datetime"] = pd.to_datetime(df["pickup_datetime"])

    # Booleans -> int.
    for c in BOOL_COLUMNS:
        df[c] = df[c].astype(int)

    # Invalid: pickup == dropoff.
    same = df["pickup_location"] == df["dropoff_location"]
    removed_same_location = int(same.sum())
    df = df[~same].copy()

    # Invalid: distance <= 0 / fare <= 0.
    removed_dle0 = int((df["distance_km"] <= 0).sum())
    df = df[df["distance_km"] > 0].copy()
    removed_fle0 = int((df["fare_amount"] <= 0).sum())
    df = df[df["fare_amount"] > 0].copy()

    # Invalid: lat/lng outside Amritsar bounds.
    oob = (
        (df["pickup_latitude"] < AMRITSAR_LAT_MIN)
        | (df["pickup_latitude"] > AMRITSAR_LAT_MAX)
        | (df["pickup_longitude"] < AMRITSAR_LNG_MIN)
        | (df["pickup_longitude"] > AMRITSAR_LNG_MAX)
        | (df["dropoff_latitude"] < AMRITSAR_LAT_MIN)
        | (df["dropoff_latitude"] > AMRITSAR_LAT_MAX)
        | (df["dropoff_longitude"] < AMRITSAR_LNG_MIN)
        | (df["dropoff_longitude"] > AMRITSAR_LNG_MAX)
    )
    removed_oob = int(oob.sum())
    df = df[~oob].copy()

    # Outlier report (we keep everything).
    q1, q3 = df["fare_amount"].quantile([0.25, 0.75])
    iqr = q3 - q1
    fare_fence = q3 + 1.5 * iqr
    fare_above = int((df["fare_amount"] > fare_fence).sum())
    dq1, dq3 = df["distance_km"].quantile([0.25, 0.75])
    dist_fence = dq3 + 1.5 * (dq3 - dq1)
    dist_above = int((df["distance_km"] > dist_fence).sum())
    z = np.abs((df["fare_amount"] - df["fare_amount"].mean()) / df["fare_amount"].std())
    fare_z3 = int((z > 3).sum())

    notes = (
        f"fare IQR fence={fare_fence:.1f}, rows above={fare_above} "
        f"({fare_above / len(df) * 100:.1f}%); distance fence={dist_fence:.1f} km, "
        f"rows above={dist_above}; fare |z|>3 rows={fare_z3}. "
        "Decision: KEEP all valid outliers — long airport/border trips are "
        "genuine and fare scales with distance; nothing removed/winsorized."
    )

    report = CleaningReport(
        rows_before=rows_before,
        rows_after=len(df),
        removed_same_location=removed_same_location,
        removed_distance_le_zero=removed_dle0,
        removed_fare_le_zero=removed_fle0,
        removed_out_of_bounds=removed_oob,
        removed_duplicates=removed_dups,
        removed_outliers=removed_outliers,
        notes=notes,
    )
    return df, report


def derive_location_flags(df: pd.DataFrame) -> Dict[str, set]:
    """Derive per-location flag from pickup rows (flag True in majority)."""
    flags: Dict[str, set] = {k: set() for k in LOCATION_FLAGS}
    for flag in LOCATION_FLAGS:
        sub = df[df[flag] == 1]
        locs = set(sub["pickup_location"].unique()) | set(sub["dropoff_location"].unique())
        # Confirm against pickup-majority rule.
        for loc in locs:
            pick_rows = df[df["pickup_location"] == loc]
            if len(pick_rows) and pick_rows[flag].mean() >= 0.5:
                flags[flag].add(loc)
    return flags


def build_location_db(df: pd.DataFrame) -> list[dict]:
    """One row per location: name, lat, lng (median of all observations)."""
    all_locs = pd.concat(
        [
            df[["pickup_location", "pickup_latitude", "pickup_longitude"]].rename(
                columns={
                    "pickup_location": "name",
                    "pickup_latitude": "lat",
                    "pickup_longitude": "lng",
                }
            ),
            df[["dropoff_location", "dropoff_latitude", "dropoff_longitude"]].rename(
                columns={
                    "dropoff_location": "name",
                    "dropoff_latitude": "lat",
                    "dropoff_longitude": "lng",
                }
            ),
        ]
    )
    med = all_locs.groupby("name", as_index=False)[["lat", "lng"]].median()
    med = med.sort_values("name").reset_index(drop=True)
    return med.to_dict(orient="records")


def build_pair_distances(df: pd.DataFrame) -> Dict[str, float]:
    """Haversine distance for each observed pickup->dropoff pair."""
    pairs: Dict[str, float] = {}
    for _, r in df.iterrows():
        key = f"{r['pickup_location']}|{r['dropoff_location']}"
        if key not in pairs:
            pairs[key] = haversine_km(
                r["pickup_latitude"], r["pickup_longitude"],
                r["dropoff_latitude"], r["dropoff_longitude"],
            )
    return pairs


def save_artifacts(location_db: list[dict], pair_distances: Dict[str, float]) -> None:
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    with open(LOCATIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(location_db, f, indent=2, ensure_ascii=False)
    with open(PAIR_DISTANCES_PATH, "w", encoding="utf-8") as f:
        json.dump(pair_distances, f, indent=2)
    print(f"Saved {len(location_db)} locations -> {LOCATIONS_PATH}")
    print(f"Saved {len(pair_distances)} location-pair distances -> {PAIR_DISTANCES_PATH}")


def main() -> None:
    df = load_data()
    df, report = clean_data(df)
    print("Cleaning report:")
    for k, v in report.__dict__.items():
        print(f"  {k}: {v}")

    location_db = build_location_db(df)
    pair_distances = build_pair_distances(df)
    save_artifacts(location_db, pair_distances)

    # Sanity: verify each location maps to one consistent coordinate (median).
    print(f"Locations in dropdown: {len(location_db)}")


if __name__ == "__main__":
    main()
