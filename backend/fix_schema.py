"""Apply the missing schema changes directly.

The alembic_version table records 1d67a3ef848e as applied, but the actual
columns/table were never created in ridesetgo.db. This script applies the
missing DDL so the DB matches the SQLAlchemy models.
"""
import sqlite3

DB = "ridesetgo.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

# Check current columns of rides
cur.execute("PRAGMA table_info(rides)")
cols = [r[1] for r in cur.fetchall()]
print("rides columns:", cols)

if "cancellation_reason" not in cols:
    print("Adding cancellation_reason...")
    cur.execute("ALTER TABLE rides ADD COLUMN cancellation_reason TEXT")
if "cancelled_at" not in cols:
    print("Adding cancelled_at...")
    cur.execute("ALTER TABLE rides ADD COLUMN cancelled_at DATETIME")

# Check notifications table
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'")
if not cur.fetchone():
    print("Creating notifications table...")
    cur.execute(
        """
        CREATE TABLE notifications (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            ride_id INTEGER,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME,
            CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users (id),
            CONSTRAINT fk_notifications_ride_id FOREIGN KEY (ride_id) REFERENCES rides (id)
        )
        """
    )
    cur.execute("CREATE INDEX ix_notifications_user_id ON notifications (user_id)")
    cur.execute("CREATE INDEX ix_notifications_ride_id ON notifications (ride_id)")
else:
    print("notifications table already exists")

conn.commit()
conn.close()
print("Done.")