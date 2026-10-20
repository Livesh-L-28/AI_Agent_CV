import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  HardHat,
  Eye,
  Sliders,
} from 'lucide-react';

interface LiveMonitorProps {
  onTriggerAgent: (eventId: string) => void;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({ onTriggerAgent }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const [fps] = useState(25.0);
  const [latencyMs] = useState(12.3);
  const [showZones, setShowZones] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [workerInZone, setWorkerInZone] = useState(false);
  const [persistenceFrames, setPersistenceFrames] = useState(0);

  // Animation & Rendering loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = time - lastTime;
      if (dt > 40 && isPlaying) {
        lastTime = time;
        setFrameIdx((prev) => (prev + 1) % 150);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawIndustrialScene(ctx, frameIdx, showZones, showBoxes);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, frameIdx, showZones, showBoxes]);

  // Evaluate worker position in restricted zone
  useEffect(() => {
    const totalFrames = 150;
    const progress = frameIdx / totalFrames;
    const workerX = 120 + progress * 400; // Worker walks from x=120 to x=520

    // Zone spans x: 360 to 580
    const inZone = workerX >= 360 && workerX <= 580;
    setWorkerInZone(inZone);

    if (inZone) {
      setPersistenceFrames((prev) => prev + 1);
    } else {
      setPersistenceFrames(0);
    }
  }, [frameIdx]);

  const drawIndustrialScene = (
    ctx: CanvasRenderingContext2D,
    frame: number,
    drawZones: boolean,
    drawBoxes: boolean
  ) => {
    const width = 640;
    const height = 480;

    // Slate Background
    ctx.fillStyle = '#101726';
    ctx.fillRect(0, 0, width, height);

    // Floor lines
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    for (let y = 100; y < height; y += 70) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw Restricted Zone (x: 360..580, y: 220..440)
    if (drawZones) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(360, 220, 220, 220);

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(360, 220, 220, 220);

      // Warning text
      ctx.fillStyle = '#EF4444';
      ctx.font = '12px "JetBrains Mono"';
      ctx.fillText('RESTRICTED ZONE A-1 (CRANE AREA)', 370, 240);
    }

    // Compute Worker position
    const totalFrames = 150;
    const progress = frame / totalFrames;
    const wx = 120 + progress * 400;
    const wy = 320;

    // Worker Figure
    // Head & Hardhat
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(wx, wy - 65, 14, 0, Math.PI * 2);
    ctx.fill();

    // Yellow Helmet
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.ellipse(wx, wy - 72, 16, 9, 0, Math.PI, 0);
    ctx.fill();

    // Safety Orange Vest & Torso
    ctx.fillStyle = '#F97316';
    ctx.fillRect(wx - 16, wy - 48, 32, 56);
    // Reflective silver stripes
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - 16, wy - 30);
    ctx.lineTo(wx + 16, wy - 30);
    ctx.moveTo(wx - 16, wy - 12);
    ctx.lineTo(wx + 16, wy - 12);
    ctx.stroke();

    // Legs
    const legOffset = Math.sin(frame * 0.35) * 8;
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(wx - 6, wy + 8);
    ctx.lineTo(wx - 8 + legOffset, wy + 55);
    ctx.moveTo(wx + 6, wy + 8);
    ctx.lineTo(wx + 8 - legOffset, wy + 55);
    ctx.stroke();

    // Ground Contact Point Dot (Red)
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(wx, wy + 55, 4, 0, Math.PI * 2);
    ctx.fill();

    // Detections & Bounding Boxes
    if (drawBoxes) {
      const bx1 = wx - 22;
      const by1 = wy - 82;
      const bw = 44;
      const bh = 140;

      const isViolating = wx >= 360 && wx <= 580;
      const boxColor = isViolating ? '#EF4444' : '#10B981';

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx1, by1, bw, bh);

      // Label Banner
      ctx.fillStyle = boxColor;
      ctx.fillRect(bx1, by1 - 20, 130, 20);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 11px "JetBrains Mono"';
      ctx.fillText(`#101 person 0.94`, bx1 + 4, by1 - 6);

      // PPE indicators
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.fillRect(bx1 + bw + 4, by1, 85, 36);
      ctx.fillStyle = '#070B14';
      ctx.font = '10px "Inter"';
      ctx.fillText('HELMET: OK', bx1 + bw + 8, by1 + 14);
      ctx.fillText('VEST: OK', bx1 + bw + 8, by1 + 28);
    }
  };

  return (
    <div>
      <div className="monitor-container">
        {/* Main Video Box */}
        <div className="video-frame-box">
          <div className="video-overlay-header">
            <div className="feed-badge">
              <span className="pulse-dot" style={{ color: 'var(--status-success)' }} />
              LIVE: CAM-BAY-01 [REPLAY REFERENCE]
            </div>
            <div className="feed-badge">
              FPS: <strong>{fps.toFixed(1)}</strong> | LATENCY: <strong>{latencyMs}ms (MPS)</strong>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="video-canvas"
            id="live-video-canvas"
          />

          {/* Player controls */}
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
              <button
                className="btn btn-secondary"
                onClick={() => setIsPlaying(!isPlaying)}
                id="btn-play-pause"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                {isPlaying ? 'Pause Feed' : 'Resume Feed'}
              </button>

              <button
                className={`btn ${showZones ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowZones(!showZones)}
              >
                <Sliders size={14} /> Zone Overlay
              </button>

              <button
                className={`btn ${showBoxes ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowBoxes(!showBoxes)}
              >
                <Eye size={14} /> BBoxes & PPE
              </button>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              FRAME: <strong>{String(frameIdx).padStart(4, '0')}</strong> / 0150
            </div>
          </div>
        </div>

        {/* Live Detection & Agent Feed Panel */}
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
                {workerInZone ? 'RESTRICTED ZONE ENTRY' : 'AREA CLEAR & COMPLIANT'}
              </h4>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {workerInZone
                ? `Worker #101 inside Crane Danger Zone A-1 (${persistenceFrames} consecutive frames).`
                : 'All detected personnel are within designated walkways.'}
            </p>

            {workerInZone && persistenceFrames >= 5 && (
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onTriggerAgent('evt_zone_entry_live')}
              >
                Trigger AI Agent Investigation
              </button>
            )}
          </div>

          {/* Tracked Entities Card */}
          <div className="table-container" style={{ flex: 1 }}>
            <div className="table-header">
              <h4 style={{ fontSize: 13, fontWeight: 600 }}>Tracked Personnel</h4>
              <span className="badge badge-info">1 Active</span>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  backgroundColor: 'var(--bg-card)',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Worker #101</strong>
                  <span className="badge badge-success">ACTIVE</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>Confidence: 94.2%</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HardHat size={14} color="var(--status-success)" /> Hardhat: <strong style={{ color: 'var(--status-success)' }}>Compliant</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} color="var(--status-success)" /> High-Vis Vest: <strong style={{ color: 'var(--status-success)' }}>Compliant</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
