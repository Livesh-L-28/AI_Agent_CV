/**
 * SENTINEL AI - Web Audio API Synthesized Safety Alert Sound Engine
 * Zero external audio dependencies. Generates accessible, compliant industrial chimes.
 */

class SafetyAudioAlertEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sentinel_audio_alerts');
      this.muted = stored === 'muted';
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sentinel_audio_alerts', muted ? 'muted' : 'active');
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Plays a synthesized frequency chime for critical safety events or subtle info pings.
   */
  public playAlert(severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'CRITICAL'): void {
    if (this.muted) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (severity === 'CRITICAL') {
        // High-low two-tone industrial chime: 880Hz -> 587Hz (A5 -> D5)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(587, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (severity === 'WARNING') {
        // Mid-tone alert ping: 660Hz (E5)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else {
        // Soft click / acknowledge tone: 440Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Audio policy silently handled
    }
  }
}

export const audioAlertEngine = new SafetyAudioAlertEngine();
