'use client';

import React, { useRef, useState, useCallback, useId } from 'react';

import { TimeDisplay, formatTime } from './time-display';



export interface TimelineSliderProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  step?: number;
  showTimeDisplay?: boolean;
  disabled?: boolean;
  isPlaying?: boolean;
  className?: string;
}

export function TimelineSlider({
  currentTime,
  duration,
  onSeek,
  step = 0.05,
  showTimeDisplay = true,
  disabled = false,
  isPlaying: _isPlaying = false,
  className = '',

}: TimelineSliderProps) {
  const instanceId = useId().replace(/:/g, '-');
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const safeDuration = Math.max(0.1, duration || 1);
  const displayTime = Math.min(Math.max(0, currentTime || 0), safeDuration);
  const progressPercent = Math.min(100, Math.max(0, (displayTime / safeDuration) * 100));

  const calculateTimeFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return displayTime;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = offsetX / rect.width;
      return ratio * safeDuration;
    },
    [safeDuration, displayTime]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      const targetTime = calculateTimeFromPointer(e.clientX);
      onSeek(targetTime);
    },
    [disabled, calculateTimeFromPointer, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (track) {
        const rect = track.getBoundingClientRect();
        if (rect.width > 0) {
          const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
          setHoverPosition(offsetX / rect.width);
        }
      }

      if (isDragging && !disabled) {
        const targetTime = calculateTimeFromPointer(e.clientX);
        onSeek(targetTime);
      }
    },
    [isDragging, disabled, calculateTimeFromPointer, onSeek]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // pointer may already be released
        }
        setIsDragging(false);
      }
    },
    [isDragging]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setIsDragging(false);
      }
    },
    [isDragging]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSeek(Math.max(0, displayTime - (e.shiftKey ? 1.0 : step * 5)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSeek(Math.min(safeDuration, displayTime + (e.shiftKey ? 1.0 : step * 5)));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onSeek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onSeek(safeDuration);
      }
    },
    [disabled, displayTime, safeDuration, step, onSeek]
  );

  const hoverTime = hoverPosition !== null ? hoverPosition * safeDuration : 0;

  return (
    <div className={`flex items-center gap-2 w-full select-none ${className}`}>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoverPosition(null);
        }}
        className={`group relative flex-1 min-w-0 h-7 flex items-center cursor-pointer ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {/* Invisible native input for accessibility & keyboard navigation */}
        <input
          id={`slider-${instanceId}`}
          type="range"
          min={0}
          max={safeDuration}
          step={step}
          value={displayTime}
          disabled={disabled}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onSeek(val);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Timeline position"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={displayTime}
          className="sr-only"
        />

        {/* Background Track */}
        <div className="relative w-full h-1.5 group-hover:h-2.5 bg-muted/60 rounded-full overflow-hidden transition-all duration-150 border border-border/40">
          {/* Hover preview indicator */}
          {isHovered && hoverPosition !== null && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-primary/20 pointer-events-none transition-all duration-75"
              style={{ width: `${hoverPosition * 100}%` }}
            />
          )}

          {/* Active progress fill */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-primary rounded-full transition-all duration-75 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Scrub Handle / Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary border-2 border-background shadow-md pointer-events-none transition-transform duration-75 ${
            isDragging || isHovered
              ? 'size-4 scale-110 shadow-primary/30 shadow-lg'
              : 'size-3 scale-100 opacity-90'
          }`}
          style={{ left: `${progressPercent}%` }}
        />

        {/* Hover timestamp popup */}
        {isHovered && hoverPosition !== null && !isDragging && (
          <div
            className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-popover/90 backdrop-blur-md border border-border text-[10px] font-mono text-popover-foreground pointer-events-none shadow-md"
            style={{ left: `${hoverPosition * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {showTimeDisplay && (
        <TimeDisplay
          currentTime={displayTime}
          duration={safeDuration}
          showDuration={true}
        />
      )}
    </div>
  );
}

export const TimelineTimeRange = TimelineSlider;
export type TimelineTimeRangeProps = TimelineSliderProps;

export default TimelineSlider;
