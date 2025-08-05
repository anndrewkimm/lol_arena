import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
from xgboost import XGBClassifier
import joblib
import numpy as np

# Load data
data = pd.read_csv('backend/data_collection/ArenaData.csv')

# Create target variable 'placement_encoded'
# This converts the 1-8 placements to 0-7, as expected by XGBoost
y = data['placement'] - 1

# Select features
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']
X = data[features]

# Split data
train_X, val_X, train_y, val_y = train_test_split(X, y, train_size=0.8, random_state=42)

# --- UPDATED: Calculate a more aggressive custom sample weighting ---
# This is a more robust way to handle extreme class imbalance.
# We manually calculate weights that are inversely proportional to class frequencies,
# giving a much higher weight to the minority classes (placements 5-8).
class_counts = np.bincount(train_y)
max_count = np.max(class_counts)
class_weights = max_count / class_counts
sample_weights = np.array([class_weights[label] for label in train_y])


def get_accuracy(max_depth, train_X, val_X, train_y, val_y, sample_weights):
    """
    Trains and evaluates an XGBoost model with a specific max_depth,
    applying sample weights to handle class imbalance.
    """
    model_pipeline = Pipeline(steps=[
        ('model', XGBClassifier(
            n_estimators=1000,
            learning_rate=0.05,
            max_depth=max_depth,
            objective='multi:softprob',
            num_class=8,  # 8 classes for placements 1-8
            eval_metric='mlogloss',
            early_stopping_rounds=10
        ))
    ])

    # Pass 'eval_set' and 'sample_weight' to the fit method
    # and use the special 'model__' prefix to pass sample_weights to the
    # XGBClassifier step within the pipeline.
    model_pipeline.fit(
        train_X,
        train_y,
        model__eval_set=[(val_X, val_y)],
        model__sample_weight=sample_weights # <-- The key addition
    )

    predictions = model_pipeline.predict(val_X)
    accuracy = accuracy_score(val_y, predictions)
    report = classification_report(val_y, predictions, zero_division=0)
    importances = model_pipeline.named_steps['model'].feature_importances_
    return accuracy, report, importances, model_pipeline

def get_cross_val_score(max_depth, X, y):
    """
    Calculates the cross-validation score for a model with a specific max_depth.
    
    Note: The sample_weight logic for cross_val_score is more complex, but we'll 
    just show a simplified version here for demonstration.
    """
    pipeline = Pipeline([
        ('model', XGBClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=max_depth,
            eval_metric='mlogloss',
            objective='multi:softprob',
            num_class=8
        ))
    ])
    
    scores = cross_val_score(pipeline, X, y, cv=5, scoring='accuracy')
    return scores.mean(), scores.std()

print("Train/Validation Results:")
best_accuracy = 0
best_max_depth = 0
best_model_pipeline = None

for max_depth in [2, 4, 6, 8, 10]:
    try:
        accuracy, report, importances, model_pipeline = get_accuracy(max_depth, train_X, val_X, train_y, val_y, sample_weights)
        
        print(f"Max depth: {max_depth} \t Accuracy: {accuracy:.4f}")
        print("Classification report:")
        print(report)
        print("Feature importances:")
        for feature, importance in zip(features, importances):
            print(f"{feature}: {importance:.4f}")
        print('-' * 50)
        
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_max_depth = max_depth
            best_model_pipeline = model_pipeline
    except Exception as e:
        print(f"An error occurred for max_depth={max_depth}: {e}")
        continue

print("\nCross-validation Results:")
for max_depth in [2, 4, 6, 8, 10]:
    try:
        mean_score, std_score = get_cross_val_score(max_depth, X, y)
        print(f"Max depth: {max_depth} \t CV Accuracy: {mean_score:.4f} (+/- {std_score:.4f})")
    except Exception as e:
        print(f"An error occurred for max_depth={max_depth}: {e}")
        continue

# --- Save the trained model ---
if best_model_pipeline:
    model_filename = 'arena_win_predictor_model.joblib'
    joblib.dump(best_model_pipeline, model_filename)
    print(f"\n✅ Trained model saved as '{model_filename}' with max_depth={best_max_depth} and validation accuracy={best_accuracy:.4f}")
else:
    print("\n⚠️ No model was saved. Ensure the training loop correctly identifies and stores the best model.")

print(y.value_counts().sort_index())
