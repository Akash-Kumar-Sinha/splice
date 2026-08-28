'use client';

import React from 'react';

export interface TimeDisplayProps {
  currentTime: number;
  duration?: number;
  showDuration?: boolean;
  remaining?: boolean;
  className?: string;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds || 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const tenths = Math.floor((s % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatSecondsStandard(seconds: number): string {
  const s = Math.max(0, seconds || 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function TimeDisplay({
  currentTime,
  duration,
  showDuration = true,
  remaining = false,
  className = '',
}: TimeDisplayProps) {
  const safeDuration = typeof duration !== 'undefined' ? Math.max(0, duration) : undefined;
  const displayTime = Math.max(0, currentTime || 0);

  const curSec = remaining && safeDuration !== undefined
    ? Math.max(0, safeDuration - displayTime)
    : displayTime;

  const formattedCurrent = formatSecondsStandard(curSec);

  return (
    <span className={`text-[11px] font-mono text-muted-foreground tabular-nums select-none px-1 py-0.5 ${className}`}>
      {remaining ? `-${formattedCurrent}` : formattedCurrent}
      {showDuration && safeDuration !== undefined && ` / ${formatSecondsStandard(safeDuration)}`}
    </span>
  );
}

export default TimeDisplay;
