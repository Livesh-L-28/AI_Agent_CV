# SENTINEL AI — Dataset, Models, and PPE Association Architecture

## 1. Computer Vision Model Architecture

SENTINEL AI uses a decoupled, adapter-based computer vision architecture that abstracts deep learning inference behind the verified `YOLOAdapter` interface (`src/sentinel/vision/adapter.py`).

### 1.1 Model Selection Rationale

| Criterion | YOLOv8n (Default Baseline) | YOLO11n | YOLOv8x (Heavy) | Decision Rationale |
| :--- | :---: | :---: | :---: | :--- |
| **Parameters** | 3.2 Million | 2.6 Million | 68.2 Million | Ultra-lightweight edge footprint |
| **Model Weight Size** | 6.2 MB | 5.4 MB | 136.0 MB | Fast cold-start, low RAM consumption |
| **MPS Inference Latency** | **12.51 ms** | ~12.30 ms | ~74.20 ms | Guarantees real-time 80 FPS on M1 Pro |
| **CPU Inference Latency** | **41.63 ms** | ~40.50 ms | ~310.0 ms | Exceeds 24 FPS baseline even without GPU |
| **Target Deployment** | Industrial Edge / Workstation | Industrial Edge / Embedded | Central High-Compute Server | **YOLOv8n selected as primary baseline** |

### 1.2 Device Execution Strategy

The adapter dynamically inspects runtime hardware capabilities at startup:
1. **Apple Silicon (`mps`):** Employs PyTorch Metal Performance Shaders for hardware-accelerated matrix operations on Apple Silicon (M1/M2/M3/M4).
2. **NVIDIA GPUs (`cuda`):** Autodetects CUDA availability for Linux edge servers (Jetson, RTX).
3. **CPU Fallback (`cpu`):** Pure CPU execution path guarantees 100% test reproducibility across standard headless Linux CI/CD runners without GPU dependencies.

---

## 2. Class Taxonomy & Spatial Ground Contact Geometry

### 2.1 COCO Class Introspection

At model initialization, the `YOLOAdapter` programmatically introspects `model.names` to validate supported object classes:
- **Primary Target:** Class ID `0` (`person`).
- **PPE / Equipment:** Validates equipment presence or alerts if custom fine-tuned weights are supplied.

```python
# Programmatic validation of model class capabilities
adapter = YOLOAdapter("yolov8n.pt")
assert adapter.has_class("person") is True
```

### 2.2 Spatial Zone Ground Contact Calculation & Planar Homography (DEF-08)

#### Bottom-Center Heuristic & Limitations
A vulnerability in naive video analytics is using bounding box center `(cx, cy)` for spatial zone containment. In three-dimensional industrial floors, using center points creates massive perspective distortion: a worker standing outside a restricted zone whose head leans into the camera's perspective falsely triggers an alarm.

SENTINEL AI implements the **Ground Contact Point** heuristic:
$$\mathbf{P}_{\text{ground}} = \left(\frac{x_1 + x_2}{2}, y_2\right)$$
where $x_1, y_1, x_2, y_2 \in [0.0, 1.0]$ are normalized bounding box coordinates. Zone containment is evaluated by $\mathbf{P}_{\text{ground}}$ intersecting the configured polygonal boundary via Shapely `Point.within(Polygon)`.

**Critical Geometric Limitations (DEF-08):**
1. **Monocular Perspective Parallax:** Oblique camera angles project physical foot contact away from the optical vertical axis. Bottom-center estimation does not eliminate 3D perspective distortion.
2. **Foot Occlusion:** If machinery, pallets, or guardrails occlude a worker's lower body, the bottom edge of the detected bounding box reflects the occlusion boundary, not physical floor contact.
3. **Non-Upright Postures:** Bending, crouching, kneeling, or operating elevated machinery displaces the bounding box bottom from actual foot position.
4. **Elevation Changes:** Ramps, stairs, mezzanine levels, and pits violate horizontal coplanar assumptions.

#### Optional Camera-Specific Planar Homography Calibration
To convert 2D image coordinates into calibrated metric ground-plane coordinates (e.g., meters on a factory floor), SENTINEL AI provides `sentinel.vision.geometry.PlanarHomography`:
- Computed via $\ge 4$ non-collinear point correspondences between camera image space and surveyed floor coordinates ($H \in \mathbb{R}^{3 \times 3}$).
- Validates coordinate bounds, non-collinear configurations, and matrix non-singularity.
- Maps detected positions to planar coordinates via $[X, Y, 1]^T \sim H [u, v, 1]^T$.
- Provides exact inverse mapping $H^{-1}$ back to camera view space.
- *Notice:* Planar homography assumes points lie strictly on the calibrated flat plane ($Z = 0$) and does NOT guarantee universal parallax-free positioning across multi-elevation facilities.

---

## 3. Person-to-PPE Geometric & Temporal Association

Because general COCO models do not bundle fine-tuned PPE classes, SENTINEL AI employs an anatomical spatial decomposition model (`src/sentinel/rules/ppe.py`) that associates safety equipment (hard hats, high-vis vests, protective eyewear) with tracked worker entities.

### 3.1 Anatomical Sub-Region Segmentation

