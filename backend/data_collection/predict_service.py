import sys
import json
import joblib
import pandas as pd

model = joblib.load('arena_win_predictor_model.joblib')
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

def predict_batch(matches):
    X = pd.DataFrame(matches, columns=features)
    preds = model.predict(X)  # These are 0-7 predictions
    probs = model.predict_proba(X)
    results = []
    
    for i, match in enumerate(matches):
        # Convert 0-7 prediction back to 1-8 placement
        predicted_placement = int(preds[i]) + 1
        
        # Get confidence for the predicted class
        predicted_class_index = int(preds[i])  # This is the index in the probability array
        confidence = float(probs[i][predicted_class_index])
        
        results.append({
            'matchId': match.get('matchId'),
            'placement': predicted_placement,  # Now 1-8
            'confidence': confidence
        })
    
    print(json.dumps({'success': True, 'results': results}))

def predict_single(input_data):
    X = pd.DataFrame([[input_data[f] for f in features]], columns=features)
    pred = int(model.predict(X)[0])  # This is 0-7
    probs = model.predict_proba(X)[0]
    
    # Convert 0-7 prediction back to 1-8 placement
    predicted_placement = pred + 1
    
    # Get confidence for the predicted class
    confidence = float(probs[pred])  # pred is the index in the probability array
    
    print(json.dumps({
        'success': True, 
        'placement': predicted_placement,  # Now 1-8
        'confidence': confidence
    }))

if __name__ == "__main__":
    if '--batch' in sys.argv:
        matches = json.loads(sys.stdin.read())
        predict_batch(matches)
    else:
        input_data = json.loads(sys.stdin.read())
        predict_single(input_data)