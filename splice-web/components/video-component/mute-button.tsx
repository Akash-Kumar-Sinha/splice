'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { MediaMuteButton } from 'media-chrome/react';
import type { MediaMuteButton as MediaMuteButtonElement } from 'media-chrome';

export interface MuteButtonProps {
  isMuted: boolean;
  onToggleMute: () => void;
  volume?: number;
  disabled?: boolean;
  title?: string;
}

export function MuteButton({
  isMuted,
  onToggleMute,
  volume = 1,
  disabled = false,
  title,
}: MuteButtonProps) {
  const btnRef = useRef<MediaMuteButtonElement | null>(null);

  const computedTitle = title || (isMuted ? 'Unmute' : 'Mute');
  const volumeLevel: 'off' | 'low' | 'medium' | 'high' =
    isMuted || volume === 0 ? 'off' : volume < 0.5 ? 'low' : volume < 0.75 ? 'medium' : 'high';

  // Sync state to MediaMuteButton web component
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    el.mediaVolumeLevel = volumeLevel;
    el.setAttribute('mediavolumelevel', volumeLevel);
  }, [volumeLevel]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement | HTMLElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onToggleMute();
      }
    },
    [disabled, onToggleMute]
  );

  return (
    <MediaMuteButton
      ref={btnRef}
      disabled={disabled}
      onClick={handleClick}
      title={computedTitle}
      mediaVolumeLevel={volumeLevel}
      className="bg-transparent hover:bg-zinc-900 cursor-pointer transition-colors"
    />
  );
}

export default MuteButton;
