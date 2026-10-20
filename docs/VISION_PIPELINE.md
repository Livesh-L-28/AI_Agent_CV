# SENTINEL AI — Computer Vision Pipeline

## 1. Overview
The computer vision subsystem is responsible for real-time object detection, coordinate normalization, and ground-contact point estimation. It features a strict boundary between model-inferred detections and downstream safety rules.

---

## 2. Model Adapter Architecture (`YOLOAdapter`)

- **Model Class Introspection**: The model checkpoint is loaded dynamically via Ultralytics. Rather than assuming static class indices, `YOLOAdapter` inspects `model.names` directly to build an auditable class map (`dict[int, str]`).
- **Device Backend Selection**: Automatically selects the fastest available hardware backend:
  - Apple Metal Performance Shaders (`mps`) when running on Apple Silicon.
  - CUDA (`cuda`) when running on NVIDIA systems.
  - CPU (`cpu`) as a fallback for testing and container environments.
- **Fail-Safe Inputs**: Guarantees typed outputs (`InferenceResult`, `Detection`, `BoundingBox`). Zero-sized arrays, corrupted frames, or malformed dimensions raise explicit `ValueError` exceptions before reaching the tensor pipeline.

---

## 3. Geometric Reasoning & OSHA Standards

- **Unit Coordinate Normalization**: All bounding boxes are transformed into unit coordinates `[0.0, 1.0]`:
  $$\text{norm\_x} = \frac{\text{pixel\_x}}{\text{img\_width}}, \quad \text{norm\_y} = \frac{\text{pixel\_y}}{\text{img\_height}}$$
  This ensures restricted zones defined by safety supervisors remain valid regardless of camera resolution changes (720p, 1080p, 4K).
- **Ground-Contact Point Estimation**: Industrial safety zone monitoring must not evaluate person containment based on the bounding box center or top (which flags false violations when a worker's head leans over a railing while their feet remain in the safe corridor). SENTINEL AI uses the **bottom-center ground contact point**:
  $$\text{ground\_point} = \left(\frac{x_1 + x_2}{2}, y_2\right)$$

---

## 4. Benchmark Results (Host Verification)

Measured on Apple Silicon (M1 Pro, 8 cores, 16 GB RAM, macOS 27.0.1) running `yolov8n.pt` at resolution $640 \times 640$:

| Device Backend | Warm-up Frames | Measured Frames | Average Latency | Effective FPS |
| :--- | :--- | :--- | :--- | :--- |
| **Apple MPS (Metal)** | 5 | 45 | **12.30 ms** | **81.3 FPS** |
| **CPU (8-core)** | 5 | 45 | **49.02 ms** | **20.4 FPS** |

*Note: In automated testing and CI environments, CPU mode is the reference standard.*

---

## 5. Model Classes & PPE Limitations

- Standard COCO checkpoints (e.g. `yolov8n.pt`) identify 80 general classes, including `person` (Class ID 0).
- **Critical Safety Caveat**: Standard COCO does **not** detect safety hardhats, high-visibility vests, safety goggles, or harness tie-offs. SENTINEL AI validates `adapter.validate_classes(["person", "safety_helmet", "high_vis_vest"])` and explicitly documents that generic YOLO detections cannot be misrepresented as PPE compliance detectors. A dedicated PPE adapter (Phase 6) handles specialized PPE classes.
