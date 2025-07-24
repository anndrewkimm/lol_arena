import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
from sklearn.metrics import accuracy_score, classification_report


data = pd.read_csv('backend/data_collection/ArenaData.csv')

# New column named Wins, access placement column, and apply a lambda x, for each x the function checks if x is in [1,2,3,4], return 1, or else return 0
data['Wins'] = data['placement'].apply(lambda x: 1 if x in [1,2,3,4] else 0)

y = data['Wins'] # select target

# choosing features I want to train my model on 
features = ['championId', 'kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']
X = data[features]

train_X, val_X, train_y, val_y = train_test_split(X, y, train_size=0.8, random_state = 42)

def get_accuracy(max_leaf_nodes, train_X, val_X, train_y, val_y):
    model_pipeline = Pipeline(steps=[
    ('model', RandomForestClassifier(class_weight='balanced', random_state=1, max_leaf_nodes=max_leaf_nodes))
    ])
    model_pipeline.fit(train_X, train_y)
    predictions = model_pipeline.predict(val_X)
    accuracy = accuracy_score(val_y, predictions)
    report = classification_report(val_y, predictions)
    importances = model_pipeline.named_steps['model'].feature_importances_
    return accuracy, report, importances

def get_cross_val_score(max_leaf_nodes, X, y):
    pipeline = Pipeline([
    ('model', RandomForestClassifier(class_weight='balanced', random_state=1, max_leaf_nodes=max_leaf_nodes))
    ])
    scores = cross_val_score(pipeline, X, y, cv=5, scoring='accuracy')
    return scores.mean(), scores.std()

print("Train/Validation Results:")
for max_leaf_nodes in [10, 20, 30, 40, 50, 60]:
    accuracy, report, importances = get_accuracy(max_leaf_nodes, train_X, val_X, train_y, val_y)
    print(f"Max leaf nodes: {max_leaf_nodes} \t Accuracy: {accuracy:.4f}")
    print("Classification report:")
    print(report)
    print("Feature importances:")
    for feature, importance in zip(features, importances):
        print(f"{feature}: {importance:.4f}")
    print('-' * 50)

print("\nCross-validation Results:")
for max_leaf_nodes in [10, 20, 30, 40, 50, 60]:
    mean_score, std_score = get_cross_val_score(max_leaf_nodes, X, y)
    print(f"Max leaf nodes: {max_leaf_nodes} \t CV Accuracy: {mean_score:.4f} (+/- {std_score:.4f})")

    

    # 60 nodes gives best accuracy with 0.89