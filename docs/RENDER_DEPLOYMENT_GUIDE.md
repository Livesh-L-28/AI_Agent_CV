# SENTINEL AI — Render Deployment Guide

This guide provides instructions for hosting the **SENTINEL AI** platform on [Render](https://render.com/).

---

## 1. Architecture Overview

SENTINEL AI is configured as a **unified production container / web service**:
- **Frontend**: Vite + React + Three.js compiled to static assets (`frontend/dist`).
- **Backend**: FastAPI Python 3.12 ASGI service (`src/sentinel/api/app.py`).
- **Single Origin**: The FastAPI backend serves both the `/api/v1/...` endpoints and the SPA frontend (`index.html` + `/assets/...`).
- **Zero CORS Issues**: The frontend communicates relative to `/` (`BASE_URL = ''`), eliminating cross-origin errors in production.
- **Port Flexibility**: The container dynamically binds to Render's assigned `$PORT` (default 10000 on Render, 8000 locally).

---

## 2. Prerequisites: Push Code to GitHub

If your repository is not yet linked to GitHub:

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `sentinel-ai`).
2. In your local terminal, add the remote and push:
   ```bash
   git add .
   git commit -m "feat: complete enterprise digital twin and render hosting configuration"
   git branch -M main
   git remote add origin https://github.com/<your-username>/sentinel-ai.git
   git push -u origin main
   ```

---

## 3. Deployment Options on Render

### Option A: One-Click Blueprint Deploy (Recommended)

SENTINEL AI includes a validated [`render.yaml`](file:///Users/livesh/AI_Agent_CV/render.yaml) blueprint.

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your GitHub account and select your `sentinel-ai` repository.
4. Render will parse `render.yaml` automatically:
   - **Service Name**: `sentinel-ai`
   - **Runtime**: Docker (multi-stage build)
   - **Plan**: Free (or Starter)
   - **Health Check Path**: `/health/ready`
   - **Auto-generated JWT Secret**: Generated automatically by Render.
5. Click **Apply**.
6. Render will build the React frontend, install dependencies, and launch Uvicorn. Once the build completes, your app will be live at `https://sentinel-ai-<id>.onrender.com`.

---

### Option B: Manual Docker Web Service Deploy

If you prefer to configure the service manually without Blueprints:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select **Build and deploy from a Git repository** -> choose your repo.
3. Configure the following settings:
   - **Name**: `sentinel-ai`
   - **Region**: Oregon (or your preferred region)
   - **Branch**: `main`
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: **Free** (or Starter for persistent uptime)
4. Under **Health Check Path**, enter:
   ```text
   /health/ready
   ```
5. Under **Environment Variables**, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `ENVIRONMENT` | `production` | Enforces production security checks |
   | `SENTINEL_JWT_SECRET_KEY` | *(Click "Generate" or enter 32+ char secret)* | Cryptographic token signing |
   | `YOLO_DEVICE` | `cpu` | Render instances run on CPU |
   | `LLM_PROVIDER` | `mock` | Or `openai` if adding `OPENAI_API_KEY` |
   | `ENABLE_MOCK_LLM` | `true` | Allows bounded 4-stage agent execution |
   | `DATABASE_URL` | `sqlite+aiosqlite:///./data/sentinel.db` | Default database |
   | `LOG_LEVEL` | `INFO` | Standard production logging |
   | `ALLOWED_ORIGINS` | `*` | Allows browser communication |
6. Click **Create Web Service**.

---

### Option C: Native Python Environment (Without Docker)

If you wish to use Render's native Python runtime instead of Docker:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select **Runtime**: **Python**.
3. Set the following build and start commands:
   - **Build Command**:
     ```bash
     ./scripts/render_build.sh
     ```
   - **Start Command**:
     ```bash
     uvicorn sentinel.api.app:app --host 0.0.0.0 --port $PORT --workers 1
     ```
4. Add the same Environment Variables as in Option B.

---

## 4. Environment Variables Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | Set by Render (`10000`) | Dynamic port assigned by Render proxy |
| `ENVIRONMENT` | `production` | Run mode (`production`, `staging`, `development`) |
| `SENTINEL_JWT_SECRET_KEY` | Required in production | Secret key for HS256 JWT tokens (>= 32 chars) |
| `YOLO_DEVICE` | `cpu` | Inference target (`cpu`, `cuda`, `mps`) |
| `LLM_PROVIDER` | `mock` | Agent backend (`mock`, `openai`, `ollama`) |
| `ENABLE_MOCK_LLM` | `true` | Deterministic fallback for bounded agent execution |
| `OPENAI_API_KEY` | *(Optional)* | Only required if `LLM_PROVIDER=openai` |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/sentinel.db` | SQLite database URI |
| `LOG_LEVEL` | `INFO` | Log verbosity |

---

## 5. Verification Checklist Post-Deployment

Once Render finishes deploying:

1. **Readiness Probe**:
   Visit `https://<your-service>.onrender.com/health/ready` -> Expected: `{"status":"ready","database_connected":true}`.
2. **Dashboard UI**:
   Visit `https://<your-service>.onrender.com/` -> Loads the high-contrast Daylight Clean UI.
3. **Digital Twin**:
   Navigate to `/twin` -> Verifies 3D WebGL scene rendering, 2D floorplan fallback, and camera vantage points.
4. **Agent Trace Console**:
   Navigate to `/agent` -> Verifies the 4-stage bounded execution DAG.
5. **Incidents**:
   Navigate to `/incidents` -> Verifies incident records and evidence verification.

> [!NOTE]
> On Render's **Free Tier**, web services spin down after 15 minutes of inactivity. When a new request arrives, it may take 30–50 seconds to warm up ("cold start"). To prevent spin-downs, you can upgrade the service to Render's **Starter** tier ($7/month).
