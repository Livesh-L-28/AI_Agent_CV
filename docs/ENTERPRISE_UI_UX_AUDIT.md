# SENTINEL AI — Enterprise UI/UX Design System and Product Audit

## 1. Executive Summary & Git Baseline

- **Repository:** `~/AI_Agent_CV`
- **Current Branch:** `main`
- **Head Commit:** `46f2602` ("docs: add independent release-readiness audit report and risk assessment")
- **Active Environment:** React 18, Vite 5, TypeScript 5, Three.js 0.186, Lucide React icons, FastAPI Python 3.12 backend.
- **Audit Objective:** Systematically evaluate the complete SENTINEL AI user interface across all 7 operational views, identify UI/UX inconsistencies, lack of design system tokens, accessibility deficiencies, and telemetry honesty violations (such as hardcoded hardware metrics or fallback mock values presented as live data), and define a phased transformation into an enterprise-grade industrial safety intelligence platform.

---

## 2. Page-by-Page Audit Findings

### A. Application Shell (`App.tsx`)
- **Visual & Layout Inconsistencies:**
  - Sidebar width and padding lack responsive scaling on sub-1280px viewports.
  - Telemetry bar in the topbar hardcodes `HARDWARE: APPLE MPS (Metal)` and `GATE: TEMPORAL (5F)` as static DOM strings regardless of actual backend hardware connectivity or platform.
  - System status pill in sidebar reports `ONLINE (MPS + Ollama)` even when the backend is offline or unreachable.
- **Accessibility & Interaction:**
  - Sidebar navigation items are `<li>` elements without ARIA attributes (`aria-current="page"`, `role="navigation"`).
  - Theme picker dropdown is an un-trapped inline absolute div without keyboard escape handling or focus management.
- **Session & Identity:**
  - User identity switcher lacks explicit role indicators (e.g., Viewer vs Safety Officer vs Admin) in the persistent topbar.

### B. Overview Page (`Overview.tsx`)
- **Telemetry Honesty Defects:**
  - KPI cards use misleading fallback values: `{summary?.total_sources ?? 1}`, `{summary?.total_events ?? 12}`, `{summary?.open_incidents ?? 3}`, `{vision?.effective_fps ?? 81.3}`, and `{vision?.average_latency_ms ?? 12.3}`. If the backend is loading or idle, users see fabricated numbers rather than honest loading skeletons or "Awaiting Stream" indicators.
- **Information Architecture:**
  - Lacks high-level incident severity distribution visualization.
  - Recent events table displays raw nano-second persistence counts without clear human-readable temporal units.
  - No quick filters or time-range indicators for historical safety events.

### C. Live Monitor Page (`LiveMonitor.tsx`)
- **Usability & Hierarchy:**
  - Grid view versus Focus view transitions lack smooth responsive reflow.
  - Simulation mode and Live RTSP mode are visually mixed in the same control bar, creating risk that synthetic frames might be mistaken for real CCTV feeds.
  - Missing standardized camera health metrics summary (packet loss, frame drop rate, queue depth).
- **Security & Integrity:**
  - Sanitized URIs are present, but credentials handling must remain strictly obscured in modal inputs.

### D. Digital Twin Page (`DigitalTwin.tsx`)
- **Strengths:** High-fidelity procedural industrial assets, canvas-textured PBR flooring, camera presets, first-person walkthrough, CCTV POV mode, and 60 FPS performance already functioning.
- **Opportunities for Enterprise Polish:**
  - Viewport control floaters (camera presets, layer toggles, demo bar) use ad-hoc inline styles and disparate button shapes.
  - Live vs Replay vs Simulation state indicators should be unified with standard enterprise status badges.
  - Object detail drawer requires keyboard accessibility and consistent typographic tokens matching the rest of the application.

### E. Incidents Page (`Incidents.tsx`)
- **Usability & Workflow:**
  - Filter buttons (`All`, `Open`, `Resolved`) use disparate button variants (`btn-danger` for Open filter, `btn-primary` for All).
  - Incident inspection modal uses hardcoded inline styles (`rgba(3, 6, 12, 0.8)`) rather than a reusable dialog component.
  - Missing search bar for filtering incidents by title, ID, worker track, or camera source.
  - Missing evidence preview and download action for audit compliance.

### F. Agent Trace Page (`AgentTrace.tsx`)
- **Telemetry Honesty:**
  - Initializes with a hardcoded static mock trace (`corr-demo-trace-987`, `evt_demo_1792531463`) that gives the impression an agent ran when the page mounted.
  - Does not clearly distinguish between a fresh unexecuted state and a historical completed run.
- **Visual Polish:**
  - 4-stage pipeline cards use colored top borders but lack step connection lines or state progression indicators.
  - Raw JSON and audit evidence fields lack syntax formatting and copy-to-clipboard conveniences.

### G. Model Evaluation Page (`ModelEvaluation.tsx`)
- **Data Provenance:**
  - Hardware comparison card displays static hardcoded values (`12.30 ms`, `81.3 FPS`) rather than consuming live metrics from `GET /api/v1/analytics/vision`.
  - Static benchmark tables lack interactive filtering, confusion matrix visualization, or dataset provenance tags (e.g., COCO val2017 subset size).

