"use client";

import React from "react";
import {
  IconVideo,
  IconPlayerPlay,
  IconPlayerPause,
  IconScissors,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PlayPauseButton,
  SkipBackwardButton,
  SkipForwardButton,
  TimelineSlider,
  TimeDisplay,
  VolumeRange,
  MuteButton,
} from "@/components/video-component";

import { API_URL } from "@/lib/api";
import { Clip } from "@/lib/editor-state";
import { cn, safePlay } from "@/lib/utils";




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
    <Card className="flex flex-col bg-card/50 border border-border rounded-2xl shadow-sm overflow-hidden">
      <div
        className="relative aspect-video bg-black flex items-center justify-center border-b border-border cursor-pointer group"
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
                  safePlay(videoRef.current);
                }
              }}

            />

            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity pointer-events-none",
                isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100",
              )}
            >
              <div className="size-14 rounded-full bg-background/80 backdrop-blur-md border border-border flex items-center justify-center text-foreground shadow-xl">
                {isPlaying ? (
                  <IconPlayerPause className="size-6" />
                ) : (
                  <IconPlayerPlay className="size-6 ml-0.5" />
                )}
              </div>
            </div>

          </>
        ) : (
          <div className="text-muted-foreground text-xs text-center p-8 flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <IconVideo className="size-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-foreground font-medium text-sm mb-1">
                No media loaded
              </p>
              <p className="text-muted-foreground">
                Import a video to begin editing
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <TimelineSlider
            currentTime={playhead}
            duration={totalDuration}
            onSeek={onSeek}
            showTimeDisplay={false}
            isPlaying={isPlaying}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
            <TimeDisplay
              currentTime={playhead}
              duration={totalDuration}
              showDuration={false}
            />
            <TimeDisplay
              currentTime={totalDuration}
              duration={totalDuration}
              showDuration={false}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 px-0.5 py-2">
            <SkipBackwardButton
              onClick={() => onSeek(Math.max(0, playhead - 5))}
              onSeekStart={() => onSeek(0)}
              title="Step backward 5s (or double click to jump to start)"
            />

            <PlayPauseButton
              isPlaying={isPlaying}
              onToggle={onTogglePlay}
              playLabel="Play"
              pauseLabel="Pause"
            />

            <SkipForwardButton
              onClick={() => onSeek(Math.min(totalDuration, playhead + 5))}
              onSeekEnd={() => onSeek(totalDuration)}
              title="Step forward 5s (or double click to jump to end)"
            />
          </div>


          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onSplitAtPlayhead}
              title="Split clip at playhead (S)"
              className="h-7 px-2.5 gap-1.5 text-xs"
            >
              <IconScissors className="size-3 text-primary" /> Split
            </Button>

            <div className="w-px h-4 bg-border mx-0.5" />

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
