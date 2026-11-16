"""Глоссарий ВКР: Web API + фронтенд семантического графа.

API (JSON):
  GET /api/terms?category=&q=      список терминов
  GET /api/terms/{id}              термин с определением, источниками и связями (входящими и исходящими)
  GET /api/categories              категории и число терминов
  GET /api/sources[/{id}]          источники
  GET /api/graph                   узлы и рёбра для Cytoscape.js
  GET /api/search?q=               поиск по названию, английскому названию и определению
  GET /api/stats                   сводка
Совместимость с brendanburns/dictionary-server (text/plain):
  GET /dictionary/{word}, GET /dictionary?word=
Служебное: GET /health, документация OpenAPI — /docs.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, model_validator

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("GLOSSARY_DATA", ROOT / "data"))
WEB = Path(os.environ.get("GLOSSARY_WEB", ROOT / "web"))
VERSION = "1.4.0"

RelType = Literal["is_a", "part_of", "uses", "implements", "measures", "affects", "alternative", "related"]
REL_LABELS = {"is_a": "является видом", "part_of": "часть", "uses": "использует", "implements": "реализует",
              "measures": "измеряет", "affects": "влияет на", "alternative": "альтернатива", "related": "связано"}


class Relation(BaseModel):
    to: str
    type: RelType


class Term(BaseModel):
    id: str
    term: str
    en: str
    category: str
    definition: str
    simple: str = ""
    vkr: list[str] = []
    sources: list[str]
    related: list[Relation] = []
    authored: bool = False


class Source(BaseModel):
    id: str
    type: Literal["paper", "standard", "docs", "book", "vkr"]
    title: str
    url: str | None = None


class Glossary(BaseModel):
    categories: dict[str, str]
    terms: list[Term]
    sources: list[Source]
    outline: list[dict]

    @model_validator(mode="after")
    def check(self) -> "Glossary":
        ids = [t.id for t in self.terms]
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            raise ValueError(f"повторяющиеся id: {dup}")
        src = {s.id for s in self.sources}
        term_ids = set(ids)
        for t in self.terms:
            if t.category not in self.categories:
                raise ValueError(f"{t.id}: неизвестная категория {t.category}")
            if not t.sources:
                raise ValueError(f"{t.id}: нет источника")
            if not t.vkr:
                raise ValueError(f"{t.id}: термину нет места в ВКР (data/vkr.yaml) — не по теме")
            for sec in t.vkr:
                if sec not in self.section_ids():
                    raise ValueError(f"{t.id}: неизвестный параграф ВКР {sec}")
            if not t.simple:
                raise ValueError(f"{t.id}: нет объяснения «простыми словами» (data/simple.yaml)")
            for s in t.sources:
                if s not in src:
                    raise ValueError(f"{t.id}: неизвестный источник {s}")
            for r in t.related:
                if r.to not in term_ids:
                    raise ValueError(f"{t.id}: связь на несуществующий термин {r.to}")
                if r.to == t.id:
                    raise ValueError(f"{t.id}: связь сама на себя")
        return self

    def section_ids(self) -> dict[str, str]:
        out = {}
        for ch in self.outline:
            if not ch.get("sections"):
                out[ch["id"]] = ch["title"]
            for s in ch.get("sections", []):
                out[s["id"]] = f"{s['id']} {s['title']}"
        return out


@lru_cache(maxsize=1)
def glossary() -> Glossary:
    g = yaml.safe_load((DATA / "glossary.yaml").read_text(encoding="utf-8"))
    s = yaml.safe_load((DATA / "sources.yaml").read_text(encoding="utf-8"))
    simple = yaml.safe_load((DATA / "simple.yaml").read_text(encoding="utf-8"))
    vkr = yaml.safe_load((DATA / "vkr.yaml").read_text(encoding="utf-8"))
    terms = [{**t, "simple": simple.get(t["id"], ""), "vkr": vkr["terms"].get(t["id"], [])} for t in g["terms"]]
    return Glossary(categories=g["categories"], terms=terms, sources=s, outline=vkr["outline"])


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().replace("ё", "е")).strip()


def term_or_404(term_id: str) -> Term:
    for t in glossary().terms:
        if t.id == term_id:
            return t
    raise HTTPException(404, f"термин {term_id} не найден")


def find(word: str) -> Term | None:
    w = norm(word)
    for t in glossary().terms:
        if w in (t.id, norm(t.term), norm(t.en)) or w in norm(t.en).replace("(", " ").replace(")", " ").split():
            return t
    hits = search_terms(word)
    return hits[0] if hits else None


def search_terms(q: str) -> list[Term]:
    w = norm(q)
    if not w:
        return []
    scored = []
    for t in glossary().terms:
        name, en, d = norm(t.term), norm(t.en), norm(t.definition + " " + t.simple)
        score = 3 if name.startswith(w) or en.startswith(w) else 2 if w in name or w in en else 1 if w in d else 0
        if score:
            scored.append((-score, t.term, t))
    return [t for *_, t in sorted(scored, key=lambda x: (x[0], x[1]))]


def brief(t: Term) -> dict:
    g = glossary()
    return {"id": t.id, "term": t.term, "en": t.en, "category": t.category,
            "category_name": g.categories[t.category], "authored": t.authored, "simple": t.simple}


app = FastAPI(title="Глоссарий ВКР", version=VERSION,
              description="Термины ВКР о распределении распознавания речи между браузером и сервером")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    g = glossary()
    return {"ok": True, "version": VERSION, "terms": len(g.terms)}


@app.get("/api/stats")
def api_stats() -> dict:
    g = glossary()
    edges = sum(len(t.related) for t in g.terms)
    return {"version": VERSION, "terms": len(g.terms), "relations": edges, "sources": len(g.sources),
            "authored_terms": sum(t.authored for t in g.terms),
            "by_category": {c: sum(t.category == c for t in g.terms) for c in g.categories}}


@app.get("/api/categories")
def api_categories() -> list[dict]:
    g = glossary()
    return [{"id": c, "name": n, "terms": sum(t.category == c for t in g.terms)} for c, n in g.categories.items()]


@app.get("/api/terms")
def api_terms(category: str | None = None, q: str | None = None, detail: bool = False) -> list[dict]:
    terms = search_terms(q) if q else sorted(glossary().terms, key=lambda t: norm(t.term))
    return [{**brief(t), **({"definition": t.definition, "vkr": t.vkr} if detail else {})}
            for t in terms if category is None or t.category == category]


@app.get("/api/terms/{term_id}")
def api_term(term_id: str) -> dict:
    t = term_or_404(term_id)
    g = glossary()
    src = {s.id: s for s in g.sources}
    incoming = [{"from": brief(o), "type": r.type, "label": REL_LABELS[r.type]}
                for o in g.terms for r in o.related if r.to == t.id]
    secs = g.section_ids()
    return {**brief(t), "definition": t.definition,
            "vkr": [{"id": s, "title": secs[s]} for s in t.vkr],
            "sources": [src[s].model_dump() for s in t.sources],
            "related": [{"to": brief(term_or_404(r.to)), "type": r.type, "label": REL_LABELS[r.type]} for r in t.related],
            "incoming": incoming}


@app.get("/api/search")
def api_search(q: str = Query(..., min_length=1)) -> list[dict]:
    return [{**brief(t), "definition": t.definition} for t in search_terms(q)]


@app.get("/api/vkr")
def api_vkr() -> list[dict]:
    """План ВКР: главы, параграфы и термины, которые в них используются."""
    g = glossary()
    def terms_of(sec: str) -> list[dict]:
        return [brief(t) for t in sorted(g.terms, key=lambda t: norm(t.term)) if sec in t.vkr]
    out = []
    for ch in g.outline:
        item = {"id": ch["id"], "title": ch["title"], "about": ch.get("about", "")}
        if ch.get("sections"):
            item["sections"] = [{**s, "terms": terms_of(s["id"])} for s in ch["sections"]]
        else:
            item["terms"] = terms_of(ch["id"])
        out.append(item)
    return out


@app.get("/api/sources")
def api_sources() -> list[dict]:
    g = glossary()
    return [{**s.model_dump(), "terms": [t.id for t in g.terms if s.id in t.sources]} for s in g.sources]


@app.get("/api/sources/{source_id}")
def api_source(source_id: str) -> dict:
    for s in api_sources():
        if s["id"] == source_id:
            return s
    raise HTTPException(404, f"источник {source_id} не найден")


@app.get("/api/graph")
def api_graph() -> dict:
    g = glossary()
    degree = {t.id: 0 for t in g.terms}
    edges = []
    for t in g.terms:
        for i, r in enumerate(t.related):
            degree[t.id] += 1
            degree[r.to] += 1
            edges.append({"data": {"id": f"{t.id}--{r.type}--{r.to}", "source": t.id, "target": r.to,
                                   "type": r.type, "label": REL_LABELS[r.type]}})
    nodes = [{"data": {"id": t.id, "label": t.term, "en": t.en, "category": t.category,
                       "authored": t.authored, "degree": degree[t.id]}} for t in g.terms]
    return {"categories": g.categories, "relation_labels": REL_LABELS, "nodes": nodes, "edges": edges}


@app.get("/dictionary/{word}", response_class=PlainTextResponse)
def dictionary_path(word: str) -> str:
    t = find(word)
    if not t:
        raise HTTPException(404, f"«{word}» нет в глоссарии")
    return f"{t.term} ({t.en})\nПростыми словами: {t.simple}\nОпределение: {t.definition}\n"


@app.get("/dictionary", response_class=PlainTextResponse)
def dictionary_query(word: str = Query(..., min_length=1)) -> str:
    return dictionary_path(word)


if WEB.exists():
    app.mount("/static", StaticFiles(directory=WEB), name="static")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(WEB / "index.html")
