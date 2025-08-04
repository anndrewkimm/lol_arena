import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
from xgboost import XGBClassifier
import joblib

# Load data
data = pd.read_csv('backend/data_collection/ArenaData.csv')

# Create target variable 'Wins'
data['Wins'] = data['placement'].apply(lambda x: 1 if x in [1,2,3,4] else 0)
y = data['Wins']

# Select features
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']
X = data[features]

# Split data
train_X, val_X, train_y, val_y = train_test_split(X, y, train_size=0.8, random_state=42)

def get_accuracy(max_depth, train_X, val_X, train_y, val_y):
    # Pass 'early_stopping_rounds' and 'eval_metric' to the model constructor
    model_pipeline = Pipeline(steps=[
        ('model', XGBClassifier(
            n_estimators=1000, 
            learning_rate=0.05, 
            max_depth=max_depth,
            eval_metric='logloss',
            early_stopping_rounds=10  # Now a constructor parameter
        ))
    ])
    
    # Pass 'eval_set' directly to the pipeline's fit method
    model_pipeline.fit(
        train_X, 
        train_y, 
        model__eval_set=[(val_X, val_y)]
    )
    
    predictions = model_pipeline.predict(val_X)
    accuracy = accuracy_score(val_y, predictions)
    report = classification_report(val_y, predictions)
    importances = model_pipeline.named_steps['model'].feature_importances_
    return accuracy, report, importances, model_pipeline

def get_cross_val_score(max_depth, X, y):
    # The 'early_stopping_rounds' parameter is not used here for cross_val_score
    pipeline = Pipeline([
        ('model', XGBClassifier(
            n_estimators=100, 
            learning_rate=0.05, 
            max_depth=max_depth, 
            eval_metric='logloss'
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
        accuracy, report, importances, model_pipeline = get_accuracy(max_depth, train_X, val_X, train_y, val_y)
        
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