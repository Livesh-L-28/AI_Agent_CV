import React, { useEffect, useState } from 'react';
import { User, Key } from 'lucide-react';
import { Overview } from './pages/Overview';
import { LiveMonitor } from './pages/LiveMonitor';
import { Incidents } from './pages/Incidents';
import { AgentTrace } from './pages/AgentTrace';
import { ModelEvaluation } from './pages/ModelEvaluation';
import { ZoneConfig } from './pages/ZoneConfig';
import { DigitalTwin } from './pages/DigitalTwin';
import { DigitalTwinCenter } from './pages/DigitalTwinCenter';
import { Sidebar } from './components/Sidebar';
import { AppHeader } from './components/AppHeader';
import { Modal } from './components/Modal';
import { CommandMenu } from './components/CommandMenu';
import {
  fetchHealth,
  HealthInfo,
  getCurrentUser,
  CurrentUser,
  login,
  fetchVisionMetrics,
  VisionMetrics,
} from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>('manufacturing-plant');
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [visionMetrics, setVisionMetrics] = useState<VisionMetrics | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('sentinel_ui_theme');
    if (!saved || saved === 'cyber-aurora') {
      return 'daylight-clean';
    }
    return saved;
  });

  // Global Keyboard Shortcut: ⌘K or Ctrl+K to toggle Command Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sentinel_ui_theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));

    fetchVisionMetrics()
      .then(setVisionMetrics)
      .catch(() => setVisionMetrics(null));

    const interval = setInterval(() => {
      fetchHealth()
        .then(setHealth)
        .catch(() => setHealth(null));

      fetchVisionMetrics()
        .then(setVisionMetrics)
        .catch(() => setVisionMetrics(null));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSwitchRole = async (username: string, pass: string) => {
    try {
      setAuthError(null);
      await login(username, pass);
      setCurrentUser(getCurrentUser());
      setShowAuthModal(false);
    } catch (e: any) {
      setAuthError(e.message || 'Failed to switch user role');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview onNavigate={setActiveTab} />;
      case 'monitor':
        return (
          <LiveMonitor
            onTriggerAgent={() => {
              setActiveTab('agent');
            }}
          />
        );
      case 'incidents':
        return <Incidents />;
      case 'agent':
        return <AgentTrace />;
      case 'evaluation':
        return <ModelEvaluation />;
      case 'zones':
        return <ZoneConfig />;
      case 'twin-center':
        return (
          <DigitalTwinCenter
            onOpenTwin={(envId) => {
              setSelectedEnvironmentId(envId);
              setActiveTab('twin');
            }}
          />
        );
      case 'twin':
        return (
          <DigitalTwin
            initialEnvironmentId={selectedEnvironmentId}
            onNavigateToCenter={() => setActiveTab('twin-center')}
            onNavigate={setActiveTab}
          />
        );
      default:
        return <Overview onNavigate={setActiveTab} />;
    }
  };

  const getPageInfo = () => {
    switch (activeTab) {
      case 'overview':
        return {
          title: 'Industrial Safety Dashboard',
          subtitle: 'Real-time hazard monitoring, active cameras, and compliance telemetry',
        };
      case 'twin-center':
        return {
          title: 'Multi-Environment Digital Twin Center',
          subtitle: 'Configurable industrial 3D digital twins across manufacturing, warehousing, process, and construction',
        };
      case 'twin':
        return {
          title: 'Operational Digital Twin & Spatial 3D Mapping',
          subtitle: 'High-fidelity spatial twin with synchronized cameras, safety zones, and simulated scenarios',
        };
      case 'monitor':
        return {
          title: 'Live Camera Streams & Spatial Overlays',
          subtitle: 'Multi-camera video feeds with calibrated ground homography and detection HUDs',
        };
      case 'incidents':
        return {
          title: 'Incident Management & Human Review',
          subtitle: 'Audit trail, supervisory dispatch approvals, and evidence records',
        };
      case 'agent':
        return {
          title: 'Multi-Agent Execution & Verification Trace',
          subtitle: 'Investigator, Policy Gate, Responder, and Verifier execution DAG',
        };
      case 'evaluation':
        return {
          title: 'Computer Vision & Model Benchmarks',
          subtitle: 'Object detection precision, tracking IDF1, and inference throughput',
        };
      case 'zones':
        return {
          title: 'Safety Restricted Zone Definitions',
          subtitle: 'Planar hazard boundaries, persistence parameters, and required PPE',
        };
      default:
        return {
          title: 'Industrial Safety Platform',
          subtitle: 'Operational edge safety intelligence',
        };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <div className="app-container">
      {/* Semantic Accessible Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        health={health}
        onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="main-wrapper" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Dynamic Telemetry Header */}
        <AppHeader
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          currentUser={currentUser}
          health={health}
          visionMetrics={visionMetrics}
          onOpenAuthModal={() => setShowAuthModal(true)}
          activeTheme={theme}
          onSelectTheme={setTheme}
          onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
        />

        <main className="content-body" id="main-content" role="main">
          {renderContent()}
        </main>

        <footer
          style={{
            padding: '10px 32px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            background: 'var(--bg-surface)',
          }}
        >
          ADVISORY PROTOTYPE ONLY — Does not replace certified safety interlocks, required statutory inspections, or qualified safety personnel. Not OSHA certified.
        </footer>
      </div>

      {/* Command Palette Keyboard Modal (⌘K) */}
      <CommandMenu
        isOpen={isCommandMenuOpen}
        onClose={() => setIsCommandMenuOpen(false)}
        onNavigate={setActiveTab}
        onSelectTheme={setTheme}
        onSelectEnvironment={setSelectedEnvironmentId}
        activeTheme={theme}
      />

      {/* Accessible Role Switcher Modal */}
      <Modal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Enterprise Role Authentication"
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Select an authorized operator profile to verify role-based access control (RBAC), camera ingestion, and incident resolutions.
        </p>

        {authError && (
          <div
            style={{
              padding: 10,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--status-danger)',
              borderRadius: 6,
              color: 'var(--status-danger)',
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            {authError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className={`btn ${currentUser.username === 'safety_officer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'space-between', padding: '12px 16px', width: '100%' }}
            onClick={() => handleSwitchRole('safety_officer', 'officer_secure_password_42!')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <User size={16} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>Safety Officer (Standard)</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>username: safety_officer</div>
              </div>
            </div>
            <span className="badge badge-info">SAFETY_OFFICER</span>
          </button>

          <button
            className={`btn ${currentUser.username === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'space-between', padding: '12px 16px', width: '100%' }}
            onClick={() => handleSwitchRole('admin', 'admin_secure_password_99!')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Key size={16} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>Administrator (Root Operations)</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>username: admin</div>
              </div>
            </div>
            <span className="badge badge-critical">ADMIN</span>
          </button>

          <button
            className={`btn ${currentUser.username === 'viewer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'space-between', padding: '12px 16px', width: '100%' }}
            onClick={() => handleSwitchRole('viewer', 'viewer_read_only_pass_12!')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <User size={16} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>Auditor / Viewer (Read Only)</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>username: viewer</div>
              </div>
            </div>
            <span className="badge badge-warning">VIEWER</span>
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
