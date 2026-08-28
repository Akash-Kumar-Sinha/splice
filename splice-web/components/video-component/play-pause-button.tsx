'use client';

import React, { useCallback } from 'react';
import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

export interface PlayPauseButtonProps {
  isPlaying: boolean;
  onToggle: () => void;
  playLabel?: string;
  pauseLabel?: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function PlayPauseButton({
  isPlaying,
  onToggle,
  playLabel = 'Play',
  pauseLabel = 'Pause',
  showLabel = false,
  disabled = false,
  title,
  className = '',
}: PlayPauseButtonProps) {
  const computedTitle = title || (isPlaying ? pauseLabel : playLabel);
  const currentLabel = isPlaying ? pauseLabel : playLabel;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement | HTMLElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onToggle();
      }
    },
    [disabled, onToggle]
  );

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        title={computedTitle}
        aria-label={computedTitle}
        className={`size-8 rounded-lg flex items-center justify-center text-foreground hover:bg-muted/60 active:scale-95 transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none ${className}`}
      >
        {isPlaying ? (
          <IconPlayerPause className="size-4" />
        ) : (
          <IconPlayerPlay className="size-4 ml-0.5" />
        )}
      </button>

      {showLabel && (
        <span
          onClick={handleClick}
          className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
        >
          {currentLabel}
        </span>
      )}
    </div>
  );
}

export default PlayPauseButton;
