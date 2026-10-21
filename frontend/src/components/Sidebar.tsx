import React from 'react';
import {
  LucideIcon,
  LayoutDashboard,
  Video,
  Box,
  Compass,
  ShieldAlert,
  GitBranch,
  BarChart3,
  Layers,
  HardHat,
  ChevronLeft,
  ChevronRight,
  Command,
} from 'lucide-react';
import { HealthInfo } from '../services/api';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeType?: 'live' | 'brand' | 'warning';
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'monitor', label: 'Live Monitor', icon: Video, badge: 'LIVE', badgeType: 'live' },
      { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
    ],
  },
  {
    title: 'SPATIAL DIGITAL TWIN',
    items: [
      { id: 'twin-center', label: 'Twin Center', icon: Box, badge: '4 SITES', badgeType: 'brand' },
      { id: 'twin', label: '3D Twin Viewer', icon: Compass, badge: '3D', badgeType: 'brand' },
    ],
  },
  {
    title: 'GOVERNANCE & AI',
    items: [
      { id: 'agent', label: 'Agent Trace', icon: GitBranch, badge: 'DAG', badgeType: 'brand' },
      { id: 'evaluation', label: 'Model Evaluation', icon: BarChart3 },
      { id: 'zones', label: 'Zone Policies', icon: Layers },
    ],
  },
];

interface SidebarProps {
  activeTab: string;
  onNavigate: (tabId: string) => void;
  health: HealthInfo | null;
  onOpenCommandMenu?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  health,
  onOpenCommandMenu,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const isBackendReady = health?.status === 'ready' && health?.database_connected;

  return (
    <aside
      className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}
      aria-label="Application Sidebar"
      style={{
        width: isCollapsed ? '72px' : '260px',
        transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 100,
        borderRight: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      <div
        className="brand-section"
        style={{
          padding: isCollapsed ? '18px 12px' : '20px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="brand-logo"
            aria-hidden="true"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, var(--accent-indigo, #6366F1), var(--accent-cyan, #00F5D4))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#060913',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
              flexShrink: 0,
            }}
          >
            <HardHat size={20} />
          </div>
          {!isCollapsed && (
            <div className="brand-text">
              <h1 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.6px', color: 'var(--text-primary)' }}>
                SENTINEL AI
              </h1>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.2px' }}>
                Safety Intelligence
              </span>
            </div>
          )}
        </div>

        {onToggleCollapse && !isCollapsed && (
          <button
            onClick={onToggleCollapse}
            title="Collapse sidebar (maximize workspace)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav
        className="nav-links"
        aria-label="Primary Navigation"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isCollapsed ? '12px 8px' : '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {!isCollapsed && (
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-dim, #64748B)',
                  letterSpacing: '0.8px',
                  padding: '4px 10px',
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? item.label : undefined}
                  style={{
                    width: '100%',
                    background: isActive
                      ? 'linear-gradient(90deg, var(--bg-card-hover, rgba(99, 102, 241, 0.2)), rgba(99, 102, 241, 0.05))'
                      : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderRadius: '0 8px 8px 0',
                    padding: isCollapsed ? '10px 0' : '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    gap: '10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon
                      size={18}
                      color={isActive ? 'var(--accent-cyan)' : 'currentColor'}
                      style={{ flexShrink: 0 }}
                    />
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge && (
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        letterSpacing: '0.4px',
                        background:
                          item.badgeType === 'live'
                            ? 'rgba(239, 68, 68, 0.18)'
                            : 'rgba(99, 102, 241, 0.18)',
                        color:
                          item.badgeType === 'live'
                            ? 'var(--status-danger, #ef4444)'
                            : 'var(--accent-cyan)',
                        border: `1px solid ${
                          item.badgeType === 'live'
                            ? 'rgba(239, 68, 68, 0.35)'
                            : 'rgba(99, 102, 241, 0.35)'
                        }`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {item.badgeType === 'live' && (
                        <span
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: '#ef4444',
                            animation: 'pulse 1.5s infinite',
                          }}
                        />
                      )}
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Command Palette Quick Launcher */}
      {onOpenCommandMenu && (
        <div style={{ padding: isCollapsed ? '8px' : '8px 12px' }}>
          <button
            onClick={onOpenCommandMenu}
            title="Open Command Palette (⌘K)"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: isCollapsed ? '8px 0' : '8px 10px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Command size={14} color="var(--accent-cyan)" />
              {!isCollapsed && <span>Quick Actions</span>}
            </div>
            {!isCollapsed && (
              <kbd
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                ⌘K
              </kbd>
            )}
          </button>
        </div>
      )}

      {/* Expand Button for Collapsed Mode */}
      {onToggleCollapse && isCollapsed && (
        <div style={{ padding: '8px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Engine Status Indicator Footer */}
      <div
        className="system-status-indicator"
        style={{
          padding: isCollapsed ? '12px 6px' : '14px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: '8px',
        }}
      >
        {!isCollapsed && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>
            Edge Engine
          </span>
        )}
        <div
          className={`status-pill ${isBackendReady ? 'online' : 'online'}`}
          title={
            isBackendReady
              ? 'Connected to Edge Safety Engine & SQLite DB'
              : 'Operating in Standalone Local Engine Mode'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: isCollapsed ? '4px' : '4px 8px',
            borderRadius: '20px',
            background: isBackendReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${isBackendReady ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
            fontSize: '11px',
            fontWeight: 600,
            color: isBackendReady ? 'var(--status-success)' : 'var(--accent-cyan)',
          }}
        >
          <span
            className="pulse-dot"
            aria-hidden="true"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isBackendReady ? 'var(--status-success)' : 'var(--accent-cyan)',
            }}
          />
          {!isCollapsed && <span>{isBackendReady ? 'ONLINE' : 'LOCAL'}</span>}
        </div>
      </div>
    </aside>
  );
};
