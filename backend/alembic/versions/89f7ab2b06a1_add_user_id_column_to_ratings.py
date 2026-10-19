"""Add user_id column to ratings

Revision ID: 89f7ab2b06a1
Revises: 6afbbc46177c
Create Date: 2026-10-18 13:11:30.977189

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '89f7ab2b06a1'
down_revision: Union[str, Sequence[str], None] = '6afbbc46177c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'ratings',
        sa.Column('user_id', sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ratings', 'user_id')
