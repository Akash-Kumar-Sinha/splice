'use client';

import React, { useCallback } from 'react';

export interface VolumeRangeProps {
  volume: number; // 0 to 1
  onVolumeChange: (volume: number) => void;
  isMuted?: boolean;
  disabled?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export function VolumeRange({
  volume,
  onVolumeChange,
  isMuted = false,
  disabled = false,
  showPercentage = false,
  className = '',
}: VolumeRangeProps) {
  const safeVolume = Math.min(1, Math.max(0, volume || 0));
  const effectiveVolume = isMuted ? 0 : safeVolume;
  const percent = Math.round(effectiveVolume * 100);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        onVolumeChange(Math.min(1, Math.max(0, val)));
      }
    },
    [onVolumeChange]
  );

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className="group relative w-16 sm:w-20 h-5 flex items-center cursor-pointer">
        {/* Native Range Input */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveVolume}
          disabled={disabled}
          onChange={handleChange}
          aria-label="Volume control"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="w-full h-1.5 bg-muted/60 rounded-full appearance-none cursor-pointer accent-primary border border-border/40 focus:outline-none"
        />
      </div>

      {showPercentage && (
        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
          {percent}%
        </span>
      )}
    </div>
  );
}

export default VolumeRange;