### H. Zone Policies Page (`ZoneConfig.tsx`)
- **Usability:**
  - Read-only table format with coordinates dumped as raw JSON strings (`[(0.36, 0.24)...]`).
  - Lacks visual polygon previews, camera association mapping, rule threshold details (e.g., 5-frame persistence requirement), and policy modification audit history.

---

## 3. Design Tokens & Visual Hierarchy Strategy

### Industrial Enterprise Color Palette
- **Surfaces:**
  - `--bg-canvas`: `#060913` (deepest industrial navy)
  - `--bg-surface`: `#0B1120` (primary container background)
  - `--bg-card`: `#0F172A` (elevated card background with 1px subtle border)
  - `--bg-card-hover`: `#16223C` (interactive hover elevation)
  - `--bg-elevated`: `#151F36` (drawers, modals, floaters)
  - `--bg-input`: `#0D1527` (form control backgrounds)
- **Borders & Separators:**
  - `--border-subtle`: `rgba(56, 189, 248, 0.12)`
  - `--border-card`: `rgba(56, 189, 248, 0.18)`
  - `--border-strong`: `rgba(56, 189, 248, 0.32)`
  - `--border-active`: `#00F5D4` (focus outlines and active tabs)
- **Semantic Accents:**
  - `--accent-cyan`: `#00F5D4` (primary operational action & focus)
  - `--accent-blue`: `#0284C7` (informational highlights)
  - `--status-success`: `#10B981` (compliant, active, connected)
  - `--status-warning`: `#F59E0B` (safety warning, buffer zones, reconnecting)
  - `--status-danger`: `#EF4444` (breach, critical incident, offline error)
  - `--status-sim`: `#A855F7` (simulation / synthetic demonstration data)
- **Typography:**
  - Headings: `Outfit`, sans-serif (weights: 500, 600, 700)
  - Body: `Inter`, sans-serif (weights: 400, 500, 600)
  - Code/Telemetry: `JetBrains Mono`, monospace (weights: 400, 500)
- **Accessibility & Motion:**
  - Minimum WCAG AA 4.5:1 text contrast ratio across all states.
  - Visible 2px focus ring (`--accent-cyan`) for all keyboard navigations.
  - Full support for `@media (prefers-reduced-motion: reduce)` disabling non-essential transitions.

---

## 4. Reusable Enterprise Component Inventory

To establish a single source of truth and eliminate scattered inline styles, the following standard components will be implemented in `frontend/src/components/`:
1. `AppHeader.tsx` — Global header with page titles, live system health, session user & role, theme toggle, and keyboard accessibility.
2. `Sidebar.tsx` — Semantic navigation sidebar with icons, active state pills, engine status, and keyboard navigation.
3. `KpiCard.tsx` — Standardized KPI metric card with title, icon, value, delta/subtitle, loading skeleton, and honest unavailable state.
4. `StatusBadge.tsx` — Accessible status indicator with distinct icon, text, and high-contrast color scheme (Critical, High, Warning, Safe, Live, Simulation, Disconnected).
5. `DataTable.tsx` — Reusable table with column definitions, sorting, row click handler, empty state, and loading shimmer.
6. `FilterBar.tsx` — Search input, category filter pills, count chips, and action buttons.
7. `Modal.tsx` & `Drawer.tsx` — Focus-trapped dialogs and side drawers with ESC key listeners and accessible ARIA attributes.
8. `TelemetryBanner.tsx` — Notice banner explicitly identifying SIMULATION mode or disconnected edge state.
9. `SkeletonLoader.tsx` — Accessible skeleton placeholder for loading states.

---

## 5. Controlled Implementation Sequence

1. **Batch 1: Audit, Design Tokens & Core Components**
   - Update `index.css` with unified design tokens, typography, surfaces, elevations, and accessibility focus states.
   - Implement `frontend/src/components/` library (Header, Sidebar, KpiCard, StatusBadge, DataTable, FilterBar, Modal, SkeletonLoader).
   - Test build and token rendering.
2. **Batch 2: Application Shell & Overview Page**
   - Refactor `App.tsx` to utilize `AppHeader` and `Sidebar` with real session state and dynamic health polling.
   - Refactor `Overview.tsx` to eliminate fake fallback numbers, implement honest loading skeletons, and provide a clear incident severity overview.
3. **Batch 3: Live Monitor & Incidents Management**
   - Refactor `LiveMonitor.tsx` with clean camera grid/focus controls, camera details drawer, and honest stream statuses.
   - Refactor `Incidents.tsx` with search, filter pills, evidence review drawer, and resolution workflows.
4. **Batch 4: Agent Trace, Model Evaluation & Zone Policies**
   - Refactor `AgentTrace.tsx` with honest unexecuted vs executed states, clear 4-stage pipeline visualization, and verifiable citations.
   - Refactor `ModelEvaluation.tsx` with dynamic vision telemetry and interactive benchmark analysis.
   - Refactor `ZoneConfig.tsx` with safety classification badges, PPE tags, and rule thresholds.
5. **Batch 5: Digital Twin Interface Harmonization & Final Verification**
   - Harmonize Digital Twin HUD overlays and control panels with the new design system.
   - Run complete backend pytest suite, frontend lifecycle tests, typecheck, lint, and `git diff --check`.
   - Author `docs/ENTERPRISE_UI_UX_IMPLEMENTATION_REPORT.md`.
