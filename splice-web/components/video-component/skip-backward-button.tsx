'use client';

import React, { useId, useRef, useCallback } from 'react';
import { MediaSeekBackwardButton } from 'media-chrome/react';
import type { MediaSeekBackwardButton as MediaSeekBackwardButtonElement } from 'media-chrome';

export interface SkipBackwardButtonProps {
  onSeekStart: () => void;
  title?: string;
  disabled?: boolean;
  seekOffset?: number;
}

export function SkipBackwardButton({
  onSeekStart,
  title = 'Jump to Start',
  disabled = false,
  seekOffset = 5,
}: SkipBackwardButtonProps) {
  const instanceId = useId().replace(/:/g, '-');
  const btnRef = useRef<MediaSeekBackwardButtonElement | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement | HTMLElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onSeekStart();
      }
    },
    [disabled, onSeekStart]
  );

  return (
    <MediaSeekBackwardButton
      ref={btnRef}
      disabled={disabled}
      onClick={handleClick}
      title={title}
      mediaController={`none-${instanceId}`}
      seekOffset={seekOffset}
      className="bg-transparent hover:bg-zinc-900 cursor-pointer  transition-colors"
    />
  );

}

export default SkipBackwardButton;




