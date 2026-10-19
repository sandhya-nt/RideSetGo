import sqlite3
conn = sqlite3.connect('ridesetgo.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print('=== TABLES ===')
print(tables)
print()
for t in tables:
    print(f'=== {t} ===')
    cur.execute(f"PRAGMA table_info({t})")
    for col in cur.fetchall():
        print(col)
    print()
conn.close()