'use client';

import React, { useId, useRef, useEffect, useCallback } from 'react';
import { MediaPlayButton } from 'media-chrome/react';
import type { MediaPlayButton as MediaPlayButtonElement } from 'media-chrome';

export interface PlayPauseButtonProps {
  isPlaying: boolean;
  onToggle: () => void;
  playLabel?: string;
  pauseLabel?: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
}

export function PlayPauseButton({
  isPlaying,
  onToggle,
  playLabel = 'Play',
  pauseLabel = 'Pause',
  showLabel = false,
  disabled = false,
  title,
}: PlayPauseButtonProps) {
  const instanceId = useId().replace(/:/g, '-');
  const btnRef = useRef<MediaPlayButtonElement | null>(null);

  const computedTitle = title || (isPlaying ? pauseLabel : playLabel);
  const currentLabel = isPlaying ? pauseLabel : playLabel;

  // Sync isPlaying state to MediaPlayButton web component
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    el.mediaPaused = !isPlaying;
    if (!isPlaying) {
      el.setAttribute('mediapaused', '');
    } else {
      el.removeAttribute('mediapaused');
    }
  }, [isPlaying]);

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
      <MediaPlayButton
        ref={btnRef}
        disabled={disabled}
        onClick={handleClick}
        title={computedTitle}
        mediaController={`none-${instanceId}`}
        mediaPaused={!isPlaying}
        className="bg-transparent hover:bg-zinc-900 cursor-pointer  transition-colors"
      />

      {showLabel && (
        <span
          onClick={handleClick}
          className="text-xs font-medium cursor-pointer select-none"
        >
          {currentLabel}
        </span>
      )}
    </div>
  );
}

export default PlayPauseButton;




