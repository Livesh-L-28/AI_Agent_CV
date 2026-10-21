import React, { useState, useRef, useEffect } from 'react';
import { Palette, User, Wifi, WifiOff, Cpu, Command, Volume2, VolumeX, Clock } from 'lucide-react';
import { CurrentUser, HealthInfo, VisionMetrics } from '../services/api';
import { audioAlertEngine } from '../services/audioAlerts';

export interface ThemeOption {
  id: string;
  name: string;
  color: string;
}

export const APP_THEMES: ThemeOption[] = [
  { id: 'daylight-clean', name: 'Daylight Clean (Light)', color: '#4F46E5' },
  { id: 'cyber-aurora', name: 'Obsidian Aurora (Dark)', color: '#6366F1' },
  { id: 'industrial-safety', name: 'Hazard Gold (Dark)', color: '#F59E0B' },
  { id: 'tactical-matrix', name: 'Tactical Emerald (Dark)', color: '#10B981' },
  { id: 'command-blue', name: 'Naval Sapphire (Dark)', color: '#38BDF8' },
];

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  currentUser: CurrentUser;
  health: HealthInfo | null;
  visionMetrics?: VisionMetrics | null;
  onOpenAuthModal: () => void;
  activeTheme: string;
  onSelectTheme: (themeId: string) => void;
  onOpenCommandMenu?: () => void;
  actions?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  currentUser,
  health,
  visionMetrics,
  onOpenAuthModal,
  activeTheme,
  onSelectTheme,
  onOpenCommandMenu,
  actions,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(() => audioAlertEngine.isMuted());
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    if (showThemeMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showThemeMenu]);

  const currentThemeObj = APP_THEMES.find((t) => t.id === activeTheme) || APP_THEMES[0];

  const roleBadgeColor =
    currentUser.role === 'admin'
      ? 'var(--status-danger)'
      : currentUser.role === 'safety_officer'
      ? 'var(--accent-cyan)'
      : 'var(--text-secondary)';

  return (
    <header className="topbar" role="banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div>
          <h2 className="page-title">{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{subtitle}</p>
          )}
        </div>
      </div>

      <div className="telemetry-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Quick Search & Command Palette Launcher */}
        {onOpenCommandMenu && (
          <button
            onClick={onOpenCommandMenu}
            title="Open Command Menu (⌘K / Ctrl+K)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <Command size={13} color="var(--accent-cyan)" />
            <span style={{ display: 'none', color: 'var(--text-muted)' }}>Search</span>
            <kbd
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '1px 5px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        )}

        {/* Live System Clock */}
        <div
          className="telemetry-item"
          title="Plant Local Operating Clock"
          style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <Clock size={12} color="var(--accent-cyan)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.5px' }}>
            {currentTime}
          </span>
        </div>

        {/* Dynamic Hardware/Vision Telemetry Badge */}
        {visionMetrics && visionMetrics.device ? (
          <div className="telemetry-item" title="Active Vision Processing Device">
            <Cpu size={12} style={{ display: 'inline', marginRight: 4 }} />
            HW: <strong>{visionMetrics.device.toUpperCase()}</strong> ({visionMetrics.effective_fps.toFixed(0)} FPS)
          </div>
        ) : health?.status === 'ready' ? (
          <div className="telemetry-item" title="Backend API Connected">
            <Wifi size={12} style={{ display: 'inline', marginRight: 4, color: 'var(--status-success)' }} />
            API: <strong style={{ color: 'var(--status-success)' }}>CONNECTED</strong>
          </div>
        ) : (
          <div className="telemetry-item" title="Connecting to Backend API">
            <WifiOff size={12} style={{ display: 'inline', marginRight: 4, color: 'var(--status-warning)' }} />
            API: <strong style={{ color: 'var(--status-warning)' }}>OFFLINE (Local)</strong>
          </div>
        )}

        {/* Global Safety Audio Alarm Mute / Unmute Toggle */}
        <button
          onClick={() => {
            const nextMuted = audioAlertEngine.toggleMute();
            setIsMuted(nextMuted);
          }}
          title={isMuted ? 'Safety audio alarms MUTED. Click to activate.' : 'Safety audio alarms ACTIVE. Click to mute.'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            background: isMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
            color: isMuted ? 'var(--status-danger, #ef4444)' : 'var(--status-success, #10b981)',
            transition: 'all 0.15s ease',
          }}
        >
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          <span>{isMuted ? 'Muted' : 'Audio ON'}</span>
        </button>

        {/* User Identity & Role Badge */}
        <div
          className="user-identity-badge"
          onClick={onOpenAuthModal}
          title="Switch User Role & Access Profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? onOpenAuthModal() : undefined)}
          id="btn-user-role-badge"
        >
          <User size={13} color={roleBadgeColor} aria-hidden="true" />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentUser.username}
          </span>
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              color: roleBadgeColor,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 4,
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            {currentUser.role.replace('_', ' ')}
          </span>
        </div>

        {/* Theme Palette Switcher */}
        <div style={{ position: 'relative' }} ref={themeMenuRef}>
          <div
            className="user-identity-badge"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            title="Change UI Theme Palette"
            id="btn-theme-switcher"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? setShowThemeMenu(!showThemeMenu) : undefined)}
          >
            <Palette size={13} color="var(--accent-cyan)" aria-hidden="true" />
            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              {currentThemeObj.name}
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: currentThemeObj.color,
                boxShadow: `0 0 6px ${currentThemeObj.color}`,
                display: 'inline-block',
              }}
              aria-hidden="true"
            />
          </div>

          {showThemeMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-card)',
                borderRadius: '8px',
                padding: '6px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
                minWidth: '180px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Select UI Theme
              </div>
              {APP_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectTheme(t.id);
                    setShowThemeMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTheme === t.id ? 'var(--bg-elevated)' : 'transparent',
                    color: activeTheme === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: t.color,
                        boxShadow: `0 0 8px ${t.color}`,
                        display: 'inline-block',
                      }}
                    />
                    <span>{t.name}</span>
                  </div>
                  {activeTheme === t.id && (
                    <span style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>Active</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {actions}
      </div>
    </header>
  );
};
