"""Статическая версия глоссария для хостинга без Python/Docker (например, se.ifmo.ru/~login).

  uv run python scripts/export_static.py dist/

Снимает все GET-ответы Web API в JSON-файлы (api/*.json), копирует фронтенд с относительными путями,
кладёт определения в dictionary/<id>.txt. Поиск в статической версии выполняется в браузере.
"""
import json
import shutil
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app, glossary, VERSION  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
if out.exists():
    shutil.rmtree(out)
(out / "api" / "terms").mkdir(parents=True)
(out / "api" / "sources").mkdir(parents=True)
(out / "dictionary").mkdir()
c = TestClient(app)


def dump(path: str, rel: str) -> None:
    r = c.get(path)
    r.raise_for_status()
    (out / rel).write_text(json.dumps(r.json(), ensure_ascii=False), encoding="utf-8")


dump("/api/graph", "api/graph.json")
dump("/api/stats", "api/stats.json")
dump("/api/vkr", "api/vkr.json")
dump("/api/categories", "api/categories.json")
dump("/api/sources", "api/sources.json")
dump("/api/terms?detail=true", "api/terms.json")
dump("/openapi.json", "api/openapi.json")
for t in glossary().terms:
    dump(f"/api/terms/{t.id}", f"api/terms/{t.id}.json")
    (out / "dictionary" / f"{t.id}.txt").write_text(c.get(f"/dictionary/{t.id}").text, encoding="utf-8")
for s in glossary().sources:
    dump(f"/api/sources/{s.id}", f"api/sources/{s.id}.json")

shutil.copytree(ROOT / "web", out / "static")
html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
html = html.replace('<html lang="ru">', '<html lang="ru" data-static="1">').replace('"/static/', '"static/')
html = html.replace('<a href="/docs" target="_blank" rel="noopener">API</a>', '<a href="api/" target="_blank" rel="noopener">API</a>')
(out / "index.html").write_text(html, encoding="utf-8")
idx = ["<!doctype html><meta charset=utf-8><title>Глоссарий ВКР — статический API</title>",
       f"<h1>Глоссарий ВКР {VERSION}: статический снимок API</h1>",
       "<p>Полный Web API (поиск, OpenAPI /docs) работает в Docker-образе vkr-glossary. Здесь — те же ответы в виде файлов:</p><ul>"]
for f in ["graph.json", "terms.json", "stats.json", "categories.json", "sources.json", "openapi.json", "terms/whisper.json"]:
    idx.append(f'<li><a href="{f}">{f}</a></li>')
idx.append('<li><a href="../dictionary/wer.txt">../dictionary/wer.txt</a> (аналог /dictionary/WER)</li></ul>')
(out / "api" / "index.html").write_text("\n".join(idx), encoding="utf-8")
print(f"{out}: {len(list(out.rglob('*')))} файлов")
