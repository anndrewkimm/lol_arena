import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
import os

# Get the directory where the current script is located
script_dir = os.path.dirname(os.path.abspath(__file__))

# Build the full path to the CSV file
file_path = os.path.join(script_dir, "ArenaData.csv")


data = pd.read_csv('ArenaData.csv')

y = data.isWinner # select target

# choosing features I want to train my model on 
features = ['kills', 'deaths', 'assists', 'totalDamageDealt', 'totalDamageTaken', 'goldEarned']
X = data[features]

train_X, val_X, train_y, val_y = train_test_split(X, y, random_state = 0)

forest_model = RandomForestRegressor(random_state = 1)
forest_model.fit(train_X, train_y)
prediction = forest_model.predict(val_X)
print(mean_absolute_error(val_y, prediction))


