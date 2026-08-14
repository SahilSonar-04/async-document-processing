import uuid

from app.models.models import Document, Job, JobStatus, ProcessingResult


async def _create_document(db_session, user_id):
    document = Document(
        filename="doc.txt",
        original_filename="doc.txt",
        file_type="txt",
        file_size=100,
        storage_path="/tmp/doc.txt",
        user_id=user_id,
    )
    db_session.add(document)
    await db_session.flush()
    return document


async def test_retry_rejected_when_job_not_terminal(client, register_and_login, db_session):
    token, user = await register_and_login("retry@example.com")
    document = await _create_document(db_session, uuid.UUID(user["id"]))
    job = Job(document_id=document.id, status=JobStatus.QUEUED, progress=0, extraction_mode="classical")
    db_session.add(job)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/jobs/{job.id}/retry", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 400


async def test_retry_allowed_when_job_failed(client, register_and_login, db_session):
    token, user = await register_and_login("retry-ok@example.com")
    document = await _create_document(db_session, uuid.UUID(user["id"]))
    job = Job(
        document_id=document.id,
        status=JobStatus.FAILED,
        progress=0,
        extraction_mode="classical",
        retry_count=0,
    )
    db_session.add(job)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/jobs/{job.id}/retry", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["retry_count"] == 1


async def test_update_result_rejected_when_finalized(client, register_and_login, db_session):
    token, user = await register_and_login("finalize@example.com")
    document = await _create_document(db_session, uuid.UUID(user["id"]))
    job = Job(document_id=document.id, status=JobStatus.COMPLETED, progress=100, extraction_mode="classical")
    db_session.add(job)
    await db_session.flush()
    result = ProcessingResult(job_id=job.id, title="Original", is_finalized=True)
    db_session.add(result)
    await db_session.commit()

    response = await client.patch(
        f"/api/v1/jobs/{job.id}/result",
        json={"title": "Changed"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400


async def test_update_result_allowed_before_finalize(client, register_and_login, db_session):
    token, user = await register_and_login("edit@example.com")
    document = await _create_document(db_session, uuid.UUID(user["id"]))
    job = Job(document_id=document.id, status=JobStatus.COMPLETED, progress=100, extraction_mode="classical")
    db_session.add(job)
    await db_session.flush()
    result = ProcessingResult(job_id=job.id, title="Original", is_finalized=False)
    db_session.add(result)
    await db_session.commit()

    response = await client.patch(
        f"/api/v1/jobs/{job.id}/result",
        json={"title": "Changed"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Changed"


async def test_finalize_locks_result(client, register_and_login, db_session):
    token, user = await register_and_login("lock@example.com")
    document = await _create_document(db_session, uuid.UUID(user["id"]))
    job = Job(document_id=document.id, status=JobStatus.COMPLETED, progress=100, extraction_mode="classical")
    db_session.add(job)
    await db_session.flush()
    result = ProcessingResult(job_id=job.id, title="Original", is_finalized=False)
    db_session.add(result)
    await db_session.commit()

    first = await client.post(
        f"/api/v1/jobs/{job.id}/finalize",
        json={"confirmed": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200
    assert first.json()["is_finalized"] is True

    second = await client.post(
        f"/api/v1/jobs/{job.id}/finalize",
        json={"confirmed": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second.status_code == 400
