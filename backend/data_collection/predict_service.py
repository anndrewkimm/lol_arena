import sys
import json
import joblib
import numpy as np
import pandas as pd

model = joblib.load('arena_win_predictor_model.joblib')
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']

def main():
    input_data = json.loads(sys.stdin.read())
    X = pd.DataFrame([[input_data[f] for f in features]], columns=features)
    pred = model.predict(X)[0]
    prob = model.predict_proba(X)[0][1]
    print(json.dumps({'success': True, 'prediction': int(pred), 'win_probability': float(prob)}))

if __name__ == "__main__":
    main()