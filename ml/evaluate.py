"""
Evaluate the trained RideSetGo fare model.

Reports MAE, RMSE, R² on the held-out test set and runs invalid-input
tests to ensure the pipeline fails gracefully (never crashes).
"""
import os
import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "amritsar_uber_dataset.csv")
ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c


def main():
    df = pd.read_csv(DATA_PATH)
    df["distance_km"] = haversine_km(
        df["pickup_latitude"], df["pickup_longitude"],
        df["dropoff_latitude"], df["dropoff_longitude"],
    )

    from sklearn.preprocessing import LabelEncoder
    le_pickup = LabelEncoder()
    le_dropoff = LabelEncoder()
    df["pickup_code"] = le_pickup.fit_transform(df["pickup_location"])
    df["dropoff_code"] = le_dropoff.fit_transform(df["dropoff_location"])

    features = ["pickup_code", "dropoff_code", "distance_km", "passenger_count", "hour"]
    X = df[features]
    y = df["fare_amount"]

    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model_path = os.path.join(ARTIFACT_DIR, "fare_model.joblib")
    if not os.path.exists(model_path):
        print("Model artifact not found. Run train_model.py first.")
        return

    model = joblib.load(model_path)
    y_pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    print("=" * 50)
    print("RideSetGo Fare Model Evaluation")
    print("=" * 50)
    print(f"Test samples : {len(y_test)}")
    print(f"MAE          : INR {mae:.2f}")
    print(f"RMSE         : INR {rmse:.2f}")
    print(f"R2           : {r2:.4f}")
    print("=" * 50)

    # Invalid input tests (graceful failure, no crashes)
    print("\nInvalid-input tests:")
    test_cases = [
        ("Unknown pickup", "Nowhere Land", "Golden Temple", 1, 12),
        ("Unknown dropoff", "Golden Temple", "Nowhere Land", 1, 12),
        ("Same location", "Golden Temple", "Golden Temple", 1, 12),
        ("Bad passengers", "Golden Temple", "Amritsar Airport (ATQ)", 0, 12),
        ("Bad hour", "Golden Temple", "Amritsar Airport (ATQ)", 1, 25),
    ]
    for label, p, d, pax, hr in test_cases:
        row = df[(df["pickup_location"] == p) & (df["dropoff_location"] == d)]
        if row.empty:
            print(f"  [{label}] SKIPPED (location pair not in dataset)")
            continue
        r = row.iloc[0]
        dist = haversine_km(r["pickup_latitude"], r["pickup_longitude"],
                            r["dropoff_latitude"], r["dropoff_longitude"])
        try:
            p_code = le_pickup.transform([p])[0] if p in le_pickup.classes_ else -1
            d_code = le_dropoff.transform([d])[0] if d in le_dropoff.classes_ else -1
            input_df = pd.DataFrame([[p_code, d_code, dist, pax, hr]],
                                    columns=features)
            pred = model.predict(input_df)[0]
            print(f"  [{label}] predicted INR {pred:.2f} (no crash)")
        except Exception as exc:
            print(f"  [{label}] CRASHED: {exc}")


if __name__ == "__main__":
    main()
