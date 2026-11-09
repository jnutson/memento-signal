FROM python:3.11-slim@sha256:07d4824036af339fa1b6ef769cc99d9c10a141769538b52b3b597c84f7a7b535
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements-runtime.lock pyproject.toml README.md ./
RUN pip install --no-cache-dir --require-hashes -r requirements-runtime.lock
COPY src/memento ./src/memento
RUN pip install --no-cache-dir --no-deps .
COPY deploy/api-entrypoint.sh /app/api-entrypoint.sh
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["/bin/sh", "/app/api-entrypoint.sh"]
