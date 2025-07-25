import joblib
import pandas as pd
import sys
import json

# Define the features that your model was trained on
# Make sure these match the 'features' list in your ml_model.py
FEATURES = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

def load_model(model_filename='arena_win_predictor_model.joblib'):
    """Loads the trained model from a joblib file."""
    try:
        model = joblib.load(model_filename)
        return model
    except FileNotFoundError:
        print(f"Error: Model file '{model_filename}' not found. Make sure it's in the same directory as this script.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        sys.exit(1)

def predict_win(model, data):
    """
    Makes a prediction using the loaded model.
    Data should be a dictionary with feature names as keys.
    """
    try:
        # Create a DataFrame from the input data, ensuring correct feature order
        input_df = pd.DataFrame([data], columns=FEATURES)
        prediction_probability = model.predict_proba(input_df)

        # For binary classification (0 or 1), predict_proba returns [[prob_0, prob_1]]
        # We're interested in the probability of winning (class 1)
        win_probability = prediction_probability[0][1]
        
        # You can also get the direct prediction (0 or 1)
        prediction = model.predict(input_df)[0]

        return {"prediction": int(prediction), "win_probability": float(win_probability)}
    except KeyError as e:
        print(f"Error: Missing feature in input data: {e}. Required features: {FEATURES}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error during prediction: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # This script expects a single JSON string argument containing the feature data
    if len(sys.argv) < 2:
        print("Usage: python predict_service.py <json_data>", file=sys.stderr)
        sys.exit(1)

    input_json = sys.argv[1]
    
    try:
        data_for_prediction = json.loads(input_json)
    except json.JSONDecodeError:
        print("Error: Invalid JSON input.", file=sys.stderr)
        sys.exit(1)

    # Load the model
    model = load_model()

    # Make prediction
    result = predict_win(model, data_for_prediction)
    
    # Output the result as JSON to stdout
    print(json.dumps(result))