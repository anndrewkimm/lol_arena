import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report


data = pd.read_csv('backend/data_collection/ArenaData.csv')

# New column named Wins, access placement column, and apply a lambda x, for each x the function checks if x is in [1,2,3,4], return 1, or else return 0
data['Wins'] = data['placement'].apply(lambda x: 1 if x in [1,2,3,4] else 0)

y = data['Wins'] # select target

# choosing features I want to train my model on 
features = ['kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']
X = data[features]

train_X, val_X, train_y, val_y = train_test_split(X, y, test_size=0.2, random_state = 42)

def get_accuracy(max_leaf_nodes, train_X, val_X, train_y, val_y):
    forest_model = RandomForestClassifier(class_weight='balanced', random_state=1, max_leaf_nodes=max_leaf_nodes)
    forest_model.fit(train_X, train_y)
    prediction = forest_model.predict(val_X)
    accuracy =  accuracy_score(val_y, prediction)
    report = classification_report(val_y, prediction)
    importances = forest_model.feature_importances_
    return accuracy, report, importances

for max_leaf_nodes in [10, 20, 30, 40, 50, 60]:
    my_accuracy, report, importances = get_accuracy(max_leaf_nodes, train_X, val_X, train_y, val_y)
    print("Max leaf node: %d \t Accuracy: %.2f" %(max_leaf_nodes, my_accuracy))
    print("Classification Report: \n", report)

    print("Feature Importances:")
    for feature, importance in zip(features, importances):
        print(f"{feature}: {importance:.4f}")
    print('-' * 50)

    

    # 60 nodes gives best accuracy with 0.89



