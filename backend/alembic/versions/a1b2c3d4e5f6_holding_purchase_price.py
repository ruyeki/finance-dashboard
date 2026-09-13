"""holding purchase_price (avg cost/share)

Revision ID: a1b2c3d4e5f6
Revises: f10956130b56
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f10956130b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('holding', schema=None) as batch_op:
        batch_op.add_column(sa.Column('purchase_price', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('holding', schema=None) as batch_op:
        batch_op.drop_column('purchase_price')
