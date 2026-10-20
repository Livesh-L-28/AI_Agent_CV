# SENTINEL AI

SENTINEL AI is an AI-assisted industrial safety monitoring platform engineered to protect personnel and facilities through deterministic computer vision, temporal event analysis, and evidence-grounded AI agent workflows.

## Key Capabilities
- **Deterministic Computer Vision**: Real-time YOLO object detection with class-map validation and ByteTrack multi-object tracking.
- **Safety Geometry**: Polygon-defined restricted zones with ground-contact point estimation and temporal persistence filters.
- **PPE Compliance**: Person-to-PPE (helmets, vests) association engine with occlusion awareness.
- **Stateful Multi-Agent System**: Bounded four-stage workflow (Investigator, Policy Gate, Responder, Verifier) with strict tool permissions.
- **Auditable Evidence**: Full cryptographic hashing (SHA-256) of evidence frames and immutable audit trails.
- **Full-Stack Architecture**: FastAPI async backend, dual SQLite/PostgreSQL support, and React TypeScript dashboard.

## Documentation
- [Environment Audit](docs/ENVIRONMENT_AUDIT.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Architectural Decisions (ADRs)](docs/DECISIONS.md)
- [Project Status](docs/STATUS.md)

## Quickstart

```bash
# Set up virtual environment
uv venv .venv --python 3.12
source .venv/bin/activate

# Install dependencies
uv pip install -e ".[dev]"

# Run tests
pytest
```
