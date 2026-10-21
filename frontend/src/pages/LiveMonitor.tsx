import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  ShieldCheck,
  VideoOff,
  Tv,
  Camera as CameraIcon,
  Plus,
  RefreshCw,
  LayoutGrid,
  Maximize2,
  Video,
} from 'lucide-react';
import {
  Camera,
  fetchCameras,
  registerCamera,
  startCamera,
  stopCamera,
  ingestBrowserFrame,
  getCameraLiveStreamUrl,
  getValidAuthToken,
} from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { TelemetryBanner } from '../components/TelemetryBanner';
import { Modal } from '../components/Modal';

interface LiveMonitorProps {
  onTriggerAgent: (eventId: string) => void;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({ onTriggerAgent }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'focus' | 'grid'>('focus');
  const [authToken, setAuthToken] = useState<string>('');

  // Mode & Stream status
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [isBrowserWebcamActive, setIsBrowserWebcamActive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Camera Form State
  const [newCamId, setNewCamId] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamType, setNewCamType] = useState<'rtsp' | 'browser_webcam' | 'replay' | 'webcam'>('replay');
  const [newCamUri, setNewCamUri] = useState('data/fixtures/synthetic_safety_video.mp4');
  const [newCamSampling, setNewCamSampling] = useState(1);

  // Browser Webcam MediaStream references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const ingestIntervalRef = useRef<number | null>(null);

  // Simulation mode canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [simFrameIdx, setSimFrameIdx] = useState(0);
  const [workerInZone, setWorkerInZone] = useState(false);
  const [persistenceFrames, setPersistenceFrames] = useState(0);

  // Selected camera object
  const activeCamera = cameras.find((c) => c.camera_id === selectedCameraId) || cameras[0];

  // 1. Initial Load: Auth Token & Camera List
  const loadCameras = async () => {
    try {
      const token = await getValidAuthToken();
      setAuthToken(token);
      const camList = await fetchCameras();
      setCameras(camList);
      if (camList.length > 0 && !selectedCameraId) {
        setSelectedCameraId(camList[0].camera_id);
      }
    } catch (e: any) {
      console.error('Failed to load cameras:', e);
    }
  };

  useEffect(() => {
    loadCameras();
    const interval = setInterval(loadCameras, 4000);
    return () => clearInterval(interval);
  }, []);

  // 2. Browser Webcam Capture Loop (getUserMedia -> Ingest POST)
  const toggleBrowserWebcam = async () => {
    if (isBrowserWebcamActive) {
      // Stop webcam
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (ingestIntervalRef.current) {
        window.clearInterval(ingestIntervalRef.current);
        ingestIntervalRef.current = null;
      }
      setIsBrowserWebcamActive(false);

      if (selectedCameraId.startsWith('cam-browser')) {
        await stopCamera(selectedCameraId);
        loadCameras();
      }
    } else {
      // Start webcam
      setActionError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        mediaStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play();
        }

        // Ensure browser webcam camera is registered on backend
        const browserCamId = 'cam-browser-01';
        let exists = cameras.some((c) => c.camera_id === browserCamId);
        if (!exists) {
          await registerCamera({
            camera_id: browserCamId,
            name: 'Client Browser Webcam',
            camera_type: 'browser_webcam',
            uri: 'browser://local',
            sampling_rate: 1,
            target_fps: 25.0,
          });
        }
        await startCamera(browserCamId);
        setSelectedCameraId(browserCamId);
        setIsBrowserWebcamActive(true);
        loadCameras();

        // Offscreen canvas frame ingest loop (~10 FPS to backend)
        const canvas = offscreenCanvasRef.current || document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        offscreenCanvasRef.current = canvas;
        const ctx = canvas.getContext('2d');

        ingestIntervalRef.current = window.setInterval(() => {
          if (localVideoRef.current && ctx && authToken) {
            ctx.drawImage(localVideoRef.current, 0, 0, 640, 480);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  ingestBrowserFrame(browserCamId, blob, authToken);
                }
              },
              'image/jpeg',
              0.7
            );
          }
        }, 100);
      } catch (err: any) {
        console.error('Camera access denied or failed:', err);
        setActionError(`Camera permission error: ${err.message || 'Access denied'}`);
        setIsBrowserWebcamActive(false);
      }
    }
  };

  // Clean up browser media stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (ingestIntervalRef.current) {
        clearInterval(ingestIntervalRef.current);
      }
    };
  }, []);

  // 3. Start / Stop Selected Camera
  const handleToggleFeed = async () => {
    if (!activeCamera) return;
    setActionError(null);
    try {
      if (activeCamera.status === 'LIVE' || activeCamera.status === 'CONNECTING') {
        await stopCamera(activeCamera.camera_id);
      } else {
        await startCamera(activeCamera.camera_id);
      }
      await loadCameras();
    } catch (e: any) {
      setActionError(e.message || 'Camera operation failed');
    }
  };

  // 4. Handle Add Camera Form
  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await registerCamera({
        camera_id: newCamId,
        name: newCamName,
        camera_type: newCamType,
        uri: newCamUri,
        sampling_rate: newCamSampling,
      });
      setShowAddModal(false);
      setNewCamId('');
      setNewCamName('');
      await loadCameras();
      setSelectedCameraId(newCamId);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create camera');
    }
  };

  // 5. Procedural Simulation Mode Animation Loop (DEF-03/DEF-10 Preserved)
  useEffect(() => {
    if (!isSimulationMode) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = time - lastTime;
      if (dt > 40 && isPlaying) {
        lastTime = time;
        setSimFrameIdx((prev) => (prev + 1) % 150);
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawIndustrialScene(ctx, simFrameIdx);
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, simFrameIdx, isSimulationMode]);

  useEffect(() => {
    if (!isSimulationMode) {
      setWorkerInZone(false);
      setPersistenceFrames(0);
      return;
    }
    const workerX = 120 + (simFrameIdx / 150) * 400;
    const inZone = workerX >= 360 && workerX <= 580;
    setWorkerInZone(inZone);
    if (inZone) setPersistenceFrames((prev) => prev + 1);
    else setPersistenceFrames(0);
  }, [simFrameIdx, isSimulationMode]);

  const drawIndustrialScene = (ctx: CanvasRenderingContext2D, frame: number) => {
    ctx.fillStyle = '#0B1120';
    ctx.fillRect(0, 0, 640, 480);
    // Draw grid
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    for (let y = 180; y <= 480; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }
    // Crane hoist
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(280, 20, 80, 24);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(320, 44);
    ctx.lineTo(320, 160 + Math.sin(frame * 0.08) * 12);
    ctx.stroke();

    // Restricted Zone A-1
    ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
    ctx.fillRect(360, 220, 220, 220);
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(360, 220, 220, 220);
    ctx.fillStyle = '#EF4444';
    ctx.font = '12px monospace';
    ctx.fillText('[SIMULATION] RESTRICTED CRANE ZONE A-1', 370, 240);

    // Worker figure
    const wx = 120 + (frame / 150) * 400;
    const wy = 320;
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(wx, wy - 65, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.ellipse(wx, wy - 72, 16, 9, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#F97316';
    ctx.fillRect(wx - 16, wy - 48, 32, 56);

    // BBox
    const isViolating = wx >= 360 && wx <= 580;
    const color = isViolating ? '#EF4444' : '#10B981';
    ctx.strokeStyle = color;
    ctx.strokeRect(wx - 22, wy - 82, 44, 140);
  };

  const isCurrentLive = activeCamera && activeCamera.status === 'LIVE';

  return (
    <div>
      {/* Hidden elements for browser webcam capture */}
      <video ref={localVideoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={offscreenCanvasRef} style={{ display: 'none' }} />

      {/* Top Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface)',
          padding: '12px 18px',
          borderRadius: 8,
          marginBottom: 16,
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Left: Camera Selector & View Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CameraIcon size={18} color="var(--accent-cyan)" />
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={isSimulationMode}
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cameras.map((cam) => (
                <option key={cam.camera_id} value={cam.camera_id}>
                  {cam.name} ({cam.status})
                </option>
              ))}
            </select>
          </div>

          <button
            className={`btn ${viewMode === 'focus' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode(viewMode === 'focus' ? 'grid' : 'focus')}
            title="Toggle Grid / Focus View"
          >
            {viewMode === 'focus' ? <LayoutGrid size={14} /> : <Maximize2 size={14} />}
            {viewMode === 'focus' ? 'Multi-Camera Grid' : 'Focus View'}
          </button>
        </div>

        {/* Right: Hardware Webcam & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`btn ${isBrowserWebcamActive ? 'btn-danger' : 'btn-secondary'}`}
            onClick={toggleBrowserWebcam}
            title="Capture real video from your laptop/browser webcam directly into YOLO inference"
          >
            <Video size={14} />
            {isBrowserWebcamActive ? 'Stop Laptop Webcam' : 'Use Laptop Webcam'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowAddModal(true)}
            title="Register an RTSP, Replay, or Hardware Camera"
          >
            <Plus size={14} /> Add Camera
          </button>

          <button
            className={`btn ${isSimulationMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsSimulationMode(!isSimulationMode)}
          >
            <Tv size={14} /> {isSimulationMode ? 'Exit Simulation' : 'Demo Simulation'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={loadCameras}
            title="Refresh stream telemetry"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {actionError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-danger)',
            color: 'var(--text-primary)',
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {actionError}
        </div>
      )}

      {isSimulationMode && (
        <TelemetryBanner
          mode="SIMULATION"
          message="SIMULATION MODE: Synthetic video stream and worker trajectory for safety boundary demonstration. Zero production database events generated."
          action={{
            label: 'Exit Simulation',
            onClick: () => setIsSimulationMode(false),
          }}
        />
      )}

      {/* Main Stream Area */}
      <div className="monitor-container">
        {/* Video Frame Box */}
        <div className="video-frame-box">
          {/* Video Header Badge */}
          <div className="video-overlay-header">
            <div className="feed-badge">
              <span
                className="pulse-dot"
                style={{
                  backgroundColor: isSimulationMode
                    ? 'var(--status-warning)'
                    : isCurrentLive
                    ? 'var(--status-success)'
                    : 'var(--text-muted)',
                }}
              />
              {isSimulationMode
                ? 'MODE: DEMO SIMULATION FIXTURE'
                : activeCamera
                ? `${activeCamera.name.toUpperCase()} [${activeCamera.status}]`
                : 'STATUS: DISCONNECTED'}
            </div>
            <div className="feed-badge">
              FPS:{' '}
              <strong>
                {isSimulationMode
                  ? '25.0'
                  : activeCamera?.metrics.effective_fps
                  ? activeCamera.metrics.effective_fps.toFixed(1)
                  : '0.0'}
              </strong>{' '}
              | LATENCY:{' '}
              <strong>
                {isSimulationMode
                  ? '12.3ms'
                  : activeCamera?.metrics.average_latency_ms
                  ? `${activeCamera.metrics.average_latency_ms}ms`
                  : '—'}
              </strong>
            </div>
          </div>

          {/* Conditional Video Stream / Simulation / Disconnected */}
          {isSimulationMode ? (
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="video-canvas"
              id="live-video-canvas"
            />
          ) : isCurrentLive && activeCamera && authToken ? (
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 440 }}>
              <img
                src={getCameraLiveStreamUrl(activeCamera.camera_id, authToken)}
                alt={`Live stream for ${activeCamera.name}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  backgroundColor: '#000',
                }}
                id="live-camera-mjpeg"
              />
            </div>
          ) : (
            <div
              style={{
                minHeight: 440,
                backgroundColor: '#070B14',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: 32,
                textAlign: 'center',
              }}
              id="stream-disconnected-view"
            >
              <VideoOff size={48} color="var(--text-muted)" />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {activeCamera ? `${activeCamera.name} is ${activeCamera.status}` : 'No Active Camera Selected'}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460 }}>
                  {activeCamera
                    ? `Source URI: ${activeCamera.sanitized_uri}. Click "Start Camera Feed" to initiate ingestion and live YOLO inference.`
                    : 'Register a camera or click "Use Laptop Webcam" to test real-time inference with your personal device.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {activeCamera && (
                  <button className="btn btn-primary" onClick={handleToggleFeed}>
                    <Play size={14} /> Start Camera Feed
                  </button>
                )}
                <button className="btn btn-secondary" onClick={toggleBrowserWebcam}>
                  <Video size={14} /> Use Laptop Webcam
                </button>
              </div>
            </div>
          )}

          {/* Bottom Player Controls */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-surface)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {!isSimulationMode && activeCamera && (
                <button
                  className={`btn ${isCurrentLive ? 'btn-danger' : 'btn-primary'}`}
                  onClick={handleToggleFeed}
                >
                  {isCurrentLive ? <Pause size={14} /> : <Play size={14} />}
                  {isCurrentLive ? 'Stop Feed' : 'Start Feed'}
                </button>
              )}

              {isSimulationMode && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause' : 'Resume'}
                </button>
              )}
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {isSimulationMode
                ? `SIM FRAME: ${String(simFrameIdx).padStart(4, '0')} / 0150`
                : activeCamera
                ? `PROCESSED: ${activeCamera.metrics.frames_processed} | DROPPED: ${activeCamera.metrics.frames_dropped}`
                : 'IDLE'}
            </div>
          </div>
        </div>

        {/* Right Information & Operations Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Spatial Violation Warning Banner */}
          <div
            style={{
              backgroundColor: workerInZone
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${workerInZone ? 'var(--status-danger)' : 'var(--status-success)'}`,
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {workerInZone ? (
                <AlertTriangle size={20} color="var(--status-danger)" />
              ) : (
                <ShieldCheck size={20} color="var(--status-success)" />
              )}
              <h4 style={{ fontSize: 14, fontWeight: 600 }}>
                {workerInZone
                  ? 'RESTRICTED ZONE INTRUSION'
                  : isSimulationMode
                  ? 'SIMULATION AREA CLEAR'
                  : isCurrentLive
                  ? 'LIVE MONITORING ACTIVE'
                  : 'STREAM DISCONNECTED'}
              </h4>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {workerInZone
                ? `Worker crossed restricted boundary (Persistence: ${persistenceFrames} frames).`
                : isCurrentLive
                ? 'Real YOLO inference active. Tracking entities against configured safety zones.'
                : 'Awaiting video feed frames from configured sources.'}
            </p>

            {workerInZone && (
              <button
                className="btn btn-danger"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onTriggerAgent('evt_sim_demo_01')}
                id="btn-trigger-agent-investigation"
              >
                <AlertTriangle size={14} /> Trigger AI Safety Investigation
              </button>
            )}
          </div>

          {/* Camera Telemetry & Operational Health Card */}
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
              CAMERA TELEMETRY & HEALTH
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Camera ID</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {activeCamera ? activeCamera.camera_id : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Source Type</span>
                <span style={{ fontWeight: 600 }}>
                  {activeCamera ? activeCamera.camera_type.toUpperCase() : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: isCurrentLive
                      ? 'var(--status-success)'
                      : activeCamera?.status === 'RECONNECTING'
                      ? 'var(--status-warning)'
                      : 'var(--text-muted)',
                  }}
                >
                  {activeCamera ? activeCamera.status : 'OFFLINE'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Endpoint URI</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeCamera ? activeCamera.sanitized_uri : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sampling Rate</span>
                <span>1 out of {activeCamera ? activeCamera.sampling_rate : 1} frames</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Reconnect Retries</span>
                <span>{activeCamera ? activeCamera.metrics.reconnect_count : 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Camera Grid View Section */}
      {viewMode === 'grid' && cameras.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Multi-Camera Facility Grid ({cameras.length} Sources Registered)
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {cameras.map((cam) => (
              <div
                key={cam.camera_id}
                className="card"
                style={{
                  padding: 12,
                  border: cam.camera_id === selectedCameraId ? '2px solid var(--border-active)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSelectedCameraId(cam.camera_id);
                  setViewMode('focus');
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{cam.name}</span>
                  <StatusBadge status={cam.status} size="sm" />
                </div>
                <div style={{ backgroundColor: '#000', height: 160, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cam.status === 'LIVE' && authToken ? (
                    <img
                      src={getCameraLiveStreamUrl(cam.camera_id, authToken)}
                      alt={cam.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <VideoOff size={24} />
                      <span>{cam.status}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Camera Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Register Camera Source"
        maxWidth={500}
      >
        <form onSubmit={handleCreateCamera} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Camera Identifier (e.g. cam-bay-02)
            </label>
            <input
              type="text"
              required
              value={newCamId}
              onChange={(e) => setNewCamId(e.target.value)}
              placeholder="cam-bay-02"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Camera Friendly Name
            </label>
            <input
              type="text"
              required
              value={newCamName}
              onChange={(e) => setNewCamName(e.target.value)}
              placeholder="Welding Bay Camera 2"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Source Protocol / Type
            </label>
            <select
              value={newCamType}
              onChange={(e) => {
                const t = e.target.value as any;
                setNewCamType(t);
                if (t === 'replay') setNewCamUri('data/fixtures/synthetic_safety_video.mp4');
                else if (t === 'rtsp') setNewCamUri('rtsp://admin:password@192.168.1.100:554/stream');
                else if (t === 'webcam') setNewCamUri('0');
                else if (t === 'browser_webcam') setNewCamUri('browser://local');
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="replay">Recorded Video Replay (.mp4)</option>
              <option value="rtsp">IP Camera (RTSP / RTSPS)</option>
              <option value="webcam">Hardware / USB Capture Device</option>
              <option value="browser_webcam">Client Browser Webcam Ingestion</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Stream URI / Device Path (Credentials automatically redacted)
            </label>
            <input
              type="text"
              required
              value={newCamUri}
              onChange={(e) => setNewCamUri(e.target.value)}
              placeholder="rtsp://admin:pass@192.168.1.50/stream or 0"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Inference Frame Sampling (Process 1 of N frames)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={newCamSampling}
              onChange={(e) => setNewCamSampling(parseInt(e.target.value) || 1)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register Camera
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
