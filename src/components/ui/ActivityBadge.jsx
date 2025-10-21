import React from 'react';
import { Badge } from '@/components/ui/badge';

const DEFAULT_COLOR = '#0F766E';
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizeColor(color) {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return DEFAULT_COLOR;
}

function buildOutlineBackground(color) {
  if (HEX_COLOR_PATTERN.test(color)) {
    return `${color}20`;
  }
  return 'transparent';
}

export default function ActivityBadge({ label, color, variant = 'outline', className = '', title, ...badgeProps }) {
  const normalizedColor = normalizeColor(color);
  const badgeVariant = variant === 'solid' ? 'default' : 'outline';
  const isSolid = variant === 'solid';
  const backgroundColor = isSolid ? normalizedColor : buildOutlineBackground(normalizedColor);
  const textColor = isSolid ? '#FFFFFF' : normalizedColor;
  const combinedClassName = `w-fit max-w-full text-xs font-medium ${className}`.trim();

  return (
    <Badge
      variant={badgeVariant}
      className={combinedClassName}
      style={{
        backgroundColor,
        color: textColor,
        borderColor: normalizedColor,
      }}
      title={title || label}
      {...badgeProps}
    >
      <span className="block max-w-full truncate">{label}</span>
    </Badge>
  );
}
