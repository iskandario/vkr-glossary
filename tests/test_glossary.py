"""Проверки данных глоссария и Web API: uv run pytest -q"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app, glossary  # noqa: E402

client = TestClient(app)


def test_data_is_valid_and_large_enough():
    g = glossary()  # валидация в модели: id уникальны, связи и источники существуют
    assert len(g.terms) >= 60
    assert sum(len(t.related) for t in g.terms) >= 80
    assert all(t.sources for t in g.terms)


def test_every_term_is_connected():
    g = glossary()
    linked = {t.id for t in g.terms if t.related} | {r.to for t in g.terms for r in t.related}
    assert linked == {t.id for t in g.terms}


def test_authored_terms_cite_vkr():
    for t in glossary().terms:
        if t.authored:
            assert "vkr" in t.sources, t.id


def test_non_authored_terms_have_external_source():
    for t in glossary().terms:
        if not t.authored:
            assert set(t.sources) - {"vkr"}, t.id


def test_every_source_is_used():
    g = glossary()
    used = {s for t in g.terms for s in t.sources}
    assert {s.id for s in g.sources} == used


def test_health_and_stats():
    assert client.get("/health").json()["ok"] is True
    s = client.get("/api/stats").json()
    assert s["terms"] == len(glossary().terms)


def test_term_card_has_incoming_and_outgoing():
    t = client.get("/api/terms/whisper").json()
    assert t["term"] == "Whisper"
    assert any(r["to"]["id"] == "encoder-decoder" for r in t["related"])
    assert any(r["from"]["id"] == "faster-whisper" for r in t["incoming"])
    assert t["sources"][0]["url"].startswith("https://")


def test_unknown_term_404():
    assert client.get("/api/terms/nope").status_code == 404


@pytest.mark.parametrize("q,expected", [("webgpu", "webgpu"), ("задерж", "latency"), ("ёлка", None), ("Клифф", "cliffs-delta")])
def test_search(q, expected):
    res = client.get("/api/search", params={"q": q}).json()
    if expected is None:
        assert res == []
    else:
        assert expected in [r["id"] for r in res]


def test_graph_shape():
    g = client.get("/api/graph").json()
    ids = {n["data"]["id"] for n in g["nodes"]}
    assert all(e["data"]["source"] in ids and e["data"]["target"] in ids for e in g["edges"])


def test_dictionary_server_compatible():
    r = client.get("/dictionary/WER")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/plain")
    assert "Доля ошибочных слов" in r.text
    assert client.get("/dictionary", params={"word": "Docker Compose"}).status_code == 200
    assert client.get("/dictionary/абракадабра").status_code == 404


def test_frontend_served():
    assert "Глоссарий ВКР" in client.get("/").text
    assert client.get("/static/app.js").status_code == 200
