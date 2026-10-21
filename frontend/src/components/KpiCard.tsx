import React from 'react';
import { LucideIcon } from 'lucide-react';
import { SkeletonLoader } from './SkeletonLoader';

interface KpiCardProps {
  id?: string;
  title: string;
  icon?: LucideIcon;
  iconColor?: string;
  value?: string | number | null;
  unit?: string;
  subtitle?: string;
  status?: string;
  footer?: React.ReactNode;
  loading?: boolean;
  unavailableText?: string;
  borderColor?: string;
  onClick?: () => void;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  id,
  title,
  icon: Icon,
  iconColor = 'var(--accent-cyan)',
  value,
  unit,
  subtitle,
  status: _status,
  footer,
  loading = false,
  unavailableText = 'Unavailable',
  borderColor,
  onClick,
  className = '',
}) => {
  const isAvailable = value !== undefined && value !== null;

  return (
    <div
      id={id}
      className={`kpi-card ${className}`}
      style={{
        borderLeft: borderColor ? `4px solid ${borderColor}` : undefined,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
      role={onClick ? 'button' : 'region'}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ' ? onClick() : undefined) : undefined}
      aria-label={`${title}: ${loading ? 'Loading' : isAvailable ? `${value} ${unit || ''}` : unavailableText}`}
    >
      <div className="kpi-title">
        <span>{title}</span>
        {Icon && <Icon size={16} color={iconColor} aria-hidden="true" />}
      </div>

      {loading ? (
        <div style={{ margin: '8px 0' }}>
          <SkeletonLoader variant="title" width="70%" />
        </div>
      ) : (
        <div className="kpi-value" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span>{isAvailable ? value : <span style={{ color: 'var(--text-dim)', fontSize: 20 }}>{unavailableText}</span>}</span>
          {unit && isAvailable && (
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {unit}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <SkeletonLoader variant="text" width="50%" />
      ) : footer ? (
        <div className="kpi-footer">{footer}</div>
      ) : subtitle ? (
        <div className="kpi-footer" style={{ color: 'var(--text-secondary)' }}>{subtitle}</div>
      ) : null}
    </div>
  );
};
