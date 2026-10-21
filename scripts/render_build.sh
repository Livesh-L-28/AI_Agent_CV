#!/usr/bin/env bash
# ==============================================================================
# SENTINEL AI — Render Native Build Script
# Compiles the React SPA frontend and installs the FastAPI Python backend
# ==============================================================================
set -o errexit

echo ">>> [1/3] Building React Frontend with Vite..."
cd frontend
npm ci
npm run build
cd ..

echo ">>> [2/3] Installing Python Backend with Headless OpenCV & PyTorch..."
python -m pip install --upgrade pip
python -m pip install -e .

echo ">>> [3/3] Initializing data storage directories..."
mkdir -p data/evidence data/uploads data/fixtures

echo ">>> Render Build Completed Successfully!"
