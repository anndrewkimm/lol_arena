import pandas as pd
import numpy as np

# Load and analyze the training data
data = pd.read_csv('backend/data_collection/ArenaData.csv')
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

print("=== TRAINING DATA ANALYSIS ===")
print("Feature ranges in training data:")
for feature in features:
    print(f"{feature}: {data[feature].min()} to {data[feature].max()} (mean: {data[feature].mean():.1f})")

print("\n=== SAMPLE REAL MATCH vs TRAINING DATA ===")
real_match = {
    'championId': 91, 'kills': 10, 'deaths': 7, 'assists': 3, 
    'totalDamageDealt': 56383, 'totalDamageTaken': 21426, 'goldEarned': 12625
}

print("Real match data:")
for feature in features:
    if feature in real_match:
        training_mean = data[feature].mean()
        training_std = data[feature].std()
        real_value = real_match[feature]
        z_score = (real_value - training_mean) / training_std if training_std > 0 else 0
        print(f"  {feature}: {real_value} (training mean: {training_mean:.1f}, z-score: {z_score:.2f})")

print("\n=== PLACEMENT DISTRIBUTION BY PERFORMANCE ===")
# Group by placement and show average stats
placement_stats = data.groupby('placement')[features].mean()
print(placement_stats)