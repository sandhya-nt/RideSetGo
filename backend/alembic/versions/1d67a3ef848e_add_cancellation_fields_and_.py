"""add cancellation fields and notifications table

Revision ID: 1d67a3ef848e
Revises: 89f7ab2b06a1
Create Date: 2026-10-18 13:28:14.578876

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d67a3ef848e'
down_revision: Union[str, Sequence[str], None] = '89f7ab2b06a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add cancellation tracking columns to the rides table.
    op.add_column(
        "rides",
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "rides",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Create the notifications table.
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ride_id", sa.Integer(), nullable=True),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.ForeignKeyConstraint(["ride_id"], ["rides.id"], ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)
    op.create_index(op.f("ix_notifications_ride_id"), "notifications", ["ride_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_notifications_ride_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_table("notifications")
    op.drop_column("rides", "cancelled_at")
    op.drop_column("rides", "cancellation_reason")
