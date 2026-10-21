import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
}) => {
  const ActionIcon = action?.icon;

  return (
    <div className={`empty-state ${className}`} role="status">
      <div className="empty-state-icon">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h4 className="empty-state-title">{title}</h4>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && (
        <button
          className="btn btn-secondary"
          onClick={action.onClick}
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          {ActionIcon && <ActionIcon size={14} aria-hidden="true" />}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
};
