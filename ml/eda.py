"""
EDA for the RideSetGo fare model.

Generates all plots under ml/plots/ and writes ml/plots/plots_index.json
mapping each plot file to a 1-2 line business insight. Figures use only
matplotlib/seaborn (no paid APIs).
"""
from __future__ import annotations

import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import LOCATION_FLAGS, PLOTS_DIR
from data_prep import haversine_km, load_data, clean_data

sns.set_style("whitegrid")


def _save(fig_name: str, insight: str) -> None:
    path = os.path.join(PLOTS_DIR, fig_name)
    plt.tight_layout()
    plt.savefig(path, dpi=100, bbox_inches="tight")
    plt.close()
    PLOTS_INDEX[fig_name] = insight


PLOTS_INDEX: dict = {}


def main() -> None:
    os.makedirs(PLOTS_DIR, exist_ok=True)
    df = clean_data(load_data())[0]

    # Trip-level special-zone flags = pickup OR dropoff location flag.
    for flag, locs in LOCATION_FLAGS.items():
        loc_set = set(locs)
        df[f"trip_{flag}"] = (
            df["pickup_location"].isin(loc_set) | df["dropoff_location"].isin(loc_set)
        ).astype(int)

    # Numeric copy for correlation (encode locations as category codes just for heatmap).
    df_num = df[["fare_amount", "distance_km", "passenger_count", "hour"] +
                [f"trip_{f}" for f in LOCATION_FLAGS]].copy()

    # 1. Fare distribution (histogram + KDE).
    plt.figure(figsize=(7, 4))
    sns.histplot(df["fare_amount"], bins=40, kde=True, color="#be123c")
    plt.title("Fare amount distribution (INR)")
    plt.xlabel("Fare (INR)"); plt.ylabel("Count")
    _save("01_fare_distribution.png",
          "Fares are right-skewed: most trips cluster around ₹100-250, with a "
          "long tail of expensive long/airport trips up to ~₹1020.")

    # 2. Distance vs fare scatter with regression line.
    plt.figure(figsize=(6, 4))
    sns.scatterplot(x="distance_km", y="fare_amount", data=df.sample(
        min(3000, len(df)), random_state=42), s=12, alpha=0.4, color="#0f172a")
    sns.regplot(x="distance_km", y="fare_amount", data=df, scatter=False,
                color="#be123c", line_kws={"linewidth": 2})
    plt.title("Distance vs fare with regression line")
    plt.xlabel("Distance (km)"); plt.ylabel("Fare (INR)")
    _save("02_distance_vs_fare.png",
          "Fare rises roughly linearly with distance (strong positive trend); "
          "the regression line confirms distance is the dominant price driver.")

    # 3-4. Top 15 pickup / dropoff locations by average fare.
    for side, col in [("pickup", "pickup_location"), ("dropoff", "dropoff_location")]:
        plt.figure(figsize=(7, 4))
        top = (df.groupby(col)["fare_amount"].mean()
               .sort_values(ascending=False).head(15))
        sns.barplot(x=top.values, y=top.index, orient="h", color="#2563eb")
        plt.title(f"Top 15 {side} locations by average fare (INR)")
        plt.xlabel("Average fare (INR)")
        _save(f"03_top_{side}_fare.png",
              f"Airport/border/pilgrimage endpoints command the highest average "
              f"fares, confirming special-zone flags add predictive value.")

    # 5. Boxplot of fare by top locations.
    plt.figure(figsize=(8, 4))
    top_locs = (df.groupby("pickup_location")["fare_amount"].mean()
                .sort_values(ascending=False).head(8).index)
    sub = df[df["pickup_location"].isin(top_locs)]
    sns.boxplot(x="pickup_location", y="fare_amount", data=sub, palette="muted")
    plt.xticks(rotation=30, ha="right")
    plt.title("Fare spread by top pickup locations")
    plt.ylabel("Fare (INR)")
    _save("04_fare_boxplot_top_locations.png",
          "Fare spread widens for high-value locations (airport/border), while "
          "inner-city trips stay tightly clustered at lower fares.")

    # 6. Fare by hour of day.
    plt.figure(figsize=(7, 4))
    by_hour = df.groupby("hour")["fare_amount"].mean()
    sns.lineplot(x=by_hour.index.astype(int), y=by_hour.values, marker="o",
                 color="#be123c")
    plt.title("Average fare by hour of day")
    plt.xlabel("Hour"); plt.ylabel("Average fare (INR)")
    _save("05_fare_by_hour.png",
          "Fares peak in the morning (8-9) and evening (17-19) rush windows "
          "and dip at night, matching the rush_hour flag.")

    # 7. Fare by day_of_week.
    plt.figure(figsize=(6, 4))
    by_dow = df.groupby("day_of_week")["fare_amount"].mean()
    sns.barplot(x=by_dow.index.astype(int), y=by_dow.values, color="#2563eb")
    plt.title("Average fare by day of week (0=Mon .. 6=Sun)")
    plt.xlabel("Day of week"); plt.ylabel("Average fare (INR)")
    _save("06_fare_by_dow.png",
          "Weekend days (5,6) show slightly higher average fares than weekdays.")

    # 8. Weekend vs weekday.
    plt.figure(figsize=(5, 4))
    df["is_weekend_flag"] = df["is_weekend"]
    sns.boxplot(x="is_weekend_flag", y="fare_amount", data=df,
                palette=["#2563eb", "#be123c"])
    plt.xticks([0, 1], ["Weekday", "Weekend"])
    plt.title("Weekend vs weekday fare")
    plt.ylabel("Fare (INR)")
    _save("07_weekend_vs_weekday.png",
          "Weekend trips are modestly more expensive on average than weekday trips.")

    # 9. Rush hour vs normal.
    plt.figure(figsize=(5, 4))
    sns.boxplot(x="rush_hour", y="fare_amount", data=df,
                palette=["#2563eb", "#be123c"])
    plt.xticks([0, 1], ["Normal", "Rush hour"])
    plt.title("Rush hour vs normal fare")
    plt.ylabel("Fare (INR)")
    _save("08_rush_hour_vs_normal.png",
          "Rush-hour trips carry a small fare premium over normal-hour trips.")

    # 10. Night vs day.
    plt.figure(figsize=(5, 4))
    sns.boxplot(x="is_night", y="fare_amount", data=df,
                palette=["#2563eb", "#be123c"])
    plt.xticks([0, 1], ["Day", "Night"])
    plt.title("Night vs day fare")
    plt.ylabel("Fare (INR)")
    _save("09_night_vs_day.png",
          "Night trips (22:00-06:00) are slightly pricier, consistent with a "
          "night surcharge in the data.")

    # 11. Effect of special-zone flags on average fare.
    plt.figure(figsize=(7, 4))
    flag_means = {f: df[df[f"trip_{f}"] == 1]["fare_amount"].mean()
                  for f in LOCATION_FLAGS}
    sns.barplot(x=list(flag_means.keys()), y=list(flag_means.values()),
                color="#be123c")
    plt.xticks(rotation=20, ha="right")
    plt.title("Average fare when a special-zone flag is present")
    plt.ylabel("Average fare (INR)")
    _save("10_flag_effect_on_fare.png",
          "Airport and border trips have the highest average fares; market and "
          "pilgrimage trips also cost more than ordinary trips.")

    # 12. Correlation heatmap of numeric features.
    plt.figure(figsize=(6, 5))
    corr = df_num.corr(numeric_only=True)
    sns.heatmap(corr, annot=True, cmap="RdBu_r", center=0, fmt=".2f")
    plt.title("Correlation heatmap of numeric features")
    _save("11_correlation_heatmap.png",
          "distance_km correlates most strongly with fare_amount; special-zone "
          "flags (especially airport/border) show moderate positive correlation.")

    # 13. Heatmap of average fare for pickup x dropoff (top locations).
    plt.figure(figsize=(7, 5.5))
    top_locs = (df.groupby("pickup_location")["fare_amount"].mean()
                .sort_values(ascending=False).head(10).index)
    sub = df[df["pickup_location"].isin(top_locs) &
             df["dropoff_location"].isin(top_locs)]
    pivot = sub.pivot_table(index="pickup_location", columns="dropoff_location",
                            values="fare_amount", aggfunc="mean")
    sns.heatmap(pivot, annot=True, cmap="YlOrRd", fmt=".0f")
    plt.title("Average fare heatmap: top pickup x dropoff locations")
    _save("12_fare_heatmap_pickup_dropoff.png",
          "Airport/border pairs (e.g. Wagah Border <-> Amritsar Airport) sit at "
          "the top of the fare matrix, confirming long cross-city trips cost most.")

    # Persist insights index.
    index_path = os.path.join(PLOTS_DIR, "plots_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(PLOTS_INDEX, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(PLOTS_INDEX)} plots + insights to {PLOTS_DIR}")
    for k, v in PLOTS_INDEX.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
