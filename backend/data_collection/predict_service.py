import sys
import json
import joblib
import pandas as pd

model = joblib.load('arena_win_predictor_model.joblib')
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

def predict_batch(matches):
    X = pd.DataFrame(matches, columns=features)
    preds = model.predict(X)
    probs = model.predict_proba(X)
    results = []
    for i, match in enumerate(matches):
        pred = int(preds[i])
        class_index = list(model.classes_).index(pred)
        confidence = float(probs[i][class_index])
        results.append({
            'matchId': match.get('matchId'),
            'placement': pred,
            'confidence': confidence
        })
    print(json.dumps({'success': True, 'results': results}))

def predict_single(input_data):
    X = pd.DataFrame([[input_data[f] for f in features]], columns=features)
    pred = int(model.predict(X)[0])
    probs = model.predict_proba(X)[0]
    class_index = list(model.classes_).index(pred)
    confidence = float(probs[class_index])
    print(json.dumps({'success': True, 'placement': pred, 'confidence': confidence}))

if __name__ == "__main__":
    if '--batch' in sys.argv:
        matches = json.loads(sys.stdin.read())
        predict_batch(matches)
    else:
        input_data = json.loads(sys.stdin.read())
        predict_single(input_data)
    
    