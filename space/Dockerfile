# OpenCrane MCP server for the AsyncAPI knowledge base, on a free
# Hugging Face Docker Space (CPU Basic: 2 vCPU / 16 GB RAM).
#
# Uses the published, data-bundled PyPI package `asyncapi-knowledge-mcp`
# (built by `opencrane pack`), which ships the prebuilt Milvus index +
# chunks.json. No clone, no re-embed, no AI Gateway, no API key. Search uses
# Milvus Lite; query embedding uses the local nomic model (downloaded once).
FROM python:3.12-slim

# HF Spaces run the container as UID 1000 — create that user + writable caches.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    MCP_HTTP_PORT=8000
WORKDIR /home/user/app

# The package bundles milvus.db + chunks.json and depends on opencrane.
# Unpinned = each Space rebuild picks up the latest PyPI release. Pin to a
# specific version (e.g. ==2026.6.7) if you want reproducible builds.
RUN pip install --no-cache-dir --user asyncapi-knowledge-mcp

COPY --chown=user app.py .

EXPOSE 8000

# The package's own console script serves stdio; this wrapper points OpenCrane
# at the data bundled inside the installed package and starts HTTP transport.
# MCP endpoint: /http   •   health: /health
CMD ["python", "app.py"]
