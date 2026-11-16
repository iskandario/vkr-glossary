# Глоссарий ВКР: Web API (FastAPI) + фронтенд (Cytoscape.js) в одном образе.
FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY data ./data
COPY web ./web
RUN useradd --system --uid 10001 glossary && chown -R glossary /srv
USER glossary
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8080/health')"
LABEL org.opencontainers.image.title="vkr-glossary" \
      org.opencontainers.image.description="Глоссарий ВКР: термины, Web API и семантический граф" \
      org.opencontainers.image.version="1.1.0"
CMD ["/srv/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
