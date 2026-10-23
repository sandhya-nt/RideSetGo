import pandas as pd
df = pd.read_csv('amritsar_uber_dataset.csv')
print('shape:', df.shape)
print('cols:', df.columns.tolist())
print(df.dtypes)
print(df.head())
