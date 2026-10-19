"""Add relationship column to trusted_contacts

Revision ID: 6afbbc46177c
Revises: 
Create Date: 2026-10-18 13:00:39.528459

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6afbbc46177c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add the relationship column to the existing trusted_contacts table.
    # All other tables already exist (created by Base.metadata.create_all on app startup),
    # so we only add the new column and preserve all existing data.
    op.add_column(
        'trusted_contacts',
        sa.Column('relationship', sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('trusted_contacts', 'relationship')
