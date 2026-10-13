#!/usr/bin/env bash
# One-time local setup for the OMO cardprinter skill. Everything stays inside the checkout:
#   scripts/node_modules (render deps) · .venv (gate deps) · .omo-cache (pinned hyperframes@0.7.26 + browser)
# usage: bash skills/cardprinter/scripts/setup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
echo "── node deps (scripts/) ──"
(cd scripts && npm install --no-audit --no-fund)
echo "── python venv (.venv) ──"
if command -v uv >/dev/null; then
  [ -x .venv/bin/python ] || uv venv --python 3.12 .venv
  uv pip install --python .venv/bin/python pillow numpy opencv-python-headless fonttools brotli pytesseract rapidocr-onnxruntime
else
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/pip install pillow numpy opencv-python-headless fonttools brotli pytesseract rapidocr-onnxruntime
fi
echo "── pinned hyperframes 0.7.26 (.omo-cache) ──"
npm install --prefix .omo-cache --no-audit --no-fund hyperframes@0.7.26
.omo-cache/node_modules/.bin/hyperframes browser ensure </dev/null || true
command -v ffmpeg >/dev/null || echo "⚠ ffmpeg/ffprobe 필요 (brew install ffmpeg)"
command -v tesseract >/dev/null || echo "⚠ tesseract 없음 — OCR 게이트는 inconclusive 처리 (brew install tesseract tesseract-lang)"
echo "✓ setup 완료"
