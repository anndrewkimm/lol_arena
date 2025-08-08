import os
import sys
import json
import joblib
import pandas as pd

# Get absolute path to model file relative to this script's location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, 'arena_win_predictor_model.joblib')

# Load your trained model
try:
    model = joblib.load(model_path)
except FileNotFoundError:
    print(json.dumps({"success": False, "error": "Model file 'arena_win_predictor_model.joblib' not found."}))
    sys.exit(1)

# Define the features the model was trained on
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

def predict_batch(matches):
    try:
        X = pd.DataFrame(matches, columns=features)
        preds = model.predict(X)
        probs = model.predict_proba(X)
        results = []

        for i, match in enumerate(matches):
            predicted_placement = int(preds[i]) + 1
            predicted_class_index = int(preds[i])
            confidence = float(probs[i][predicted_class_index])

            results.append({
                'matchId': match.get('matchId'),
                'placement': predicted_placement,
                'confidence': confidence
            })

        print(json.dumps({'success': True, 'results': results}))
    except KeyError as e:
        print(json.dumps({"success": False, "error": f"Required feature missing from input data: {e}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": f"An unexpected error occurred: {e}"}))

def predict_single(input_data):
    try:
        X = pd.DataFrame([[input_data[f] for f in features]], columns=features)
        pred = int(model.predict(X)[0])
        probs = model.predict_proba(X)[0]
        predicted_placement = pred + 1
        confidence = float(probs[pred])

        print(json.dumps({
            'success': True,
            'placement': predicted_placement,
            'confidence': confidence
        }))
    except KeyError as e:
        print(json.dumps({"success": False, "error": f"Required feature missing from input data: {e}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": f"An unexpected error occurred: {e}"}))

if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        
        # This line helps you debug the raw JSON input from your app
        # print("Raw input received:", raw_input)
        
        if '--batch' in sys.argv:
            matches = json.loads(raw_input)
            predict_batch(matches)
        else:
            input_data = json.loads(raw_input)
            predict_single(input_data)
    except json.JSONDecodeError:
        print(json.dumps({"success": False, "error": "Invalid JSON input."}))