import React from 'react';
import { Search, X } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
  badgeVariant?: string;
}

interface FilterBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (filterId: string) => void;
  actions?: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filterOptions = [],
  activeFilter,
  onFilterChange,
  actions,
  className = '',
}) => {
  return (
    <div className={`filter-bar ${className}`} role="search">
      {onSearchChange && (
        <div className="search-input-wrapper">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: 8,
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {filterOptions.length > 0 && onFilterChange && (
        <div className="filter-pill-group" role="tablist" aria-label="Filters">
          {filterOptions.map((opt) => {
            const isActive = activeFilter === opt.id;
            return (
              <button
                key={opt.id}
                role="tab"
                aria-selected={isActive}
                className={`filter-pill ${isActive ? 'active' : ''}`}
                onClick={() => onFilterChange(opt.id)}
              >
                <span>{opt.label}</span>
                {opt.count !== undefined && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 10,
                      background: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                      color: isActive ? '#060913' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    {opt.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {actions && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
        </div>
      )}
    </div>
  );
};
