# Civil Suits document worker: DOCX → PDF/A, scan OCR, e-filing bundles.
# Build from the repo root:  docker build -f apps/worker/Dockerfile -t civil-suits-worker .
FROM node:25-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui ghostscript qpdf poppler-utils ocrmypdf \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-mar \
      fonts-liberation fonts-noto-core icc-profiles-free ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/templates/package.json packages/templates/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @civil-suits/worker...

COPY packages/domain packages/domain
COPY packages/templates packages/templates
COPY apps/worker apps/worker

ENV NODE_ENV=production OCR_LANGS=eng+mar
# Scans and drafts are only ever written to per-job temp dirs, removed after each job.
USER node
WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
