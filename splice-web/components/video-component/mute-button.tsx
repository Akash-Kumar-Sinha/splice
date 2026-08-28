'use client';

import React, { useCallback } from 'react';
import { IconVolume, IconVolume2, IconVolume3, IconVolumeOff } from '@tabler/icons-react';

export interface MuteButtonProps {
  isMuted: boolean;
  onToggleMute: () => void;
  volume?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function MuteButton({
  isMuted,
  onToggleMute,
  volume = 1,
  disabled = false,
  title,
  className = '',
}: MuteButtonProps) {
  const computedTitle = title || (isMuted ? 'Unmute' : 'Mute');

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onToggleMute();
      }
    },
    [disabled, onToggleMute]
  );

  const renderIcon = () => {
    if (isMuted || volume === 0) return <IconVolumeOff className="size-4 text-muted-foreground" />;
    if (volume < 0.35) return <IconVolume3 className="size-4" />;
    if (volume < 0.75) return <IconVolume2 className="size-4" />;
    return <IconVolume className="size-4" />;
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={computedTitle}
      aria-label={computedTitle}
      className={`size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {renderIcon()}
    </button>
  );
}

export default MuteButton;
