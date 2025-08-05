import joblib
import pandas as pd

try:
    model = joblib.load('arena_win_predictor_model.joblib')
    print("✅ Successfully loaded model.")
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    exit()

# Create sample data with your features
# Ensure this data matches the columns used for training
sample_data = {
    'championId': [121],
    'kills': [10],
    'deaths': [5],
    'assists': [8],
    'totalDamageDealt': [20000],
    'totalDamageTaken': [15000],
    'goldEarned': [10000]
}

X_test = pd.DataFrame(sample_data)

# Get the predicted probabilities for each class
predicted_probabilities = model.predict_proba(X_test)

print(f"Number of classes the model can predict: {len(predicted_probabilities[0])}")
print(f"Probabilities for each class: {predicted_probabilities[0]}")

if len(predicted_probabilities[0]) > 2:
    print("\n✅ This model is a multiclass classifier.")
else:
    print("\n❌ This model is a binary classifier.")