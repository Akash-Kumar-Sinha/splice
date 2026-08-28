'use client';

import React, { useCallback } from 'react';
import { IconPlayerSkipForward } from '@tabler/icons-react';

export interface SkipForwardButtonProps {
  onSeekEnd?: () => void;
  onSeekForward?: (offset?: number) => void;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  seekOffset?: number;
  className?: string;
}

export function SkipForwardButton({
  onSeekEnd,
  onSeekForward,
  onClick,
  title = 'Step forward 5s (or jump to end)',
  disabled = false,
  seekOffset = 5,
  className = '',
}: SkipForwardButtonProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onClick) {
        onClick();
      } else if (onSeekForward) {
        onSeekForward(seekOffset);
      } else if (onSeekEnd) {
        onSeekEnd();
      }
    },
    [disabled, onClick, onSeekForward, onSeekEnd, seekOffset]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onSeekEnd) {
        onSeekEnd();
      }
    },
    [disabled, onSeekEnd]
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
      <IconPlayerSkipForward className="size-4" />
    </button>
  );
}

export default SkipForwardButton;