Given a detected worker bounding box $B = [x_1, y_1, x_2, y_2]$:
1. **Cranial / Head Region (Hardhat / Goggles):**
   $$B_{\text{head}} = \left[x_1 + 0.15 \cdot W, y_1, x_2 - 0.15 \cdot W, y_1 + 0.22 \cdot H\right]$$
2. **Torso Region (High-Visibility Safety Vest):**
   $$B_{\text{torso}} = \left[x_1 + 0.10 \cdot W, y_1 + 0.20 \cdot H, x_2 - 0.10 \cdot W, y_1 + 0.65 \cdot H\right]$$

### 3.2 Temporal Smoothing & State Machine

Single-frame occlusions (e.g., worker turning away from camera, temporary crane obstruction) must **never** trigger false alarms:
- **1-Frame Dropout:** Categorized as `UNCERTAIN` or `OCCLUDED`. No alarm emitted.
- **Sustained Absence ($\ge 6$ consecutive frames):** State transitions to `NON_COMPLIANT`. Emits `SafetyEventCandidate(event_type=PPE_VIOLATION)`.
- **Cooldown Window (15.0 seconds):** Deduplication prevents repeated alert storms while the worker remains in the same violation state.

### 3.3 PPE Capability Guard & Fine-Tuned Model Configuration (DEF-02)

#### Baseline COCO Behavior & False Positive Prevention
Standard COCO checkpoints (`yolov8n.pt`) contain generic object classes (e.g., `person`, `car`, `backpack`), but **lack specialized PPE classes** (`helmet`, `hard-hat`, `vest`, `safety-vest`). Naively attempting PPE violation detection against a base COCO model would mark 100% of workers non-compliant, generating spurious alarms.

To prevent this:
1. `YOLOAdapter.get_capabilities()` introspects `model.names` at runtime.
2. If PPE classes are absent, `has_ppe_classes` evaluates to `False`.
3. In `PPERuleEngine`, `ppe_capability_enabled` is set to `False`, suppressing PPE violation candidate generation while preserving person tracking and restricted-zone monitoring.
4. Model capability metadata is exposed via `GET /api/v1/analytics/capabilities`.

#### Configuring a Fine-Tuned PPE Model
To enable live PPE violation detection in production environments:
1. **Model Weights:** Train or acquire YOLO weights on a recognized industrial safety dataset (e.g., [Pictor-PPE](https://github.com/cvaldez98/Pictor-PPE), [SHWD - Safe Hat Worker Dataset](https://github.com/njvisionpower/Safety-Helmet-Wearing-Dataset), or [Roboflow Construction PPE](https://universe.roboflow.com/roboflow-universe-projects/construction-site-safety)).
2. **Supported Class Taxonomy:** The model must expose labeled classes matching common PPE nomenclature:
   - Helmets: `helmet`, `hard-hat`, `hard hat`, or `hardhat`
   - Vests: `vest`, `safety-vest`, `high-vis-vest`, or `reflective-vest`
   - Workers: `person` or `worker`
3. **Environment Configuration:** Set `YOLO_MODEL_PATH` in `.env` or system environment:
   ```bash
   export YOLO_MODEL_PATH="weights/yolov8n_ppe_production.pt"
   ```
4. **Verification:** Inspect the `/api/v1/analytics/capabilities` endpoint:
   ```json
   {
     "model_name": "weights/yolov8n_ppe_production.pt",
     "has_person_class": true,
     "has_ppe_classes": true,
     "supported_ppe_classes": ["hard-hat", "safety-vest"],
     "missing_ppe_classes": ["gloves", "goggles", "boots"]
   }
   ```
5. **Testing & Validation:** In unit and integration test environments (`tests/test_ppe.py`), person and PPE detections are explicitly injected via deterministic synthetic fixtures to validate anatomical matching and temporal smoothing without ungrounded real-inference claims.

---

## 4. Deterministic Synthetic Video Fixture Specification

To provide 100% reproducible testing and recruiter demonstrations without requiring external video downloads or physical webcams, the repository includes a synthetic video generator (`scripts/create_synthetic_fixtures.py`).

| Property | Value | Notes |
| :--- | :--- | :--- |
| **File Location** | `data/fixtures/synthetic_safety_video.mp4` | Generated programmatically via OpenCV |
| **Resolution** | 640 x 480 pixels | Standard industrial VGA camera feed |
| **Frame Rate** | 25.0 FPS | Industrial surveillance standard |
| **Duration** | 5.0 seconds (125 frames total) | Bounded for rapid test suites |
| **Worker Trajectory** | Horizontal translation ($x: 100 \to 500$, $y=320$) | Smooth simulated movement across floor |
| **Zone A-1 Boundary** | $[(0.36, 0.24), (0.58, 0.24), (0.58, 0.44), (0.36, 0.44)]$ | Lower-right quadrant danger area |
| **Intrusion Timing** | Frames 55 through 85 | Verified ground contact penetration |
| **Safety Equipment** | Yellow hardhat, orange reflective vest | Rendered with high-contrast geometric contours |
| **Cryptographic Hash** | SHA-256 verified | Replay is bit-for-bit deterministic |
