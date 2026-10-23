"""
RideSetGo ML configuration.

Central place for paths, Amritsar geo bounds and the per-location special-zone
flag rules. Everything here is derived from / verified against
amritsar_uber_dataset.csv (49,310 rows, 37 locations).
"""
from __future__ import annotations

import os
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# ml/ is one level below the repository root.
ML_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(ML_DIR)

# Primary dataset (root) with a mirrored copy under /data/.
DATA_PATH = os.path.join(PROJECT_ROOT, "amritsar_uber_dataset.csv")
DATA_PATH_ALT = os.path.join(PROJECT_ROOT, "data", "amritsar_uber_dataset.csv")

PLOTS_DIR = os.path.join(ML_DIR, "plots")
ARTIFACTS_DIR = os.path.join(ML_DIR, "artifacts")
MODEL_PATH = os.path.join(ARTIFACTS_DIR, "model.pkl")
METRICS_PATH = os.path.join(ARTIFACTS_DIR, "metrics.json")
META_PATH = os.path.join(ARTIFACTS_DIR, "model_meta.json")
LOCATIONS_PATH = os.path.join(ARTIFACTS_DIR, "locations.json")
PAIR_DISTANCES_PATH = os.path.join(ARTIFACTS_DIR, "pair_distances.json")

RANDOM_STATE = 42
TEST_SIZE = 0.2

# ---------------------------------------------------------------------------
# Amritsar geo bounds (sanity check for lat/lng).
# Observed ranges: lat 31.5786..31.7125, lng 74.5683..74.9692.
# ---------------------------------------------------------------------------
AMRITSAR_LAT_MIN = 31.50
AMRITSAR_LAT_MAX = 31.75
AMRITSAR_LNG_MIN = 74.50
AMRITSAR_LNG_MAX = 75.00

# Columns that are boolean flags in the CSV.
BOOL_COLUMNS = [
    "is_pilgrimage",
    "is_airport",
    "is_border",
    "is_market",
    "is_night",
    "is_weekend",
    "rush_hour",
]

# Location-level special-zone flags. Derived from the CSV: a location gets a
# flag when that flag is True in the majority of rows where the location is the
# PICKUP. (See data_prep._derive_location_flags.) Trip-level flag = pickup OR
# dropoff location flag.
LOCATION_FLAGS = {
    "is_pilgrimage": {"Golden Temple", "Durgiana Temple"},
    "is_airport": {"Amritsar Airport (ATQ)"},
    "is_border": {"Wagah Border", "Attari Check Post"},
    "is_market": {
        "Hall Bazaar",
        "Kapurthala Road",
        "Khairuddin Market",
        "Lawrence Road",
        "Majitha Road",
        "Shastri Market",
    },
}

# Features fed to the model (OneHotEncoded locations + scaled numerics).
NUMERIC_FEATURES = ["distance_km", "passenger_count", "hour"]
CATEGORICAL_FEATURES = ["pickup_location", "dropoff_location"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


@dataclass
class CleaningReport:
    rows_before: int
    rows_after: int
    removed_same_location: int
    removed_distance_le_zero: int
    removed_fare_le_zero: int
    removed_out_of_bounds: int
    removed_duplicates: int
    removed_outliers: int  # always 0: we keep valid long trips
    notes: str
