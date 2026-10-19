import sqlite3
conn = sqlite3.connect('ridesetgo.db')
cur = conn.cursor()
print('alembic_version:', cur.execute("SELECT version_num FROM alembic_version").fetchall())
conn.close()