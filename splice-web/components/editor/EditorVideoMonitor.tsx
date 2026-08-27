'use client';

import React from 'react';
import {
  IconMovie,
  IconVideo,
  IconPlayerPlay,
  IconPlayerPause,
  IconVolume,
  IconVolumeOff,
  IconScissors,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  PlayPauseButton,
  SkipBackwardButton,
  SkipForwardButton,
  TimelineSlider,
  TimeDisplay,
  VolumeRange,
  MuteButton,
} from '@/components/video-component';

import { API_URL, formatTimestamp } from '@/lib/api';
import { Clip } from '@/lib/editor-state';
import { cn } from '@/lib/utils';


interface EditorVideoMonitorProps {
  activeClipInfo: { clip: Clip; offset: number; videoTime: number } | null;
  playhead: number;
  totalDuration: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSetIsMuted: (v: boolean) => void;
  onSetVolume: (v: number) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onSplitAtPlayhead: () => void;
}

export default function EditorVideoMonitor({
  activeClipInfo,
  playhead,
  totalDuration,
  isPlaying,
  isMuted,
  volume,
  videoRef,
  onTogglePlay,
  onSeek,
  onSetIsMuted,
  onSetVolume,
  onTimeUpdate,
  onLoadedMetadata,
  onSplitAtPlayhead,
}: EditorVideoMonitorProps) {
  return (
    <Card className="flex flex-col p-4 bg-card/50 border border-border rounded-2xl shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-border text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <IconMovie className="size-3.5 text-primary" /> Video Monitor Preview
          </span>
          {activeClipInfo && (
            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
              {activeClipInfo.clip.name}
            </Badge>
          )}
        </div>
        <Badge variant="secondary" className="font-mono text-[11px] flex items-center gap-1">
          <TimeDisplay
            currentTime={playhead}
            duration={totalDuration}
            showDuration={true}
          />
        </Badge>

      </div>

      <div
        className="relative aspect-video bg-black rounded-xl overflow-hidden my-3 flex items-center justify-center border border-border group cursor-pointer"
        onClick={onTogglePlay}
      >
        {activeClipInfo ? (
          <>
            <video
              ref={videoRef}
              src={`${API_URL}/media/${activeClipInfo.clip.media}`}
              className="w-full h-full object-contain select-none"
              playsInline
              preload="auto"
              suppressHydrationWarning
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onCanPlay={() => {
                if (videoRef.current && isPlaying && videoRef.current.paused) {
                  if (activeClipInfo) {
                    videoRef.current.currentTime = activeClipInfo.videoTime;
                  }
                  videoRef.current.play().catch(console.warn);
                }
              }}
            />

            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity pointer-events-none",
                isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
              )}
            >
              <div className="size-12 rounded-full bg-background/80 backdrop-blur-md border border-border flex items-center justify-center text-foreground shadow-lg">
                {isPlaying ? <IconPlayerPause className="size-5" /> : <IconPlayerPlay className="size-5 ml-0.5" />}
              </div>
            </div>
            <div className="absolute top-2.5 left-2.5 bg-background/85 border border-border/80 rounded-lg px-2.5 py-1 text-[10px] font-mono text-foreground backdrop-blur-md pointer-events-none z-10 flex items-center gap-1 shadow-sm">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span className="truncate max-w-[180px]">
                {activeClipInfo.clip.name} ({activeClipInfo.offset.toFixed(1)}s)
              </span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground font-mono text-xs text-center p-6 flex flex-col items-center gap-2">
            <IconVideo className="size-8 text-muted-foreground/50" />
            No media loaded on timeline.
            <br />
            Upload a video to begin editing.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-1">
        <div className="flex flex-col gap-1">
          <TimelineSlider
            currentTime={playhead}
            duration={totalDuration}
            onSeek={onSeek}
            showTimeDisplay={false}
            isPlaying={isPlaying}
          />

          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
            <TimeDisplay currentTime={playhead} duration={totalDuration} showDuration={false} />
            <TimeDisplay currentTime={totalDuration} duration={totalDuration} showDuration={false} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <SkipBackwardButton
              onSeekStart={() => onSeek(0)}
              title="Jump to Start"
            />
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => onSeek(playhead - 5)}
              title="Step 5s Back"
              className="size-7 font-mono text-[10px]"
            >
              -5s
            </Button>
            <PlayPauseButton
              isPlaying={isPlaying}
              onToggle={onTogglePlay}
              playLabel="Play"
              pauseLabel="Pause"
            />
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => onSeek(playhead + 5)}
              title="Step 5s Forward"
              className="size-7 font-mono text-[10px]"
            >
              +5s
            </Button>
            <SkipForwardButton
              onSeekEnd={() => onSeek(totalDuration)}
              title="Jump to End"
            />


            <Separator orientation="vertical" className="h-5 mx-1" />

            <Button
              variant="secondary"
              size="sm"
              onClick={onSplitAtPlayhead}
              title="Split clip at playhead (S)"
              className="font-mono text-xs h-7 px-2.5 gap-1.5"
            >
              <IconScissors className="size-3 text-primary" />
              Split (S)
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <MuteButton
              isMuted={isMuted}
              volume={volume}
              onToggleMute={() => onSetIsMuted(!isMuted)}
            />
            <VolumeRange
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={(newVol) => {
                onSetVolume(newVol);
                if (isMuted && newVol > 0) onSetIsMuted(false);
              }}
            />
          </div>
        </div>
      </div>

    </Card>
  );
}

