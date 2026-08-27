'use client';

import React, { useId, useRef, useEffect, useCallback } from 'react';
import { MediaVolumeRange } from 'media-chrome/react';
import type { MediaVolumeRange as MediaVolumeRangeElement } from 'media-chrome';

export interface VolumeRangeProps {
  volume: number; // 0 to 1
  onVolumeChange: (volume: number) => void;
  isMuted?: boolean;
  disabled?: boolean;
  showPercentage?: boolean;
}

export function VolumeRange({
  volume,
  onVolumeChange,
  isMuted = false,
  disabled = false,
  showPercentage = false,
}: VolumeRangeProps) {
  const instanceId = useId().replace(/:/g, '-');
  const rangeRef = useRef<MediaVolumeRangeElement | null>(null);
  const isDraggingRef = useRef(false);

  const safeVolume = Math.min(1, Math.max(0, volume || 0));
  const effectiveVolume = isMuted ? 0 : safeVolume;

  // Sync state to MediaVolumeRange web component
  useEffect(() => {
    const el = rangeRef.current;
    if (!el) return;

    el.toggleAttribute('disabled', disabled);

    if (!isDraggingRef.current) {
      el.mediaVolume = effectiveVolume;
      el.mediaMuted = isMuted;
      el.setAttribute('mediavolume', String(effectiveVolume));
      if (isMuted) {
        el.setAttribute('mediamuted', '');
      } else {
        el.removeAttribute('mediamuted');
      }
    }
  }, [effectiveVolume, isMuted, disabled]);

  const handleSeekVolume = useCallback(
    (e: Event | React.SyntheticEvent<HTMLElement> | CustomEvent<number>) => {
      e.stopPropagation?.();
      const customDetail =
        'detail' in e && typeof (e as CustomEvent<number>).detail === 'number'
          ? (e as CustomEvent<number>).detail
          : undefined;

      const target = e.target as (EventTarget & { value?: string; mediaVolume?: number }) | null;
      const targetVal = target?.value ? parseFloat(target.value) : undefined;
      const mediaVol = target?.mediaVolume;

      const val = customDetail ?? targetVal ?? mediaVol ?? effectiveVolume;

      if (typeof val === 'number' && !isNaN(val)) {
        onVolumeChange(Math.min(1, Math.max(0, val)));
      }
    },
    [onVolumeChange, effectiveVolume]
  );

  useEffect(() => {
    const el = rangeRef.current;
    if (!el) return;

    const onVolReq = (e: Event) => handleSeekVolume(e as CustomEvent<number>);
    el.addEventListener('mediavolumerequest', onVolReq);
    return () => {
      el.removeEventListener('mediavolumerequest', onVolReq);
    };
  }, [handleSeekVolume]);

  return (
    <div className="inline-flex items-center gap-1.5">
      <MediaVolumeRange
        ref={rangeRef}
        onInput={handleSeekVolume}
        onChange={handleSeekVolume}
        mediaController={`none-${instanceId}`}
        mediaVolume={effectiveVolume}
        mediaMuted={isMuted}
        className="w-20 cursor-pointer bg-transparent hover:bg-zinc-900 transition-colors"
      />

      {showPercentage && (
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          {Math.round(effectiveVolume * 100)}%
        </span>
      )}
    </div>
  );
}

export default VolumeRange;



