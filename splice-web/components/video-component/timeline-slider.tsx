'use client';

import React, { useId, useRef, useEffect, useCallback } from 'react';
import { MediaTimeRange } from 'media-chrome/react';
import type { MediaTimeRange as MediaTimeRangeElement } from 'media-chrome';
import { TimeDisplay } from './time-display';

export interface TimelineSliderProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  step?: number;
  showTimeDisplay?: boolean;
  disabled?: boolean;
  isPlaying?: boolean;
}

export function TimelineSlider({
  currentTime,
  duration,
  onSeek,
  step = 0.05,
  showTimeDisplay = true,
  disabled = false,
  isPlaying = false,
}: TimelineSliderProps) {
  const instanceId = useId().replace(/:/g, '-');
  const rangeRef = useRef<MediaTimeRangeElement | null>(null);
  const isDraggingRef = useRef(false);

  const safeDuration = Math.max(0.1, duration || 1);
  const displayTime = Math.min(Math.max(0, currentTime || 0), safeDuration);

  // Sync state to MediaTimeRange web component
  useEffect(() => {
    const el = rangeRef.current;
    if (!el) return;

    el.toggleAttribute('disabled', disabled);

    // Setting mediaPaused to true stops MediaTimeRange's internal 60fps RangeAnimation auto-sliding loop
    el.mediaPaused = !isPlaying;
    if (!isPlaying) {
      el.setAttribute('mediapaused', '');
    } else {
      el.removeAttribute('mediapaused');
    }

    if (!isDraggingRef.current) {
      el.mediaCurrentTime = displayTime;
      el.mediaDuration = safeDuration;
      el.setAttribute('mediacurrenttime', String(displayTime));
      el.setAttribute('mediaduration', String(safeDuration));
      el.updateBar();
    }
  }, [displayTime, safeDuration, disabled, isPlaying]);

  const handleSeek = useCallback(
    (e: Event | React.SyntheticEvent<HTMLElement> | CustomEvent<number>) => {
      e.stopPropagation?.();
      const customDetail =
        'detail' in e && typeof (e as CustomEvent<number>).detail === 'number'
          ? (e as CustomEvent<number>).detail
          : undefined;

      const target = e.target as (EventTarget & { value?: string; mediaCurrentTime?: number }) | null;
      const targetVal = target?.value ? parseFloat(target.value) : undefined;
      const mediaCur = target?.mediaCurrentTime;

      const val = customDetail ?? targetVal ?? mediaCur ?? displayTime;

      if (typeof val === 'number' && !isNaN(val)) {
        onSeek(Math.min(safeDuration, Math.max(0, val)));
      }
    },
    [onSeek, safeDuration, displayTime]
  );

  useEffect(() => {
    const el = rangeRef.current;
    if (!el) return;

    el.setAttribute('step', String(step));

    const onSeekReq = (e: Event) => handleSeek(e as CustomEvent<number>);
    el.addEventListener('mediaseekrequest', onSeekReq);
    return () => {
      el.removeEventListener('mediaseekrequest', onSeekReq);
    };
  }, [handleSeek, step]);

  return (
    <div className="flex items-center gap-2 w-full select-none">
      <div
        className="flex-1 min-w-0 flex items-center"
        onMouseDown={() => {
          isDraggingRef.current = true;
        }}
        onMouseUp={() => {
          isDraggingRef.current = false;
        }}
        onTouchStart={() => {
          isDraggingRef.current = true;
        }}
        onTouchEnd={() => {
          isDraggingRef.current = false;
        }}
      >
        <MediaTimeRange
          ref={rangeRef}
          onInput={handleSeek}
          onChange={handleSeek}
          mediaController={`none-${instanceId}`}
          mediaCurrentTime={displayTime}
          mediaDuration={safeDuration}
          mediaPaused={!isPlaying}
          style={{
            ['--media-range-track-transition' as string]: 'none',
            ['--media-range-thumb-transition' as string]: 'none',
          }}
          className="w-full flex-1 cursor-pointer bg-transparent hover:bg-zinc-900 transition-colors"
        />
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







