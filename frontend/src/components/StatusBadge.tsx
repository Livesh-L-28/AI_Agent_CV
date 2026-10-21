import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Info, Sparkles, VideoOff, Wifi } from 'lucide-react';

export type StatusType =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'WARNING'
  | 'SAFE'
  | 'OPEN'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'LIVE'
  | 'SIMULATION'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'STALE'
  | 'ERROR'
  | 'OPERATIONAL'
  | 'MAINTENANCE';

interface StatusBadgeProps {
  status: string;
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  pulse = false,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const normalized = (status || '').toUpperCase();

  let badgeClass = 'badge-info';
  let Icon = Info;

  switch (normalized) {
    case 'CRITICAL':
    case 'DANGER':
    case 'ERROR':
    case 'POLICY VIOLATED':
      badgeClass = 'badge-critical';
      Icon = ShieldAlert;
      break;
    case 'HIGH':
    case 'WARNING':
    case 'STALE':
    case 'RECONNECTING':
      badgeClass = 'badge-warning';
      Icon = AlertTriangle;
      break;
    case 'SAFE':
    case 'RESOLVED':
    case 'LIVE':
    case 'OPERATIONAL':
    case 'COMPLIANT':
    case 'PASS':
    case 'VERIFIED_SUCCESS':
      badgeClass = 'badge-success';
      Icon = CheckCircle;
      break;
    case 'SIMULATION':
    case 'SIMULATED':
      badgeClass = 'badge-purple';
      Icon = Sparkles;
      break;
    case 'DISCONNECTED':
    case 'STOPPED':
    case 'DISABLED':
    case 'UNREGISTERED':
      badgeClass = 'badge-secondary';
      Icon = VideoOff;
      break;
    case 'CONNECTING':
      badgeClass = 'badge-warning';
      Icon = Wifi;
      break;
    default:
      badgeClass = 'badge-info';
      Icon = Info;
      break;
  }

  const fontSize = size === 'sm' ? 10 : 11;
  const padding = size === 'sm' ? '2px 6px' : '3px 8px';
  const iconSize = size === 'sm' ? 11 : 12;

  return (
    <span
      className={`badge ${badgeClass} ${className}`}
      style={{ fontSize, padding, display: 'inline-flex', alignItems: 'center', gap: 5 }}
      role="status"
      aria-label={`Status: ${label || status}`}
    >
      {pulse && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'currentColor',
            display: 'inline-block',
            animation: 'pulse 1.5s infinite',
          }}
        />
      )}
      {showIcon && <Icon size={iconSize} aria-hidden="true" />}
      <span>{label || status}</span>
    </span>
  );
};
