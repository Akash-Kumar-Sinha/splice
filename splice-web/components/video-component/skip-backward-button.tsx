'use client';

import React, { useCallback } from 'react';
import { IconPlayerSkipBack } from '@tabler/icons-react';

export interface SkipBackwardButtonProps {
  onSeekStart?: () => void;
  onSeekBackward?: (offset?: number) => void;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  seekOffset?: number;
  className?: string;
}

export function SkipBackwardButton({
  onSeekStart,
  onSeekBackward,
  onClick,
  title = 'Step backward 5s (or jump to start)',
  disabled = false,
  seekOffset = 5,
  className = '',
}: SkipBackwardButtonProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onClick) {
        onClick();
      } else if (onSeekBackward) {
        onSeekBackward(seekOffset);
      } else if (onSeekStart) {
        onSeekStart();
      }
    },
    [disabled, onClick, onSeekBackward, onSeekStart, seekOffset]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onSeekStart) {
        onSeekStart();
      }
    },
    [disabled, onSeekStart]
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={title}
      aria-label={title}
      className={`size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      <IconPlayerSkipBack className="size-4" />
    </button>
  );
}

export default SkipBackwardButton;
