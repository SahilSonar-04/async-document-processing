"""add an extraction mode to jobs

Revision ID: 20260813_02
Revises: 20260813_01
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa


revision = "20260813_02"
down_revision = "20260813_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("jobs")}
    if "extraction_mode" not in columns:
        op.add_column(
            "jobs",
            sa.Column(
                "extraction_mode",
                sa.String(length=20),
                nullable=False,
                server_default="classical",
            ),
        )
        op.create_check_constraint(
            "ck_jobs_extraction_mode",
            "jobs",
            "extraction_mode IN ('classical', 'llm')",
        )
        op.alter_column("jobs", "extraction_mode", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("jobs")}
    constraints = {constraint["name"] for constraint in inspector.get_check_constraints("jobs")}
    if "ck_jobs_extraction_mode" in constraints:
        op.drop_constraint("ck_jobs_extraction_mode", "jobs", type_="check")
    if "extraction_mode" in columns:
        op.drop_column("jobs", "extraction_mode")
