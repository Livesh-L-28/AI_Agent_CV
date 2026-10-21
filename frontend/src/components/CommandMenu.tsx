import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  LayoutDashboard,
  Video,
  Box,
  Compass,
  ShieldAlert,
  GitBranch,
  BarChart3,
  Layers,
  Palette,
  Volume2,
  VolumeX,
  Play,
  X,
  Sparkles,
} from 'lucide-react';
import { audioAlertEngine } from '../services/audioAlerts';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Appearance' | 'Facility' | 'Action';
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  badge?: string;
  action: () => void;
}

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tabId: string) => void;
  onSelectTheme: (themeId: string) => void;
  onSelectEnvironment?: (envId: string) => void;
  onStartDemo?: () => void;
  activeTheme: string;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectTheme,
  onSelectEnvironment,
  onStartDemo,
  activeTheme,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items: CommandItem[] = [
    // Navigation
    {
      id: 'nav-overview',
      category: 'Navigation',
      label: 'Operations Overview',
      sublabel: 'Plant-wide telemetry, KPIs & safety fleet summary',
      icon: LayoutDashboard,
      badge: 'G O',
      action: () => {
        onNavigate('overview');
        onClose();
      },
    },
    {
      id: 'nav-monitor',
      category: 'Navigation',
      label: 'Live Monitor',
      sublabel: 'RTSP CCTV stream grid, detection bounding boxes & alerts',
      icon: Video,
      badge: 'LIVE',
      action: () => {
        onNavigate('monitor');
        onClose();
      },
    },
    {
      id: 'nav-twin-center',
      category: 'Navigation',
      label: 'Digital Twin Center',
      sublabel: 'Multi-facility catalog & industrial 3D environments',
      icon: Box,
      badge: '4 SITES',
      action: () => {
        onNavigate('twin-center');
        onClose();
      },
    },
    {
      id: 'nav-twin-viewer',
      category: 'Navigation',
      label: '3D Digital Twin Viewer',
      sublabel: 'Interactive 3D walkthrough, camera frustums & zone overlays',
      icon: Compass,
      badge: '3D WEBGL',
      action: () => {
        onNavigate('twin');
        onClose();
      },
    },
    {
      id: 'nav-incidents',
      category: 'Navigation',
      label: 'Incidents Workspace',
      sublabel: 'Searchable triage queue & SHA-256 evidence integrity',
      icon: ShieldAlert,
      action: () => {
        onNavigate('incidents');
        onClose();
      },
    },
    {
      id: 'nav-agent',
      category: 'Navigation',
      label: 'Agent Trace Console',
      sublabel: '4-stage bounded execution DAG & deterministic policy gate',
      icon: GitBranch,
      badge: 'AI DAG',
      action: () => {
        onNavigate('agent');
        onClose();
      },
    },
    {
      id: 'nav-eval',
      category: 'Navigation',
      label: 'Model Evaluation',
      sublabel: 'Precision, recall, mAP@50 curves & latency benchmarks',
      icon: BarChart3,
      action: () => {
        onNavigate('evaluation');
        onClose();
      },
    },
    {
      id: 'nav-zones',
      category: 'Navigation',
      label: 'Zone Policies & Rules',
      sublabel: 'Spatial polygon boundaries & persistence thresholds',
      icon: Layers,
      action: () => {
        onNavigate('zones');
        onClose();
      },
    },

    // Actions
    {
      id: 'act-audio',
      category: 'Action',
      label: audioAlertEngine.isMuted() ? 'Enable Safety Audio Alarms' : 'Mute Safety Audio Alarms',
      sublabel: 'Synthesized Web Audio API industrial warning tones',
      icon: audioAlertEngine.isMuted() ? Volume2 : VolumeX,
      badge: audioAlertEngine.isMuted() ? 'MUTED' : 'ACTIVE',
      action: () => {
        audioAlertEngine.toggleMute();
        onClose();
      },
    },
    {
      id: 'act-demo',
      category: 'Action',
      label: 'Launch 3D Simulation Demo',
      sublabel: 'Cinematic 6-scene interactive safety walkthrough',
      icon: Play,
      badge: 'DEMO',
      action: () => {
        onNavigate('twin');
        if (onStartDemo) onStartDemo();
        onClose();
      },
    },

    // Themes
    {
      id: 'theme-daylight',
      category: 'Appearance',
      label: 'Theme: Daylight Enterprise (Light)',
      sublabel: 'Clean crisp light mode for bright control rooms',
      icon: Palette,
      badge: activeTheme === 'daylight-clean' ? 'CURRENT' : undefined,
      action: () => {
        onSelectTheme('daylight-clean');
        onClose();
      },
    },
    {
      id: 'theme-obsidian',
      category: 'Appearance',
      label: 'Theme: Obsidian Aurora',
      sublabel: 'Midnight black, royal indigo & electric ultraviolet',
      icon: Palette,
      badge: activeTheme === 'cyber-aurora' ? 'CURRENT' : undefined,
      action: () => {
        onSelectTheme('cyber-aurora');
        onClose();
      },
    },
    {
      id: 'theme-hazard',
      category: 'Appearance',
      label: 'Theme: Hazard Gold',
      sublabel: 'Heavy industrial titanium & safety amber',
      icon: Palette,
      badge: activeTheme === 'industrial-safety' ? 'CURRENT' : undefined,
      action: () => {
        onSelectTheme('industrial-safety');
        onClose();
      },
    },
    {
      id: 'theme-emerald',
      category: 'Appearance',
      label: 'Theme: Tactical Emerald',
      sublabel: 'Cyber-ops dark matrix & bio-emerald',
      icon: Palette,
      badge: activeTheme === 'tactical-matrix' ? 'CURRENT' : undefined,
      action: () => {
        onSelectTheme('tactical-matrix');
        onClose();
      },
    },
    {
      id: 'theme-sapphire',
      category: 'Appearance',
      label: 'Theme: Naval Sapphire',
      sublabel: 'Deep maritime command & oceanic blue',
      icon: Palette,
      badge: activeTheme === 'command-blue' ? 'CURRENT' : undefined,
      action: () => {
        onSelectTheme('command-blue');
        onClose();
      },
    },

    // Facilities
    {
      id: 'fac-mfg',
      category: 'Facility',
      label: 'Switch Site: Discrete Manufacturing Bay',
      sublabel: '60x40m assembly bay with CNC centers & robotic cells',
      icon: Sparkles,
      action: () => {
        if (onSelectEnvironment) onSelectEnvironment('manufacturing-plant');
        onNavigate('twin');
        onClose();
      },
    },
    {
      id: 'fac-warehouse',
      category: 'Facility',
      label: 'Switch Site: Warehouse & Logistics Hub',
      sublabel: '70x45m high-bay selective pallet racking & sorting loops',
      icon: Sparkles,
      action: () => {
        if (onSelectEnvironment) onSelectEnvironment('warehouse-logistics');
        onNavigate('twin');
        onClose();
      },
    },
    {
      id: 'fac-chemical',
      category: 'Facility',
      label: 'Switch Site: Process & Chemical Refining Plant',
      sublabel: '65x40m fractionation towers & pressurized gas storage',
      icon: Sparkles,
      action: () => {
        if (onSelectEnvironment) onSelectEnvironment('chemical-process');
        onNavigate('twin');
        onClose();
      },
    },
    {
      id: 'fac-construction',
      category: 'Facility',
      label: 'Switch Site: Infrastructure Construction Site',
      sublabel: '55x45m multi-story core, tower crane & excavation trench',
      icon: Sparkles,
      action: () => {
        if (onSelectEnvironment) onSelectEnvironment('construction-site');
        onNavigate('twin');
        onClose();
      },
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(query.toLowerCase())) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--modal-scrim, rgba(15, 23, 42, 0.45))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--border-subtle)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '72vh',
          animation: 'commandMenuIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
          }}
        >
          <Search size={20} color="var(--accent-cyan)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, route, theme or facility... (↑↓ to select, ESC to exit)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              No commands or routes matching "{query}"
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-card-hover, rgba(99, 102, 241, 0.15))' : 'transparent',
                    border: isSelected ? '1px solid var(--border-active)' : '1px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: isSelected ? 'var(--accent-cyan)' : 'var(--bg-elevated)',
                        color: isSelected ? '#030712' : 'var(--accent-cyan)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.label}
                      </div>
                      {item.sublabel && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: isSelected ? 'rgba(0, 245, 212, 0.2)' : 'var(--bg-elevated)',
                        color: isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hint Bar */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span><kbd style={{ background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: '4px' }}>↑</kbd> <kbd style={{ background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: '4px' }}>↓</kbd> Navigate</span>
            <span><kbd style={{ background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: '4px' }}>↵</kbd> Select</span>
            <span><kbd style={{ background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: '4px' }}>ESC</kbd> Close</span>
          </div>
          <span>SENTINEL AI Command Palette</span>
        </div>
      </div>
    </div>
  );
};
