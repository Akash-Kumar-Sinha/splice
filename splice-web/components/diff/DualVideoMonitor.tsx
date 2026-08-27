"use client";

import React from "react";
import { IconVideo, IconVolumeOff } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/ui/video_player";
import { Commit, TimelineClip, TimelineDiff } from "@/lib/types";
import { API_URL } from "@/lib/api";
import DiffTimelineTrack from "./DiffTimelineTrack";

interface DualVideoMonitorProps {
  baseCommit: Commit | undefined;
  targetCommit: Commit | undefined;
  mediaHashA: string | null;
  mediaHashB: string | null;
  clipsA: TimelineClip[];
  clipsB: TimelineClip[];
  durationA: number;
  durationB: number;
  timeA: number;
  timeB: number;
  activeClipA: { clip: TimelineClip; videoTime: number } | null;
  activeClipB: { clip: TimelineClip; videoTime: number } | null;
  audioFocus: "a" | "b" | "both";
  isPlaying: boolean;
  videoRefA: React.RefObject<HTMLVideoElement | null>;
  videoRefB: React.RefObject<HTMLVideoElement | null>;
  diff: TimelineDiff | null;
  onSetAudioFocus: (mode: "a" | "b" | "both") => void;
  onSeekA: (time: number) => void;
  onSeekB: (time: number) => void;
}

export default function DualVideoMonitor({
  baseCommit,
  targetCommit,
  mediaHashA,
  mediaHashB,
  clipsA,
  clipsB,
  durationA,
  durationB,
  timeA,
  timeB,
  activeClipA,
  activeClipB,
  audioFocus,
  isPlaying,
  videoRefA,
  videoRefB,
  diff,
  onSetAudioFocus,
  onSeekA,
  onSeekB,
}: DualVideoMonitorProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Audio toggle bar */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium">
          {clipsA.length} vs {clipsB.length} clips
        </span>
        <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-lg">
          <span className="text-[9px] text-muted-foreground px-1.5">Audio</span>
          {(["a", "b", "both"] as const).map((mode) => (
            <Button
              key={mode}
              variant={audioFocus === mode ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onSetAudioFocus(mode)}
              className="text-[9px] h-5 px-2"
            >
              {mode === "both" ? "Both" : mode.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Side-by-side videos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Version A */}
        <div className="flex flex-col gap-2">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            {mediaHashA ? (
              <VideoPlayer className="w-full h-full">
                <video
                  slot="media"
                  ref={videoRefA}
                  src={`${API_URL}/media/${mediaHashA}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  muted={audioFocus === "b"}
                  suppressHydrationWarning
                  onLoadedMetadata={() => {
                    if (videoRefA.current && activeClipA) {
                      videoRefA.current.currentTime = activeClipA.videoTime;
                      if (isPlaying) videoRefA.current.play().catch(console.warn);
                    }
                  }}
                  onCanPlay={() => {
                    if (videoRefA.current && isPlaying && videoRefA.current.paused) {
                      if (activeClipA && Math.abs(videoRefA.current.currentTime - activeClipA.videoTime) > 0.3) {
                        videoRefA.current.currentTime = activeClipA.videoTime;
                      }
                      videoRefA.current.play().catch(console.warn);
                    }
                  }}
                />
              </VideoPlayer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1.5">
                <IconVideo className="size-6" />
                <span className="text-[10px]">No media</span>
              </div>
            )}

            {/* Label */}
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5 text-[9px] text-white/80 font-medium">
              A
            </div>

            {/* Mute indicator */}
            {audioFocus === "b" && (
              <button
                onClick={() => onSetAudioFocus("a")}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-amber-300/80 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[9px] cursor-pointer transition-colors"
              >
                <IconVolumeOff className="size-2.5" />
                Muted
              </button>
            )}
          </div>

          <DiffTimelineTrack
            label="A"
            clips={clipsA}
            duration={durationA}
            currentTime={timeA}
            activeClipId={activeClipA?.clip.id || null}
            activeClipName={activeClipA?.clip.name || null}
            onSeek={onSeekA}
            variant="a"
            diff={diff}
          />
        </div>

        {/* Version B */}
        <div className="flex flex-col gap-2">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            {mediaHashB ? (
              <VideoPlayer className="w-full h-full">
                <video
                  slot="media"
                  ref={videoRefB}
                  src={`${API_URL}/media/${mediaHashB}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  muted={audioFocus === "a"}
                  suppressHydrationWarning
                  onLoadedMetadata={() => {
                    if (videoRefB.current && activeClipB) {
                      videoRefB.current.currentTime = activeClipB.videoTime;
                      if (isPlaying) videoRefB.current.play().catch(console.warn);
                    }
                  }}
                  onCanPlay={() => {
                    if (videoRefB.current && isPlaying && videoRefB.current.paused) {
                      if (activeClipB && Math.abs(videoRefB.current.currentTime - activeClipB.videoTime) > 0.3) {
                        videoRefB.current.currentTime = activeClipB.videoTime;
                      }
                      videoRefB.current.play().catch(console.warn);
                    }
                  }}
                />
              </VideoPlayer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1.5">
                <IconVideo className="size-6" />
                <span className="text-[10px]">No media</span>
              </div>
            )}

            {/* Label */}
            <div className="absolute top-2 left-2 bg-primary/80 backdrop-blur-sm rounded-md px-2 py-0.5 text-[9px] text-white font-medium">
              B
            </div>

            {/* Mute indicator */}
            {audioFocus === "a" && (
              <button
                onClick={() => onSetAudioFocus("b")}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-amber-300/80 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[9px] cursor-pointer transition-colors"
              >
                <IconVolumeOff className="size-2.5" />
                Muted
              </button>
            )}
          </div>

          <DiffTimelineTrack
            label="B"
            clips={clipsB}
            duration={durationB}
            currentTime={timeB}
            activeClipId={activeClipB?.clip.id || null}
            activeClipName={activeClipB?.clip.name || null}
            onSeek={onSeekB}
            variant="b"
            diff={diff}
          />
        </div>
      </div>
    </div>
  );
}
