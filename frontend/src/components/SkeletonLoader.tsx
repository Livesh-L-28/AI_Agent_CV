import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'text' | 'title' | 'card' | 'row' | 'circular';
  count?: number;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'text',
  count = 1,
  width,
  height,
  className = '',
  style = {},
}) => {
  const elements = Array.from({ length: count });

  const getStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { ...style };
    if (width !== undefined) base.width = width;
    if (height !== undefined) base.height = height;

    if (variant === 'circular') {
      base.borderRadius = '50%';
      if (!base.width && !base.height) {
        base.width = 40;
        base.height = 40;
      }
    }
    return base;
  };

  const getVariantClass = () => {
    switch (variant) {
      case 'title':
        return 'skeleton-title';
      case 'card':
        return 'skeleton-card';
      case 'text':
        return 'skeleton-text';
      case 'row':
        return 'skeleton-text';
      default:
        return 'skeleton';
    }
  };

  return (
    <div aria-busy="true" aria-live="polite" className="skeleton-group">
      {elements.map((_, i) => (
        <div
          key={i}
          className={`skeleton ${getVariantClass()} ${className}`}
          style={getStyle()}
        />
      ))}
    </div>
  );
};
