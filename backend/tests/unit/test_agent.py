import uuid
from types import SimpleNamespace

import pytest

from app.services import agent as agent_module
from app.services.agent import AgentError, run_agent


class _FakeDB:
    def __init__(self):
        self.added = []
        self.committed = 0

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1


class _FakePart:
    def __init__(self, function_call=None, text=None):
        self.function_call = function_call
        self.text = text


class _FakeFunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class _FakeContent:
    def __init__(self, parts):
        self.parts = parts


class _FakeCandidate:
    def __init__(self, parts):
        self.content = _FakeContent(parts)


class _FakeResponse:
    def __init__(self, parts, text=None):
        self.candidates = [_FakeCandidate(parts)]
        self.text = text


def _fake_client(generate_content):
    return SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )


async def test_run_agent_raises_without_api_key(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", None)

    with pytest.raises(AgentError):
        await run_agent(_FakeDB(), uuid.uuid4(), "What is in my documents?")


async def test_run_agent_returns_answer_without_tool_calls_and_persists_it(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")

    async def fake_generate_content(*args, **kwargs):
        return _FakeResponse(parts=[_FakePart(text="Final answer")], text="Final answer")

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(fake_generate_content)
    )

    db = _FakeDB()
    result = await run_agent(db, uuid.uuid4(), "Summarize my documents")

    assert result.answer == "Final answer"
    assert result.steps == []
    assert db.committed == 1
    assert len(db.added) == 1
    assert db.added[0].answer == "Final answer"
    assert db.added[0].tool_trace == []
    assert db.added[0].steps_taken == 0


async def test_run_agent_raises_on_empty_answer(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")

    async def fake_generate_content(*args, **kwargs):
        return _FakeResponse(parts=[_FakePart(text="")], text="")

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(fake_generate_content)
    )

    with pytest.raises(AgentError):
        await run_agent(_FakeDB(), uuid.uuid4(), "Anything")


async def test_run_agent_executes_tool_then_returns_answer(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")
    call_count = {"n": 0}

    async def fake_generate_content(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            call = _FakeFunctionCall("list_user_documents", {})
            return _FakeResponse(parts=[_FakePart(function_call=call)])
        return _FakeResponse(parts=[_FakePart(text="Here is your list")], text="Here is your list")

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(fake_generate_content)
    )

    async def fake_list_user_documents(db, user_id, status=None, limit=20):
        return [{"job_id": "abc", "filename": "notes.txt", "status": "completed"}]

    monkeypatch.setattr(agent_module.agent_tools, "list_user_documents", fake_list_user_documents)

    db = _FakeDB()
    result = await run_agent(db, uuid.uuid4(), "What documents do I have?")

    assert result.answer == "Here is your list"
    assert len(result.steps) == 1
    assert result.steps[0].tool == "list_user_documents"
    assert result.steps[0].error is None
    assert result.steps[0].result[0]["filename"] == "notes.txt"
    assert len(db.added) == 1
    assert db.added[0].steps_taken == 1
    assert db.added[0].tool_trace[0]["tool"] == "list_user_documents"


async def test_run_agent_records_tool_error_and_continues(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")
    call_count = {"n": 0}

    async def fake_generate_content(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            call = _FakeFunctionCall("get_document_metadata", {"document_id": str(uuid.uuid4())})
            return _FakeResponse(parts=[_FakePart(function_call=call)])
        return _FakeResponse(parts=[_FakePart(text="I could not find that document")], text="I could not find that document")

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(fake_generate_content)
    )

    async def fake_get_document_metadata(db, document_id, user_id):
        raise agent_module.agent_tools.AgentToolError("Document not found")

    monkeypatch.setattr(
        agent_module.agent_tools, "get_document_metadata", fake_get_document_metadata
    )

    db = _FakeDB()
    result = await run_agent(db, uuid.uuid4(), "Tell me about this document")

    assert result.answer == "I could not find that document"
    assert len(result.steps) == 1
    assert result.steps[0].error == "Document not found"
    assert result.steps[0].result is None


async def test_run_agent_raises_after_max_steps_without_persisting(monkeypatch):
    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")

    async def fake_generate_content(*args, **kwargs):
        call = _FakeFunctionCall("list_user_documents", {})
        return _FakeResponse(parts=[_FakePart(function_call=call)])

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(fake_generate_content)
    )

    async def fake_list_user_documents(db, user_id, status=None, limit=20):
        return []

    monkeypatch.setattr(agent_module.agent_tools, "list_user_documents", fake_list_user_documents)

    db = _FakeDB()
    with pytest.raises(AgentError):
        await run_agent(db, uuid.uuid4(), "Loop forever")

    assert db.added == []
    assert db.committed == 0


async def test_run_agent_raises_on_timeout(monkeypatch):
    import asyncio

    monkeypatch.setattr(agent_module.settings, "gemini_api_key", "fake-key")
    monkeypatch.setattr(agent_module.settings, "llm_request_timeout_seconds", 0.01)

    async def slow_generate_content(*args, **kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(
        agent_module.genai, "Client", lambda api_key: _fake_client(slow_generate_content)
    )

    with pytest.raises(AgentError):
        await run_agent(_FakeDB(), uuid.uuid4(), "Anything")
    