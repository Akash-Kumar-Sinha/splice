'use client';

import React, { useRef, useEffect } from 'react';
import { MediaTimeDisplay } from 'media-chrome/react';
import type { MediaTimeDisplay as MediaTimeDisplayElement } from 'media-chrome';

export interface TimeDisplayProps {
  currentTime: number;
  duration?: number;
  showDuration?: boolean;
  remaining?: boolean;
}

export function TimeDisplay({
  currentTime,
  duration,
  showDuration = true,
  remaining = false,
}: TimeDisplayProps) {
  const displayRef = useRef<MediaTimeDisplayElement | null>(null);

  const safeDuration = typeof duration !== 'undefined' ? Math.max(0.1, duration) : undefined;
  const displayTime = Math.max(0, currentTime || 0);

  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;

    el.mediaCurrentTime = displayTime;
    el.setAttribute('mediacurrenttime', String(displayTime));

    if (typeof safeDuration !== 'undefined') {
      el.mediaDuration = safeDuration;
      el.setAttribute('mediaduration', String(safeDuration));
    }
  }, [displayTime, safeDuration]);

  return (
    <MediaTimeDisplay
      ref={displayRef}
      showDuration={showDuration}
      remaining={remaining}
      mediaCurrentTime={displayTime}
      mediaDuration={safeDuration}
      className="bg-transparent hover:bg-zinc-900  transition-colors tabular-nums select-none p-1"
    />
  );


}

export default TimeDisplay;


