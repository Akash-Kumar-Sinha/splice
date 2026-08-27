'use client';

import React, { useRef, useState } from 'react';
import {
  IconClock,
  IconMovie,
  IconTag,
  IconPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconVolume,
  IconVolumeOff,
  IconVideo,
  IconDownload,
  IconDeviceFloppy,
  IconGitBranch,
  IconGitCompare,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  VideoPlayer,
  VideoPlayerControlBar,
  VideoPlayerPlayButton,
  VideoPlayerTimeRange,
  VideoPlayerTimeDisplay,
  VideoPlayerMuteButton,
  VideoPlayerVolumeRange,
} from '@/components/ui/video_player';
import {
  SkipBackwardButton,
  PlayPauseButton,
  SkipForwardButton,
  TimelineSlider,
  TimeDisplay,
  VolumeRange,
  MuteButton,
} from '@/components/video-component';






import { Commit, Timeline, TimelineClip } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VersionDetailsCardProps {
  timeline: Timeline;
  selectedCommit: Commit | undefined;
  clips: TimelineClip[];
  activeHistoryClip: { clip: TimelineClip; offset: number; videoTime: number } | null;
  videoTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSetVideoTime: (time: number) => void;
  onSetVideoDuration: (dur: number) => void;
  onSetIsMuted: (v: boolean) => void;
  onSetVolume: (v: number) => void;
  onSetIsPlaying: (v: boolean) => void;
  onOpenInEditor: () => void;
  onOpenDiff: (commitId: string) => void;
  onSetExportTarget: (target: { id: string; message: string } | null) => void;
  onAddTag: (commitId: string, label: string) => void;
  onRemoveTag: (commitId: string, label: string) => void;
}

