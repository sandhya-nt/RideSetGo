import sqlite3
conn = sqlite3.connect('ridesetgo.db')
cur = conn.cursor()
print('=== USERS ===')
for r in cur.execute("SELECT id, email, full_name, role, is_active FROM users"):
    print(r)
print()
print('=== RIDE CATEGORIES ===')
for r in cur.execute("SELECT id, name, display_name, base_multiplier, min_fare, icon_name FROM ride_categories"):
    print(r)
print()
print('=== RIDES ===')
for r in cur.execute("SELECT id, user_id, status, pickup_location, dropoff_location, final_fare, created_at FROM rides"):
    print(r)
print()
print('=== PAYMENTS ===')
for r in cur.execute("SELECT id, ride_id, method, status, amount, transaction_id FROM payments"):
    print(r)
print()
print('=== RATINGS ===')
for r in cur.execute("SELECT id, ride_id, user_id, score, comment FROM ratings"):
    print(r)
print()
print('=== TRUSTED CONTACTS ===')
for r in cur.execute("SELECT * FROM trusted_contacts"):
    print(r)
print()
print('=== SAFETY REPORTS ===')
for r in cur.execute("SELECT * FROM safety_reports"):
    print(r)
conn.close()