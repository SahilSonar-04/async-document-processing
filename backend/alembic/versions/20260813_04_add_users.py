"""add users and scope documents to owner

Revision ID: 20260813_04
Revises: 20260813_03
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260813_04"
down_revision = "20260813_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    columns = {column["name"] for column in inspector.get_columns("documents")}
    if "user_id" not in columns:
        op.add_column("documents", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_documents_user_id", "documents", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        op.create_index("ix_documents_user_id", "documents", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "documents" in tables:
        columns = {column["name"] for column in inspector.get_columns("documents")}
        if "user_id" in columns:
            op.drop_constraint("fk_documents_user_id", "documents", type_="foreignkey")
            op.drop_index("ix_documents_user_id", table_name="documents")
            op.drop_column("documents", "user_id")

    if "users" in tables:
        op.drop_table("users")
        