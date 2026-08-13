"""create the initial DocFlow schema

Revision ID: 20260813_01
Revises:
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260813_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    job_status = postgresql.ENUM(
        "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", name="jobstatus"
    )
    job_status.create(bind, checkfirst=True)

    if "documents" not in tables:
        op.create_table(
            "documents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("original_filename", sa.String(length=255), nullable=False),
            sa.Column("file_type", sa.String(length=50), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("storage_path", sa.Text(), nullable=False),
            sa.Column("file_content", sa.LargeBinary(), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "jobs" not in tables:
        op.create_table(
            "jobs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("celery_task_id", sa.String(length=255), nullable=True),
            sa.Column("status", job_status, nullable=False),
            sa.Column("progress", sa.Integer(), nullable=False),
            sa.Column("current_stage", sa.String(length=100), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_jobs_status", "jobs", ["status"])

    if "processing_results" not in tables:
        op.create_table(
            "processing_results",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("title", sa.Text(), nullable=True),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("keywords", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("word_count", sa.Integer(), nullable=True),
            sa.Column("language", sa.String(length=50), nullable=True),
            sa.Column("extracted_text", sa.Text(), nullable=True),
            sa.Column("raw_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("is_finalized", sa.Boolean(), nullable=False),
            sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "processing_results" in tables:
        op.drop_table("processing_results")
    if "jobs" in tables:
        op.drop_table("jobs")
    if "documents" in tables:
        op.drop_table("documents")
    postgresql.ENUM(name="jobstatus").drop(bind, checkfirst=True)
