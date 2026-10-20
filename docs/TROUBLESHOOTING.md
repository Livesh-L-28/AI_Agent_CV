# SENTINEL AI — Troubleshooting & Operations Guide

## 1. Quick Diagnostic Checklist

If an anomaly occurs during setup, testing, or deployment, execute this rapid health audit:

```bash
# 1. Verify Python virtual environment & dependencies
.venv/bin/python --version
.venv/bin/pytest tests/test_api.py -v

# 2. Check Database Connectivity
.venv/bin/python -c "import asyncio; from sentinel.db.session import init_db; asyncio.run(init_db())"

# 3. Check Hardware Acceleration (MPS / CUDA / CPU)
.venv/bin/python -c "import torch; print('MPS:', torch.backends.mps.is_available(), '| CUDA:', torch.cuda.is_available())"

# 4. Check Local LLM Status
curl -s http://localhost:11434/api/tags | jq .
```

---

## 2. Computer Vision & Hardware Acceleration

### Issue 2.1: `PyTorch MPS: Metal is not supported or out of memory`
- **Symptom:** Warnings or crashes when initializing YOLO on Apple Silicon.
- **Cause:** Shared unified memory exhaustion or running on an unsupported macOS version.
- **Solution:** Force CPU fallback via environment variable or config:
  ```bash
  export YOLO_DEVICE=cpu
  # Or in .env:
  YOLO_DEVICE=cpu
  ```

### Issue 2.2: OpenCV `cv2.VideoCapture` fails on headless Linux
- **Symptom:** `ImportError: libGL.so.1: cannot open shared object file` or `GStreamer warning`.
- **Cause:** Missing OpenGL/GLib runtime libraries on headless Linux servers.
- **Solution:** Ensure `opencv-python-headless` is installed, and install Linux shared libraries:
  ```bash
  sudo apt-get update && sudo apt-get install -y libgl1 libglib2.0-0 libgomp1
  ```

---

## 3. Large Language Model & Multi-Agent Layer

### Issue 3.1: `ConnectionRefusedError: [Errno 61] Connect call failed ('127.0.0.1', 11434)`
- **Symptom:** Logs show `LLM provider failed; falling back to deterministic degraded investigation`.
- **Cause:** Ollama service is not running locally.
- **Solution:** 
  1. If running with real local LLM, start Ollama:
     ```bash
     ollama serve
     ollama run llama3.2:3b
     ```
  2. If running offline or in CI/CD without Ollama, enable mock provider:
     ```bash
     export LLM_PROVIDER=mock
     # Or in .env:
     LLM_PROVIDER=mock
     ```
  The platform will operate with 100% functionality using the verified deterministic mock fallback.

### Issue 3.2: LLM JSON Output Validation Error
- **Symptom:** Warning `1 validation error for InvestigationResult: risk_assessment`.
- **Cause:** Small quantized LLMs (e.g. 3B parameters) sometimes return structured nested objects (`{"risk_level": "High"}`) instead of flat strings.
- **Solution:** `SafetyAgentWorkflow` has built-in type coercion that serializes nested JSON and guarantees graceful degradation to deterministic assessment if unrecoverable.

---

## 4. Database & Concurrency

### Issue 4.1: SQLite `database is locked` Error
- **Symptom:** `sqlite3.OperationalError: database is locked` during parallel test runs.
- **Cause:** Multiple async tasks writing to a single SQLite file simultaneously without connection options.
- **Solution:** SENTINEL AI configures `connect_args={"check_same_thread": False}` and uses isolated in-memory or fresh database files per test via `reset_db()`.
- **Production Recommendation:** For production multi-worker environments, switch to PostgreSQL:
  ```ini
  DATABASE_URL=postgresql+asyncpg://sentinel:password@localhost:5432/sentinel_db
  ```

---

## 5. Web Server & Network

### Issue 5.1: `OSError: [Errno 48] Address already in use: ('0.0.0.0', 8000)`
- **Symptom:** FastAPI fails to start because port 8000 is occupied.
- **Solution:** Find and terminate the process holding port 8000:
  ```bash
  lsof -i :8000
  kill -9 <PID>
  # Alternatively, run on a different port:
  uvicorn sentinel.api.app:app --host 0.0.0.0 --port 8080
  ```

### Issue 5.2: CORS Errors in React Frontend
- **Symptom:** Browser console logs `Access-Control-Allow-Origin header missing`.
- **Solution:** Add the frontend origin to `.env`:
  ```ini
  ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173
  ```
