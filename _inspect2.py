import pandas as pd
df = pd.read_csv('amritsar_uber_dataset.csv')
print('missing:', df.isna().sum().sum())
print(df.isna().sum())
# unique locations
locs = set(df['pickup_location'].dropna().unique()) | set(df['dropoff_location'].dropna().unique())
print('unique_all_locs:', len(locs))
# also just union after cleaning conceptually
pu = df['pickup_location'].astype(str).str.strip()
do = df['dropoff_location'].astype(str).str.strip()
all_l = pd.concat([pu,do]).str.title().dropna()
# but user says strip spaces, fix case - be precise
all_l2 = pd.concat([df['pickup_location'].astype(str).str.strip(), df['dropoff_location'].astype(str).str.strip()])
all_l2 = all_l2[all_l2 != 'nan']
all_l2 = all_l2.str.replace(r'\s+', ' ', regex=True)
# fix case? maybe title case or just normalize
all_l2n = all_l2.str.title()
uniq = sorted(set(all_l2n))
print('cleaned_unique:', len(uniq))
