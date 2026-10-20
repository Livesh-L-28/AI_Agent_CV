# SENTINEL AI — 5-Minute Recruiter Demo Walkthrough Script

## 1. Overview & Objective

This document is a word-for-word, step-by-step presentation script designed for technical interviews, hiring managers, and system architecture reviews.

**Time Required:** 5 Minutes.  
**Key Value Proposition:** Demonstrates how SENTINEL AI solves the core reliability and safety failures of LLMs in industrial computer vision by combining real-time edge YOLO inference (80 FPS on Apple MPS), OSHA spatial geometry, and deterministic policy gates that **never** allow an AI agent to overturn safety rules.

---

## 2. Preparation Checklist (T-minus 60 Seconds)

1. Open your terminal in the repository root: `/Users/livesh/AI_Agent_CV`
2. Ensure Ollama is running in the background (or rely on the automated deterministic mock fallback):
   ```bash
   ollama list
   ```
3. Run the automated single-command demo runner:
   ```bash
   .venv/bin/python scripts/demo_runner.py
   ```

---

## 3. Minute-by-Minute Presentation Script

### Minute 0:00 - 1:00 | The Architectural Hook & The Problem
> *"Hi everyone. In industrial safety monitoring—think automated manufacturing, overhead cranes, or robotic welding bays—relying solely on computer vision or probabilistic LLMs creates two major failure modes:*
> *1. False alarms from single-frame boundary noise or parallax distortion.*
> *2. Hallucinations or prompt injections where an LLM inadvertently dismisses a verified safety hazard.*
>
> *I designed SENTINEL AI to solve this with a deterministic-first architecture: the computer vision models and spatial rule engines are the absolute authority on safety. The multi-agent LLM layer serves strictly as an investigative assistant with policy-constrained tools."*

---

### Minute 1:00 - 2:00 | Real Edge Computer Vision & Hardware Acceleration
*(Point to Terminal Section [1/6] and [2/6])*

> *"Let's examine the edge vision layer:*
> *Notice our hardware discovery auto-detected Apple Silicon Metal Performance Shaders (`mps`).*
> *Instead of relying on heavy cloud servers, we load an Ultralytics YOLOv8n model directly on edge workstation hardware.*
> *On this Apple M1 Pro, raw inference runs in **11.4 milliseconds**—that's **80 frames per second** at 640x640 resolution.*
> *Our vision adapter introspects all 80 COCO classes and validates supported human and PPE entity classes at startup."*

---

### Minute 2:00 - 3:00 | Parallax-Free Spatial Rules & Temporal Persistence
*(Point to Terminal Section [3/6] and [4/6])*

> *"Next is the OSHA spatial geometry layer:*
> *A common flaw in naive CV projects is using bounding box center points to check if a worker is in a danger zone. If a worker stands outside a crane boundary and leans their head forward, a center-point check falsely triggers.*
> *SENTINEL AI calculates the exact **Ground Contact Point**—the bottom-center $(\frac{x_1+x_2}{2}, y_2)$—and evaluates it against normalized Shapely polygonal boundaries.*
>
> *Furthermore, to eliminate sensor flicker, our `TemporalEventEngine` enforces a mandatory **5-frame persistence gate**. A worker stepping near the perimeter for 2 frames will not wake up supervisors. Only sustained ground contact for $\ge 5$ consecutive frames emits a verified safety event."*

---

### Minute 3:00 - 4:00 | The 4-Stage Multi-Agent Safety Workflow
*(Point to Terminal Section [5/6])*

> *"When a violation persists, the platform launches our 4-Stage Multi-Agent System:*
>
> 1. ***Stage A (Investigator):** Gathers spatial detections, worker trajectory, and temporal history. Here, local Ollama running `llama3.2:3b` contextualizes the hazard.*
> 2. ***Stage B (Deterministic Policy Gate):** This is our primary safety innovation. Even if an LLM is hallucinating or under a prompt-injection attack attempting to override the hazard, our hard-coded Python policy gate steps in. It evaluates the ground truth and mandates action. The LLM has zero power to overturn it.*
> 3. ***Stage C (Responder):** The response agent executes strictly allowlisted tools—in this case, creating a database incident and dispatching an alert to the supervisor. Notice our **Idempotency Key guardrail**: repeated requests are deduplicated to prevent notification storms.*
> 4. ***Stage D (Verifier):** The verifier inspects real PostgreSQL/SQLite records to ensure the incident was actually persisted and alerts were delivered."*

---

### Minute 4:00 - 5:00 | Cryptographic Audit Seal, Dashboard & Testing
*(Point to Terminal Section [6/6] and Web Browser)*

> *"Finally, every audited frame and incident is sealed with an immutable **SHA-256 cryptographic hash** for legal OSHA compliance and chain of custody.*
>
> *All of this surfaces in our real-time React + TypeScript dashboard at `localhost:8000`, featuring interactive zone configuration, live frame bounding boxes, and complete agent traces.*
>
> *Underneath, we maintain **66 automated tests passing in under 12 seconds**, zero lint errors, multi-stage Docker builds, and complete CI/CD automation.*
>
> *Thank you—I'd be glad to dive into any architectural component or code file."*

---

## 4. Prepared Q&A Responses

| Potential Question | Engineering Answer |
| :--- | :--- |
| **"Why not use an LLM to decide if the worker violated the rule?"** | *Probabilistic models cannot provide safety guarantees. Under OSHA standards, entering an active crane perimeter is a physical violation regardless of intent. Hard-coding the spatial geometry ensures deterministic safety while leveraging the LLM where it excels: investigation and contextual summaries.* |
| **"How do you handle video streams at scale without running out of disk?"** | *We enforce zero continuous video recording. Video frames pass through a bounded in-memory ring buffer with backpressure frame dropping. Only audited violation snapshots are cryptographically hashed and saved.* |
| **"What happens if Ollama or the local LLM crashes or times out?"** | *The workflow features automated graceful degradation. If the LLM provider fails, the system automatically falls back to deterministic rule generation without blocking incident creation.* |
