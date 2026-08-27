'use client';

import React, { useId, useRef, useCallback } from 'react';
import { MediaSeekForwardButton } from 'media-chrome/react';
import type { MediaSeekForwardButton as MediaSeekForwardButtonElement } from 'media-chrome';

export interface SkipForwardButtonProps {
  onSeekEnd: () => void;
  title?: string;
  disabled?: boolean;
  seekOffset?: number;
}

export function SkipForwardButton({
  onSeekEnd,
  title = 'Jump to End',
  disabled = false,
  seekOffset = 5,
}: SkipForwardButtonProps) {
  const instanceId = useId().replace(/:/g, '-');
  const btnRef = useRef<MediaSeekForwardButtonElement | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement | HTMLElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onSeekEnd();
      }
    },
    [disabled, onSeekEnd]
  );

  return (
    <MediaSeekForwardButton
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

export default SkipForwardButton;




