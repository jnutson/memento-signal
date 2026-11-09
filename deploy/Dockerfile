FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
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
