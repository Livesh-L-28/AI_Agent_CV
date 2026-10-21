import React from 'react';
import { Sparkles, History, AlertTriangle, VideoOff } from 'lucide-react';

interface TelemetryBannerProps {
  mode: 'SIMULATION' | 'REPLAY' | 'DISCONNECTED' | 'WARNING';
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const TelemetryBanner: React.FC<TelemetryBannerProps> = ({
  mode,
  message,
  action,
  className = '',
}) => {
  let bannerClass = 'telemetry-banner warning';
  let Icon = AlertTriangle;
  let defaultMessage = '';

  switch (mode) {
    case 'SIMULATION':
      bannerClass = 'telemetry-banner sim';
      Icon = Sparkles;
      defaultMessage = 'SIMULATION MODE: Rendered worker tracks, events, and metrics are synthetic. Production databases are isolated.';
      break;
    case 'REPLAY':
      bannerClass = 'telemetry-banner warning';
      Icon = History;
      defaultMessage = 'HISTORICAL REPLAY: Displaying recorded past telemetry. Real-time alerting is paused.';
      break;
    case 'DISCONNECTED':
      bannerClass = 'telemetry-banner danger';
      Icon = VideoOff;
      defaultMessage = 'EDGE DISCONNECTED: Stream connection lost. Displaying cached factory topology.';
      break;
    default:
      bannerClass = 'telemetry-banner warning';
      Icon = AlertTriangle;
      defaultMessage = 'ATTENTION: Operational warning threshold reached.';
      break;
  }

  return (
    <div className={`${bannerClass} ${className}`} role="status">
      <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message || defaultMessage}</span>
      {action && (
        <button
          className="btn btn-secondary"
          onClick={action.onClick}
          style={{ padding: '3px 10px', fontSize: 11, marginLeft: 12 }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
