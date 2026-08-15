import pytest

from app.services import agent_tools


def test_agent_tool_error_message_is_plain_string():
    err = agent_tools.AgentToolError("Document not found")
    assert str(err) == "Document not found"


def test_default_top_k_is_positive():
    assert agent_tools.DEFAULT_TOP_K > 0
