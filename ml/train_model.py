"""
Train fare prediction model for RideSetGo (Amritsar).

Uses REAL coordinates from amritsar_uber_dataset.csv (never fake/random coords).
Saves model and preprocessor artifacts with joblib for reproducible inference.
"""
import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "amritsar_uber_dataset.csv")
ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")

FEATURES = ["pickup_code", "dropoff_code", "distance_km", "passenger_count", "hour"]


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points in kilometers."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c


def main():
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    df = pd.read_csv(DATA_PATH)
    print(f"Loaded dataset: {df.shape[0]} rows x {df.shape[1]} columns")

    # Use REAL coordinates from the CSV — never random/fake coordinates.
    # Compute haversine distance consistently for both training and inference.
    df["distance_km"] = haversine_km(
        df["pickup_latitude"],
        df["pickup_longitude"],
        df["dropoff_latitude"],
        df["dropoff_longitude"],
    )

    # Encode location names (saved with joblib so inference uses same mapping)
    le_pickup = LabelEncoder()
    le_dropoff = LabelEncoder()
    df["pickup_code"] = le_pickup.fit_transform(df["pickup_location"])
    df["dropoff_code"] = le_dropoff.fit_transform(df["dropoff_location"])

    X = df[FEATURES]
    y = df["fare_amount"]

    # Reproducible train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Train model
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    print(f"MAE:  INR {mae:.2f}")
    print(f"RMSE: INR {rmse:.2f}")
    print(f"R2:   {r2:.4f}")

    # Save artifacts
    joblib.dump(model, os.path.join(ARTIFACT_DIR, "fare_model.joblib"))

    joblib.dump(
        {
            "le_pickup": le_pickup,
            "le_dropoff": le_dropoff,
            "features": FEATURES,
            "metrics": {"mae": float(mae), "rmse": float(rmse), "r2": float(r2)},
        },
        os.path.join(ARTIFACT_DIR, "preprocessor.joblib"),
    )

    # Build location database from REAL CSV coordinates
    location_db = {}
    for _, row in df.iterrows():
        for loc, lat, lng in [
            (row["pickup_location"], row["pickup_latitude"], row["pickup_longitude"]),
            (row["dropoff_location"], row["dropoff_latitude"], row["dropoff_longitude"]),
        ]:
            if loc not in location_db:
                location_db[loc] = {"lat": float(lat), "lng": float(lng)}

    joblib.dump(location_db, os.path.join(ARTIFACT_DIR, "location_db.joblib"))
    print(f"Saved {len(location_db)} real locations to location_db.joblib")
    print(f"Artifacts saved to: {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
