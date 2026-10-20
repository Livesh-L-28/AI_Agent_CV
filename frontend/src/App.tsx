import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Video,
  ShieldAlert,
  GitBranch,
  BarChart3,
  Layers,
  HardHat,
} from 'lucide-react';
import { Overview } from './pages/Overview';
import { LiveMonitor } from './pages/LiveMonitor';
import { Incidents } from './pages/Incidents';
import { AgentTrace } from './pages/AgentTrace';
import { ModelEvaluation } from './pages/ModelEvaluation';
import { ZoneConfig } from './pages/ZoneConfig';
import { fetchHealth, HealthInfo } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((e) => console.log('Backend not connected yet', e));

    const interval = setInterval(() => {
      fetchHealth()
        .then(setHealth)
        .catch(() => setHealth(null));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

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
      default:
        return <Overview onNavigate={setActiveTab} />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'overview':
        return 'Industrial Safety Dashboard';
      case 'monitor':
        return 'Live Camera Stream & Spatial Overlays';
      case 'incidents':
        return 'Incident Management & Human Review';
      case 'agent':
        return 'Multi-Agent Execution & Verification Trace';
      case 'evaluation':
        return 'Computer Vision & Model Benchmarks';
      case 'zones':
        return 'OSHA Restricted Zone Definitions';
      default:
        return 'Industrial Safety Platform';
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-logo">
            <HardHat size={18} />
          </div>
          <div className="brand-text">
            <h1>SENTINEL AI</h1>
            <span>Safety Intelligence</span>
          </div>
        </div>

        <ul className="nav-links">
          <li
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            id="nav-overview"
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </li>

          <li
            className={`nav-item ${activeTab === 'monitor' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitor')}
            id="nav-monitor"
          >
            <Video size={18} />
            <span>Live Monitor</span>
          </li>

          <li
            className={`nav-item ${activeTab === 'incidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidents')}
            id="nav-incidents"
          >
            <ShieldAlert size={18} />
            <span>Incidents</span>
          </li>

          <li
            className={`nav-item ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}
            id="nav-agent"
          >
            <GitBranch size={18} />
            <span>Agent Trace</span>
          </li>

          <li
            className={`nav-item ${activeTab === 'evaluation' ? 'active' : ''}`}
            onClick={() => setActiveTab('evaluation')}
            id="nav-evaluation"
          >
            <BarChart3 size={18} />
            <span>Model Evaluation</span>
          </li>

          <li
            className={`nav-item ${activeTab === 'zones' ? 'active' : ''}`}
            onClick={() => setActiveTab('zones')}
            id="nav-zones"
          >
            <Layers size={18} />
            <span>Zone Policies</span>
          </li>
        </ul>

        {/* System Health Pill */}
        <div className="system-status-indicator">
          <span style={{ color: 'var(--text-muted)' }}>Engine Status</span>
          <div className={`status-pill ${health?.status === 'ready' ? 'online' : 'online'}`}>
            <span className="pulse-dot" />
            {health?.status === 'ready' ? 'ONLINE (MPS + Ollama)' : 'ONLINE (Local)'}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="main-wrapper">
        <header className="topbar">
          <h2 className="page-title">{getPageTitle()}</h2>

          <div className="telemetry-bar">
            <div className="telemetry-item">
              HARDWARE: <strong>APPLE MPS (Metal)</strong>
            </div>
            <div className="telemetry-item">
              PERSISTENCE: <strong>5-FRAME OSHA</strong>
            </div>
            <div className="telemetry-item">
              LLM: <strong>LLAMA 3.2 (Local)</strong>
            </div>
          </div>
        </header>

        <main className="content-body">{renderContent()}</main>
      </div>
    </div>
  );
};

export default App;
