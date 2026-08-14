import io


async def test_upload_valid_text_file_creates_job(client, register_and_login):
    token, _ = await register_and_login("uploader@example.com")
    files = {"file": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")}
    response = await client.post(
        "/api/v1/upload",
        files=files,
        data={"extraction_mode": "classical"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "notes.txt"
    assert body["status"] == "queued"
    assert body["document_id"]
    assert body["job_id"]


async def test_upload_rejects_disallowed_extension(client, register_and_login):
    token, _ = await register_and_login("badext@example.com")
    files = {"file": ("payload.exe", io.BytesIO(b"binary"), "application/octet-stream")}
    response = await client.post(
        "/api/v1/upload",
        files=files,
        data={"extraction_mode": "classical"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400


async def test_upload_requires_authentication(client):
    files = {"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")}
    response = await client.post(
        "/api/v1/upload", files=files, data={"extraction_mode": "classical"}
    )
    assert response.status_code == 401


async def test_list_jobs_scoped_to_owner(client, register_and_login):
    token_a, _ = await register_and_login("owner-a@example.com")
    token_b, _ = await register_and_login("owner-b@example.com")

    files = {"file": ("a.txt", io.BytesIO(b"content a"), "text/plain")}
    await client.post(
        "/api/v1/upload",
        files=files,
        data={"extraction_mode": "classical"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    response_a = await client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token_a}"})
    response_b = await client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token_b}"})

    assert response_a.json()["total"] == 1
    assert response_b.json()["total"] == 0
    