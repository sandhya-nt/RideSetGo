import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models import User, Ride, Payment, Rating

db = SessionLocal()
print('=== USERS ===')
for u in db.query(User).all():
    print(u.id, u.email, u.role, u.full_name)
print()
print('=== RIDES ===')
for r in db.query(Ride).all():
    print(r.id, 'user', r.user_id, r.status, r.pickup_location, '->', r.dropoff_location, r.final_fare, r.created_at)
print()
print('=== PAYMENTS ===')
for p in db.query(Payment).all():
    print(p.id, 'ride', p.ride_id, p.method, p.status, p.amount, p.transaction_id)
print()
print('=== RATINGS ===')
for r in db.query(Rating).all():
    print(r.id, 'ride', r.ride_id, 'user', r.user_id, 'score', r.score, r.comment)
db.close()