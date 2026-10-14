FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 UV_NO_CACHE=1
WORKDIR /srv
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY health ./health
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["/srv/.venv/bin/health", "serve", "--host", "0.0.0.0", "--port", "8000"]
