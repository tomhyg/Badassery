import React from 'react';

const COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-pink-500',
];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export const InitialsAvatar: React.FC<InitialsAvatarProps> = ({ name, src, size = 'md', className = '' }) => {
  const sizeClass = sizeMap[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${getColor(name)} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}>
      {getInitials(name)}
    </div>
  );
};
