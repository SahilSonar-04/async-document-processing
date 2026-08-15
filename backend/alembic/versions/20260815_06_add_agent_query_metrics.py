from alembic import op
import sqlalchemy as sa


revision = "20260815_06"
down_revision = "20260815_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("agent_queries")}

    if "latency_ms" not in columns:
        op.add_column(
            "agent_queries",
            sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        )
        op.alter_column("agent_queries", "latency_ms", server_default=None)

    if "llm_call_count" not in columns:
        op.add_column(
            "agent_queries",
            sa.Column("llm_call_count", sa.Integer(), nullable=False, server_default="0"),
        )
        op.alter_column("agent_queries", "llm_call_count", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("agent_queries")}

    if "llm_call_count" in columns:
        op.drop_column("agent_queries", "llm_call_count")
    if "latency_ms" in columns:
        op.drop_column("agent_queries", "latency_ms")
