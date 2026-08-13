"""add pgvector document chunks

Revision ID: 20260813_03
Revises: 20260813_02
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


revision = "20260813_03"
down_revision = "20260813_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    inspector = sa.inspect(op.get_bind())
    if "document_chunks" in inspector.get_table_names():
        return

    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_document_chunks_index"),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "document_chunks" in inspector.get_table_names():
        op.drop_table("document_chunks")
