# SENTINEL AI — Project Status

**Current Phase:** PHASE 2 (YOLO Model Adapter & Recorded-Video Inference) — Completed  
**Next Phase:** PHASE 3 (Video Ingestion & Resource Lifecycle)  
**Last Updated:** 2026-10-20  

---

## 1. Phase Completion Matrix

| Phase | Description | Status | Verification & Test Outcome |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Repository and environment audit | **COMPLETED** | Verified facts in `docs/ENVIRONMENT_AUDIT.md`. Foundational docs generated. |
| **Phase 1** | Project skeleton, config, logging, and test harness | **COMPLETED** | Git repo initialized. Isolated `.venv` created via `uv`. 11 unit tests passing in 0.98s. Ruff linting 100% clean. |
| **Phase 2** | YOLO model adapter & recorded-video inference | **COMPLETED** | Implemented `YOLOAdapter`, `BoundingBox`, `normalize_bbox`, IoU, ground contact point, and synthetic video fixture. 23 tests passing. MPS latency: 12.30ms (81.3 FPS); CPU latency: 49.02ms (20.4 FPS). |
| **Phase 3** | Video ingestion & resource lifecycle | *NEXT* | Replay and webcam sources with thread safety and backpressure. |
| **Phase 4** | Tracking & normalized coordinate utilities | *PENDING* | Multi-object tracking (ByteTrack) and ground-contact estimation. |
| **Phase 5** | Restricted-zone & temporal event engine | *PENDING* | Polygon zone PIP and persistence state machine. |
| **Phase 6** | PPE model integration & association | *PENDING* | Person-to-PPE association and uncertainty modeling. |
| **Phase 7** | Database models, migrations, repositories | *PENDING* | SQLAlchemy async ORM, Alembic migrations, dual SQLite/PostgreSQL support. |
| **Phase 8** | FastAPI REST API & WebSocket streaming | *PENDING* | REST endpoints, WebSocket broadcaster, Pydantic schemas. |
| **Phase 9** | Stateful agent workflow & LLM integration | *PENDING* | Investigator, Policy Evaluator, Response Agent, Verifier with Ollama/Mock. |
| **Phase 10** | Policy gate, tool execution, verification | *PENDING* | Allowlisted tools, deterministic policy gate, audit verification. |
| **Phase 11** | React dashboard & WebSocket UI | *PENDING* | Industrial dark dashboard with live monitor, traces, and metrics. |
| **Phase 12** | Model and agent evaluation suite | *PENDING* | Vision mAP/FPS benchmarks and agent grounding evaluation. |
| **Phase 13** | Docker, CI/CD, security, observability | *PENDING* | Containerization, GitHub Actions, security scanning, correlation IDs. |
| **Phase 14** | End-to-end tests, demo fixtures, docs | *PENDING* | 5-minute recruiter demo runner, comprehensive README, and guides. |

---

## 2. Key Metrics & Benchmarks (Verified on Host System)

- **Total Test Suite Count:** 23 passed, 0 failed, 0 warnings (2.56s)
- **Code Formatting & Lint:** 100% compliant with Ruff (`py312` target)
- **Apple MPS (Metal) Vision Latency:** **12.30 ms** per frame (effective **81.3 FPS**)
- **CPU Vision Latency (8-core):** **49.02 ms** per frame (effective **20.4 FPS**)
- **Coordinate Precision:** Unit normalized coordinates `[0.0, 1.0]`, ground contact point `((x1+x2)/2, y2)`
- **Class Map Auditing:** Dynamically inspects `model.names`; validates absence of PPE classes in generic COCO weights.

---

## 3. Known Limitations & Blockers
- **Docker Daemon:** Inactive on host. Docker Compose tests will be run natively and in CI.
- **Webcam in Container:** macOS sandbox prevents AVFoundation webcam access in Docker. `VideoReplaySource` serves as the primary automated test mechanism.
