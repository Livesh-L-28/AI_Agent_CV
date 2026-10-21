# SENTINEL AI — Architectural Decision Records (ADRs)

> [!IMPORTANT]
> ### Safety Advisory Notice & Legal Disclaimer (DEF-12)
> SENTINEL AI is an engineering research and advisory monitoring prototype. It is NOT certified safety-critical software, does not possess OSHA or CE safety certification, and cannot be used as an emergency-stop or life-safety interlock.

## ADR-001: Separation of Deterministic Safety Rules from Probabilistic LLM Reasoning
- **Status:** Accepted
- **Context:** Industrial safety monitoring requires predictable adherence to organizational safety policies. LLMs are probabilistic and susceptible to hallucinations, context drift, and non-deterministic variations.
- **Decision:** All safety-critical spatial checks (restricted zone entry/exit) and temporal persistence filters are evaluated using deterministic geometric algorithms (Shapely) and explicit state machines. The multi-agent workflow acts as an investigative assistant and contextual summarizer; the final policy gate is hard-coded and deterministic. An LLM cannot overturn a verified violation.
- **Consequences:** Auditable safety decisions, zero risk of hallucinated safety waivers, strict enforcement of configured policy thresholds. (Advisory prototype only; not certified for life-safety interlocks).

---

## ADR-002: Dual-Database Strategy (SQLite + PostgreSQL)
- **Status:** Accepted
- **Context:** Developers and recruiters running local evaluations may not have an active PostgreSQL service or running Docker daemon. However, production deployments require PostgreSQL for concurrency and JSON indexing.
- **Decision:** Use async SQLAlchemy with dialect abstraction. Default to `sqlite+aiosqlite:///./sentinel.db` when no PostgreSQL connection string is provided in `.env`, while supporting full `postgresql+asyncpg://...` in Docker and production environments.
- **Consequences:** Frictionless zero-setup onboarding for evaluators, reliable automated test runs in CI, and clean production scalability.

---

## ADR-003: Video Replay as Primary Deterministic Reference Source
- **Status:** Accepted
- **Context:** macOS Docker containers cannot access host cameras via AVFoundation due to host virtualization sandbox limitations. Live webcams also introduce non-deterministic lighting, movement, and timing variations that make automated testing brittle.
- **Decision:** Design `VideoReplaySource` as the first-class reference implementation for all unit, integration, and CI tests. Live `WebcamSource` is supported natively on host machines with explicit permission checks and graceful error recovery.
- **Consequences:** Perfectly reproducible test suites, deterministic bug reproduction, seamless CI/CD pipeline execution without physical camera hardware.

---

## ADR-004: Explicit State Machine for Multi-Agent Workflow
- **Status:** Accepted
- **Context:** While agent frameworks like LangGraph or CrewAI offer orchestration abstractions, they often introduce heavy dependencies, brittle breaking API changes, and complex internal state tracking.
- **Decision:** Implement a lightweight, typed explicit StateGraph using Pydantic models for shared state, explicit stage transitions (`Investigator -> PolicyGate -> Responder -> Verifier`), and schema-validated tool calls. If LangGraph is used, wrap it with an adapter matching this explicit state definition.
- **Consequences:** Zero hidden state, predictable step execution, trivial unit testability, and sub-millisecond orchestration overhead.

---

## ADR-005: Coordinate Normalization and Ground-Contact Estimation
- **Status:** Accepted
- **Context:** Video streams may vary in resolution (e.g. 720p, 1080p, 4K). Detections in pixel coordinates break polygon zone definitions when resolution changes. Furthermore, using a bounding box center for zone containment yields false alarms when a worker's head is in a zone while feet are outside.
- **Decision:** All bounding boxes, zone polygons, and entity positions are normalized to unit coordinate space `[0.0, 1.0]`. Worker position within zones is evaluated using the estimated **ground contact point** (the center of the bottom edge of the worker's bounding box: `(x1 + x2)/2, y2`).
- **Consequences:** Resolution-invariant zone definitions and physically accurate boundary crossing detection.

---

## ADR-006: Local Ollama Support with Offline Mock Fallback
- **Status:** Accepted
- **Context:** The host has an active Ollama instance (`llama3.2:3b`), but CI runners or offline environments will not have access to live LLM servers.
- **Decision:** Implement an LLM provider abstraction supporting `OllamaProvider`, `OpenAIProvider`, and `MockProvider`. In tests and offline degraded mode, the system defaults to deterministic rule summaries, ensuring 100% of pipeline tests pass without external dependencies.
- **Consequences:** Fast local development, full support for local LLM inference, zero external API costs, and robust offline operation.

---

## ADR-007: Package Management with `uv`
- **Status:** Accepted
- **Context:** Python 3.12 is installed globally, and `uv` is available at `/Users/livesh/.local/bin/uv`. Using standard pip can be slow and may pollute system Python packages.
- **Decision:** Manage the project virtual environment (`.venv`) using `uv`. Define dependencies in standard `pyproject.toml`.
- **Consequences:** 10x faster dependency resolution and environment setup, strict isolation, and full compatibility with standard Python packaging tools.