export default function VersionDetailsCard({
  timeline,
  selectedCommit,
  clips,
  activeHistoryClip,
  videoTime,
  isPlaying,
  isMuted,
  volume,
  videoRef,
  onTogglePlay,
  onSeek,
  onSetVideoTime,
  onSetVideoDuration,
  onSetIsMuted,
  onSetVolume,
  onSetIsPlaying,
  onOpenInEditor,
  onOpenDiff,
  onSetExportTarget,
  onAddTag,
  onRemoveTag,
}: VersionDetailsCardProps) {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsMessage, setSaveAsMessage] = useState('Alternate version cut');
  const [showAddTagForId, setShowAddTagForId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const activeMediaHash = timeline.media_refs[0] || selectedCommit?.media_refs[0] || null;

  const handleSaveAsNewVersion = async () => {
    if (!selectedCommit || !saveAsMessage.trim()) return;
    try {
      const res = await fetch(`${API_URL}/commits/save-as`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectedCommit.id,
          message: saveAsMessage.trim(),
        }),
      });
      if (res.ok) {
        setShowSaveAsModal(false);
      }
    } catch (err) {
      console.error('Error saving as:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <Card className="p-6 bg-card/50 border border-border flex flex-col gap-4 shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={timeline.is_head ? 'default' : 'secondary'} className="font-bold text-xs">
                {timeline.is_head ? 'ACTIVE PROJECT VERSION' : 'HISTORICAL VERSION PREVIEW'}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                <IconClock className="size-3 text-muted-foreground mr-1" />
                {timeline.total_duration.toFixed(1)}s
              </Badge>
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight mt-1">
              {timeline.message}
            </h2>
            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
              <span>Created by: <strong className="text-foreground">{timeline.author}</strong></span>
              <span>•</span>
              <span>Date: <strong className="text-foreground">{timeline.timestamp}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button variant="default" size="sm" onClick={onOpenInEditor} className="font-semibold shadow-sm">
              <IconMovie data-icon="inline-start" />
              Open & Edit This Version
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetExportTarget({ id: timeline.commit_id, message: timeline.message })}
              className="font-mono text-xs font-semibold gap-1.5 border-primary/40 text-foreground hover:bg-primary/10 shadow-sm"
              title="Export full-res ProRes / H.264 video of this version"
            >
              <IconDownload className="size-3.5 text-primary" />
              Export Full-Res Video
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowSaveAsModal(!showSaveAsModal)}>
              <IconGitBranch data-icon="inline-start" />
              Duplicate / Branch
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenDiff(timeline.commit_id)}>
              <IconGitCompare data-icon="inline-start" />
              Compare Diff
            </Button>

          </div>
        </div>

        {showSaveAsModal && (
          <div className="p-4 bg-background/90 border border-primary/40 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <IconGitBranch className="size-4 text-primary" />
                <span>Duplicate into a New Alternative Cut (Branch)</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowSaveAsModal(false)}>✕</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a parallel version starting from this exact checkpoint without overwriting your current active edit.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={saveAsMessage}
                onChange={(e) => setSaveAsMessage(e.target.value)}
                placeholder="Name for this new version cut..."
                className="text-xs"
              />
              <Button onClick={handleSaveAsNewVersion} size="sm" variant="default" className="shrink-0">
                <IconDeviceFloppy data-icon="inline-start" />
                Create Version
              </Button>
            </div>
          </div>
        )}

        <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border flex items-center justify-center shadow-lg my-1">
          {activeHistoryClip?.clip.media_hash || activeMediaHash ? (
            <VideoPlayer className="w-full h-full rounded-xl overflow-hidden border border-border">
              <video
                slot="media"
                ref={videoRef}
                src={`${API_URL}/media/${activeHistoryClip?.clip.media_hash || activeMediaHash}`}
                className="w-full h-full object-contain"
                playsInline
                preload="auto"
                suppressHydrationWarning
                onTimeUpdate={() => {
                  const vid = videoRef.current;
                  if (!vid || !isPlaying) return;
                  if (activeHistoryClip) {
                    const clipEnd = activeHistoryClip.clip.duration;
                    if (vid.currentTime >= clipEnd - 0.05) {
                      const currentIndex = clips.findIndex((c) => c.id === activeHistoryClip.clip.id);
                      if (currentIndex >= 0 && currentIndex < clips.length - 1) {
                        const nextClip = clips[currentIndex + 1];
                        onSetVideoTime(nextClip.start_time);
                        if (nextClip.media_hash === activeHistoryClip.clip.media_hash) {
                          vid.currentTime = 0;
                          vid.play().catch(console.warn);
                        }
                      } else {
                        onSetIsPlaying(false);
                        onSetVideoTime(timeline.total_duration);
                        vid.pause();
                      }
                    } else {
                      onSetVideoTime(activeHistoryClip.clip.start_time + vid.currentTime);
                    }
                  } else {
                    onSetVideoTime(vid.currentTime);
                  }
                }}
                onLoadedMetadata={(e) => {
                  const dur = (e.target as HTMLVideoElement).duration || 10;
                  onSetVideoDuration(dur);
                  if (videoRef.current && activeHistoryClip) {
                    videoRef.current.currentTime = activeHistoryClip.videoTime;
                    if (isPlaying) {
                      videoRef.current.play().catch(console.warn);
                    }
                  }
                }}
                onCanPlay={() => {
                  if (videoRef.current && isPlaying && videoRef.current.paused) {
                    if (activeHistoryClip && Math.abs(videoRef.current.currentTime - activeHistoryClip.videoTime) > 0.3) {
                      videoRef.current.currentTime = activeHistoryClip.videoTime;
                    }
                    videoRef.current.play().catch(console.warn);
                  }
                }}
              />

              <VideoPlayerControlBar>
                <VideoPlayerPlayButton />
                <VideoPlayerTimeRange />
                <VideoPlayerTimeDisplay showDuration />
                <VideoPlayerMuteButton />
                <VideoPlayerVolumeRange />
              </VideoPlayerControlBar>
            </VideoPlayer>
          ) : (
            <div className="text-muted-foreground text-xs flex flex-col items-center gap-2 p-8">
              <IconVideo className="size-8 text-muted-foreground/50" />
              <span>No media linked to this version</span>
            </div>
          )}

          <div className="absolute top-3 left-3 bg-background/80 border border-border backdrop-blur rounded-lg px-2.5 py-1 text-xs font-semibold pointer-events-none z-10">
            Preview: {timeline.message}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <SkipBackwardButton
                onSeekStart={() => onSeek(0)}
                title="Jump to Start"
              />
              <PlayPauseButton
                isPlaying={isPlaying}
                onToggle={onTogglePlay}
                playLabel="Play Video"
                pauseLabel="Pause"
              />
              <SkipForwardButton
                onSeekEnd={() => onSeek(timeline.total_duration)}
                title="Jump to  End"
              />
            </div>


            <div className="flex items-center gap-3">
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

              <p className="text-primary flex items-center ">
                <TimeDisplay
                  currentTime={videoTime}
                  duration={timeline.total_duration}
                  showDuration={true}
                />
              </p>
            </div>
          </div>

          <TimelineSlider
            currentTime={videoTime}
            duration={timeline.total_duration}
            onSeek={onSeek}
            showTimeDisplay={false}
            isPlaying={isPlaying}
          />
        </div>





        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
              <IconTag className="size-3.5" /> Version Tags:
            </span>
            {selectedCommit?.tags && selectedCommit.tags.length > 0 ? (
              selectedCommit.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs gap-1 bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium"
                >
                  {tag}
                  <button
                    onClick={() => onRemoveTag(timeline.commit_id, tag)}
                    className="text-amber-400 hover:text-red-400 font-bold ml-1"
                    title="Remove Tag"
                  >
                    ✕
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No tags assigned (e.g. Picture Lock)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              onClick={() => onAddTag(timeline.commit_id, 'Picture Lock')}
              className="text-[11px]"
            >
              + Picture Lock
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onAddTag(timeline.commit_id, "Director's Cut")}
              className="text-[11px]"
            >
              + Director&apos;s Cut
            </Button>

            {showAddTagForId === timeline.commit_id ? (
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Custom tag..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onAddTag(timeline.commit_id, newTagInput);
                    }
                  }}
                  className="h-6 w-28 text-xs px-2"
                />
                <Button variant="default" size="xs" onClick={() => onAddTag(timeline.commit_id, newTagInput)}>
                  Save
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setShowAddTagForId(null)}>✕</Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowAddTagForId(timeline.commit_id)}
                className="text-[11px]"
              >
                <IconPlus className="size-3" /> Custom Tag
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5 bg-card/40 border border-border flex flex-col gap-4">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <IconMovie className="size-4 text-primary" /> Track Segments in This Version
          </span>
          <span className="text-muted-foreground font-normal">
            {timeline.tracks.length} track(s)
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {timeline.tracks.map((track) => (
            <div key={track.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{track.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {track.track_type}
                </Badge>
                
              </div>
              <ScrollArea className="w-full pb-1" orientation="horizontal">
                <div className="h-14 bg-background border border-border rounded-xl p-2 relative flex gap-2 min-w-full items-center">
                  {track.clips.map((clip) => {
                    const isVideo = track.track_type === 'video';
                    return (
                      <div
                        key={clip.id}
                        className={cn(
                          'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] border',
                          isVideo
                            ? 'bg-primary/20 border-primary text-foreground'
                            : 'bg-secondary/40 border-border text-foreground'
                        )}
                      >
                        <div className="font-semibold truncate">{clip.name}</div>
                        <div className="text-[9px] text-muted-foreground font-mono">
                          {clip.duration.toFixed(1)}s
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </Card>

      <div className="border border-border/60 rounded-xl bg-card/20 p-3">
        <button
          onClick={() => setShowTechDetails(!showTechDetails)}
          className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground font-medium"
        >
          <span>Developer & Technical Details</span>
          {showTechDetails ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
        </button>

        {showTechDetails && (
          <div className="pt-3 mt-2 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="bg-background/60 p-2 rounded-lg border border-border">
              <div className="text-muted-foreground text-[9px] uppercase">Commit UUID</div>
              <div className="text-foreground truncate">{timeline.commit_id}</div>
            </div>
            <div className="bg-background/60 p-2 rounded-lg border border-border">
              <div className="text-muted-foreground text-[9px] uppercase">Timeline SHA-256</div>
              <div className="text-primary truncate">{timeline.timeline_hash}</div>
            </div>
            <div className="bg-background/60 p-2 rounded-lg border border-border">
              <div className="text-muted-foreground text-[9px] uppercase">Parent Checkpoint</div>
              <div className="text-foreground truncate">{timeline.parent_id || 'Root (None)'}</div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}
