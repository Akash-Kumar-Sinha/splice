'use client';

import React from 'react';
import { PlayPauseButton } from './play-pause-button';
import { SkipBackwardButton } from './skip-backward-button';
import { SkipForwardButton } from './skip-forward-button';

export interface PlaybackControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  playLabel?: string;
  pauseLabel?: string;
  showLabels?: boolean;
  disabled?: boolean;
  startTitle?: string;
  endTitle?: string;
}

export function PlaybackControls({
  isPlaying,
  onTogglePlay,
  onSeekStart,
  onSeekEnd,
  playLabel = 'Play',
  pauseLabel = 'Pause',
  showLabels = false,
  disabled = false,
  startTitle = 'Jump to Start',
  endTitle = 'Jump to End',
}: PlaybackControlsProps) {
  return (
    <div className="inline-flex items-center gap-1">
      {onSeekStart && (
        <SkipBackwardButton
          onSeekStart={onSeekStart}
          title={startTitle}
          disabled={disabled}
        />
      )}

      <PlayPauseButton
        isPlaying={isPlaying}
        onToggle={onTogglePlay}
        playLabel={playLabel}
        pauseLabel={pauseLabel}
        showLabel={showLabels}
        disabled={disabled}
      />

      {onSeekEnd && (
        <SkipForwardButton
          onSeekEnd={onSeekEnd}
          title={endTitle}
          disabled={disabled}
        />
      )}
    </div>
  );
}

export default PlaybackControls;


