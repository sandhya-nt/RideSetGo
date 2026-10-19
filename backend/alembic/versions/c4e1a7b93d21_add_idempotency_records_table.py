"""add idempotency_records table

Revision ID: c4e1a7b93d21
Revises: 1d67a3ef848e
Create Date: 2026-10-19 19:50:00.000000

Phase 19 — duplicate-submission protection for non-idempotent requests
(booking). The table stores the outcome of a booking so that a retry with
the same ``Idempotency-Key`` replays the original response instead of
creating a second ride and a second payment.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e1a7b93d21"
down_revision: Union[str, Sequence[str], None] = "1d67a3ef848e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "endpoint", "key", name="uq_idempotency_user_endpoint_key"
        ),
    )
    op.create_index(
        op.f("ix_idempotency_records_user_id"),
        "idempotency_records",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_idempotency_records_created_at"),
        "idempotency_records",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_idempotency_records_created_at"), table_name="idempotency_records"
    )
    op.drop_index(
        op.f("ix_idempotency_records_user_id"), table_name="idempotency_records"
    )
    op.drop_table("idempotency_records")
