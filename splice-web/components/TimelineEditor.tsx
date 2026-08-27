'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  IconUpload,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconDeviceFloppy,
  IconTrash,
  IconMovie,
  IconClock,
  IconVideo,
  IconGripVertical,
  IconVolume,
  IconVolumeOff,
  IconZoomIn,
  IconScissors,
  IconSparkles,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Clip {
  id: string;
  media: string; // MediaHash hex
  in_point: number; // seconds
  out_point: number; // seconds
  position: number; // seconds start on track
  name: string;
  original_duration: number;
}

export interface Track {
  id: string;
  clips: Clip[];
}

export interface EditorState {
  tracks: Track[];
}

// INFO: Recalculates clip positions on the track sequentially
export function recalculatePositions(clips: Clip[]): Clip[] {
  let currentPos = 0;
  return clips.map((c) => {
    const duration = Math.max(0.1, c.out_point - c.in_point);
    const updated = { ...c, position: currentPos };
    currentPos += duration;
    return updated;
  });
}

// CRITICAL: Pure transform function: addClip returns a new EditorState
export function addClip(state: EditorState, clip: Clip, trackIndex = 0): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) {
    newTracks[trackIndex] = { id: `track-${trackIndex}`, clips: [] };
  }
  const clips = [...newTracks[trackIndex].clips, clip];
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

// CRITICAL: Pure transform function: removeClip returns a new EditorState
export function removeClip(state: EditorState, clipId: string, trackIndex = 0): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips.filter((c) => c.id !== clipId);
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

// CRITICAL: Pure transform function: moveClip reorders clips via native Drag and Drop
export function moveClip(
  state: EditorState,
  fromIndex: number,
  toIndex: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = [...newTracks[trackIndex].clips];
  const [moved] = clips.splice(fromIndex, 1);
  if (!moved) return state;
  clips.splice(toIndex, 0, moved);
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

// CRITICAL: Pure transform function: trimClip trims in_point or out_point
export function trimClip(
  state: EditorState,
  clipId: string,
  edge: 'in' | 'out',
  newTime: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips.map((c) => {
    if (c.id !== clipId) return c;
    const maxDur = c.original_duration || c.out_point;
    if (edge === 'in') {
      const clampedIn = Math.min(Math.max(0, newTime), c.out_point - 0.1);
      return { ...c, in_point: clampedIn };
    } else {
      const clampedOut = Math.max(c.in_point + 0.1, Math.min(newTime, maxDur));
      return { ...c, out_point: clampedOut };
    }
  });
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

// CRITICAL: Pure transform function: splitClip splits a clip into two at splitTime
export function splitClip(
  state: EditorState,
  clipId: string,
  splitVideoTime: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips;
  const targetIndex = clips.findIndex((c) => c.id === clipId);
  if (targetIndex === -1) return state;

  const target = clips[targetIndex];
  if (splitVideoTime <= target.in_point + 0.1 || splitVideoTime >= target.out_point - 0.1) {
    return state;
  }

  const leftClip: Clip = {
    ...target,
    id: `clip-${Date.now()}-a`,
    name: `${target.name} (Part 1)`,
    out_point: splitVideoTime,
  };

  const rightClip: Clip = {
    ...target,
    id: `clip-${Date.now()}-b`,
    name: `${target.name} (Part 2)`,
    in_point: splitVideoTime,
  };

  const newClips = [...clips];
  newClips.splice(targetIndex, 1, leftClip, rightClip);

  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(newClips),
  };

  return { ...state, tracks: newTracks };
}

export function useUpload() {
  return async (file: File): Promise<{ hash: string; duration: number }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/media`, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`);
    }
    return res.json();
  };
}

interface TimelineEditorProps {
  headCommitId: string | null;
  loadedTimeline?: {
    commit_id: string;
    message: string;
    media_refs: string[];
    tracks?: {
      id: string;
      clips: {
        id: string;
        name: string;
        media_hash: string;
        duration: number;
        start_time?: number;
      }[];
    }[];
  } | null;
  onCommitSaved?: () => void;
}


export default function TimelineEditor({
  headCommitId,
  loadedTimeline,
  onCommitSaved,
}: TimelineEditorProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    tracks: [{ id: 'track-0', clips: [] }],
  });

  // Sync loaded version from History panel when user clicks "Open & Edit This Version"
  useEffect(() => {
    if (loadedTimeline && loadedTimeline.media_refs.length > 0) {
      if (loadedTimeline.tracks && loadedTimeline.tracks[0]?.clips?.length > 0) {
        const initialClips: Clip[] = loadedTimeline.tracks[0].clips.map((c, idx) => ({
          id: c.id || `clip-${Date.now()}-${idx}`,
          media: c.media_hash,
          in_point: 0,
          out_point: c.duration,
          position: c.start_time ?? (idx * 10.0),
          name: c.name,
          original_duration: c.duration,
        }));

        setEditorState({
          tracks: [{ id: 'track-0', clips: recalculatePositions(initialClips) }],
        });
      } else {
        const initialClips: Clip[] = loadedTimeline.media_refs.map((mediaHash, idx) => ({
          id: `clip-${Date.now()}-${idx}`,
          media: mediaHash,
          in_point: 0,
          out_point: 10.0,
          position: idx * 10.0,
          name: `Clip #${idx + 1} (${mediaHash.slice(0, 6)})`,
          original_duration: 10.0,
        }));
        setEditorState({
          tracks: [{ id: 'track-0', clips: recalculatePositions(initialClips) }],
        });
      }
      setCommitMessage(`Edit based on: ${loadedTimeline.message}`);
    }
  }, [loadedTimeline]);


  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>('Updated video timeline edit');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFn = useUpload();

  const primaryTrack = editorState.tracks[0] || { id: 'track-0', clips: [] };
  const totalDuration = primaryTrack.clips.reduce(
    (acc, c) => acc + Math.max(0.1, c.out_point - c.in_point),
    0
  );

  // Find active clip at given time position
  const getActiveClipInfo = useCallback(
    (time: number) => {
      for (const clip of primaryTrack.clips) {
        const clipDur = clip.out_point - clip.in_point;
        if (time >= clip.position && time < clip.position + clipDur) {
          const offset = time - clip.position;
          const videoTime = clip.in_point + offset;
          return { clip, offset, videoTime };
        }
      }
      if (primaryTrack.clips.length > 0) {
        const last = primaryTrack.clips[primaryTrack.clips.length - 1];
        if (time >= last.position + (last.out_point - last.in_point)) {
          return {
            clip: last,
            offset: last.out_point - last.in_point,
            videoTime: last.out_point,
          };
        }
        const first = primaryTrack.clips[0];
        return { clip: first, offset: 0, videoTime: first.in_point };
      }
      return null;
    },
    [primaryTrack.clips]
  );

  const activeClipInfo = getActiveClipInfo(playhead);

  // Split active clip at playhead
  const handleSplitAtPlayhead = useCallback(() => {
    if (!activeClipInfo) return;
    const clip = activeClipInfo.clip;
    const splitVideoTime = activeClipInfo.videoTime;
    setEditorState((prev) => splitClip(prev, clip.id, splitVideoTime));
    setSaveStatus(`Split clip "${clip.name}" at ${activeClipInfo.videoTime.toFixed(1)}s`);
  }, [activeClipInfo]);

  // Keyboard shortcut listener ('S' to split, Space to play/pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSplitAtPlayhead, isPlaying, playhead, totalDuration]);

  // Sync video audio volume and mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  // Handle Play/Pause toggle
  const togglePlay = () => {
    if (primaryTrack.clips.length === 0) return;

    if (!isPlaying) {
      if (playhead >= totalDuration - 0.05) {
        setPlayhead(0);
        if (videoRef.current && primaryTrack.clips[0]) {
          videoRef.current.currentTime = primaryTrack.clips[0].in_point;
        }
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  // Trigger video.play() or video.pause() when isPlaying state changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (isPlaying) {
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Playback prevented:', err);
          setIsPlaying(false);
        });
      }
    } else {
      vid.pause();
    }
  }, [isPlaying]);

  // Handle video time updates during playback
  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !isPlaying || !activeClipInfo) return;

    const currentVidTime = vid.currentTime;
    const currentClip = activeClipInfo.clip;

    if (currentVidTime >= currentClip.out_point - 0.05) {
      const currentIndex = primaryTrack.clips.findIndex((c) => c.id === currentClip.id);
      if (currentIndex >= 0 && currentIndex < primaryTrack.clips.length - 1) {
        const nextClip = primaryTrack.clips[currentIndex + 1];
        setPlayhead(nextClip.position);
        if (nextClip.media === currentClip.media) {
          vid.currentTime = nextClip.in_point;
          vid.play().catch(console.warn);
        }
      } else {
        setIsPlaying(false);
        setPlayhead(totalDuration);
        vid.pause();
      }
    } else {
      const offset = Math.max(0, currentVidTime - currentClip.in_point);
      setPlayhead(currentClip.position + offset);
    }
  };

  // Seek video when playhead changes by user interaction
  const handleSeek = (newTime: number) => {
    const clamped = Math.max(0, Math.min(newTime, totalDuration));
    setPlayhead(clamped);
    const info = getActiveClipInfo(clamped);
    if (videoRef.current && info) {
      videoRef.current.currentTime = info.videoTime;
    }
  };


  // Handle video file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setSaveStatus(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { hash, duration } = await uploadFn(file);
        const newClip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          media: hash,
          in_point: 0,
          out_point: Math.max(1, duration || 5.0),
          position: totalDuration,
          name: file.name,
          original_duration: Math.max(1, duration || 5.0),
        };
        setEditorState((prev) => addClip(prev, newClip));
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setSaveStatus('Error uploading media file');
    } finally {
      setIsUploading(false);
    }
  };

  // Save / Commit Timeline snapshot
  const handleSaveCommit = async () => {
    if (primaryTrack.clips.length === 0) {
      setSaveStatus('Cannot save empty timeline');
      return;
    }

    setSaveStatus('Saving timeline commit...');
    try {
      const mediaRefs = primaryTrack.clips.map((c) => c.media);
      const rawJson = JSON.stringify(editorState);

      const msgBuffer = new TextEncoder().encode(rawJson);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const timelineHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const commitPayload = {
        parent: headCommitId,
        author: 'editor@splice.dev',
        message: commitMessage.trim() || 'Saved timeline edit',
        timeline_hash: timelineHash,
        media_refs: mediaRefs,
        timeline_raw: editorState,
      };



      const res = await fetch(`${API_URL}/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitPayload),
      });

      if (!res.ok) {
        throw new Error(`Failed to save commit: ${res.statusText}`);
      }

      const commitId = await res.json();
      setSaveStatus(`Saved commit ${commitId.slice(0, 8)}! Snapshot persisted.`);
      if (onCommitSaved) {
        onCommitSaved();
      }
    } catch (err) {
      console.error('Error saving commit:', err);
      setSaveStatus('Error saving commit snapshot');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground font-sans">
      {/* Top Controls Header */}
      <div className="border-b border-border bg-card/60 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            size="sm"
          >
            <IconUpload data-icon="inline-start" />
            {isUploading ? 'Uploading Media...' : 'Import Video / Audio'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          <Badge variant="outline" className="font-mono gap-1.5 py-1">
            <IconMovie className="size-3 text-muted-foreground" />
            Clips: {primaryTrack.clips.length}
            <Separator orientation="vertical" className="h-3" />
            <IconClock className="size-3 text-muted-foreground" />
            Duration: {totalDuration.toFixed(2)}s
          </Badge>
        </div>

        {/* Save / Commit Controls */}
        <div className="flex items-center gap-2">
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Version name / notes..."
            className="w-64 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (primaryTrack.clips.length === 0) {
                setCommitMessage('Empty timeline');
                return;
              }
              const first = primaryTrack.clips[0];
              const dur = first.out_point - first.in_point;
              if (primaryTrack.clips.length === 1) {
                if (first.original_duration && Math.abs(dur - first.original_duration) > 0.05) {
                  const trimAmount = first.original_duration - dur;
                  setCommitMessage(`Trimmed ${first.name} by ${trimAmount.toFixed(1)}s`);
                } else {
                  setCommitMessage(`Cut: ${first.name} (${dur.toFixed(1)}s)`);
                }
              } else {
                setCommitMessage(
                  `Multi-clip edit: ${primaryTrack.clips.length} clips (${primaryTrack.clips[0].name}, ${primaryTrack.clips[1].name}...)`
                );
              }
            }}
            title="Auto-generate smart note based on your edits"
            className="font-mono text-xs"
          >
            <IconSparkles data-icon="inline-start" />
            Auto Note
          </Button>
          <Button onClick={handleSaveCommit} size="sm" variant="default" className="font-semibold">
            <IconDeviceFloppy data-icon="inline-start" />
            Save Project Version
          </Button>
        </div>


      </div>

      {saveStatus && (
        <div className="bg-muted/40 border-b border-border px-4 py-2 text-xs font-mono text-primary flex items-center justify-between">
          <span>{saveStatus}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setSaveStatus(null)}
          >
            ✕
          </Button>
        </div>
      )}

      {/* Center Layout: Video Preview Player + Drop Zone */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-y-auto">
        {/* Left: Video Player Monitor */}
        <Card className="flex flex-col justify-between p-4 bg-card/40">
          <div className="flex items-center justify-between pb-3 border-b border-border text-xs font-mono text-muted-foreground">
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <IconMovie className="size-3.5" /> Video Monitor Preview
            </span>
            <Badge variant="secondary" className="font-mono">
              {playhead.toFixed(2)}s / {totalDuration.toFixed(2)}s
            </Badge>
          </div>

          <div className="relative aspect-video bg-black rounded-xl overflow-hidden my-4 flex items-center justify-center border border-border">
            {activeClipInfo ? (
              <video
                ref={videoRef}
                src={`${API_URL}/media/${activeClipInfo.clip.media}`}
                className="w-full h-full object-contain"
                playsInline
                preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = activeClipInfo.videoTime;
                    if (isPlaying) {
                      videoRef.current.play().catch(console.warn);
                    }
                  }
                }}
              />
            ) : (
              <div className="text-muted-foreground font-mono text-xs text-center p-6 flex flex-col items-center gap-2">
                <IconVideo className="size-8 text-muted-foreground/50" />
                No media loaded on timeline.
                <br />
                Upload a video to begin editing.
              </div>
            )}

            {/* Playhead Overlay Tag */}
            {activeClipInfo && (
              <div className="absolute top-2 left-2 bg-background/80 border border-border rounded-lg px-2.5 py-1 text-[11px] font-mono text-foreground backdrop-blur">
                Clip: {activeClipInfo.clip.name} ({activeClipInfo.offset.toFixed(1)}s)
              </div>
            )}
          </div>

          {/* Playback Transport Controls + Audio + Split Controls */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => handleSeek(0)}
                  title="Jump to Start"
                >
                  <IconPlayerSkipBack />
                </Button>
                <Button
                  size="sm"
                  onClick={togglePlay}
                  className="font-mono font-bold"
                >
                  {isPlaying ? (
                    <>
                      <IconPlayerPause data-icon="inline-start" /> Pause
                    </>
                  ) : (
                    <>
                      <IconPlayerPlay data-icon="inline-start" /> Play
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => handleSeek(totalDuration)}
                  title="Jump to End"
                >
                  <IconPlayerSkipForward />
                </Button>

                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Split at Playhead button */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSplitAtPlayhead}
                  title="Split clip at playhead (Hotkey: S)"
                  className="font-mono text-xs"
                >
                  <IconScissors data-icon="inline-start" />
                  Split (S)
                </Button>
              </div>

              {/* Volume & Audio Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {isMuted || volume === 0 ? (
                    <IconVolumeOff className="size-4 text-destructive" />
                  ) : (
                    <IconVolume className="size-4 text-primary" />
                  )}
                </Button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const newVol = parseFloat(e.target.value);
                    setVolume(newVol);
                    if (isMuted && newVol > 0) {
                      setIsMuted(false);
                    }
                  }}
                  className="w-20 accent-primary cursor-pointer"
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            </div>

            {/* Main Playhead Scrubber */}
            <input
              type="range"
              min="0"
              max={Math.max(0.1, totalDuration)}
              step="0.05"
              value={playhead}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </div>
        </Card>

        {/* Right: Drag & Drop Zone + Clip Inspector */}
        <div className="flex flex-col gap-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/80 bg-muted/20 hover:bg-muted/40 rounded-2xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 min-h-[160px]"
          >
            <IconUpload className="size-8 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">
              Drag and drop media files here, or click to browse
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Accepts MP4, WebM, MOV. Files will be hashed via SHA-256 and deduped.
            </div>
          </div>

          {/* Quick Clip List */}
          <Card className="flex-1 flex flex-col p-4 bg-card/40">
            <CardHeader className="p-0 pb-3 border-b border-border">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Track Clips Overview ({primaryTrack.clips.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-3 flex flex-col gap-2 overflow-y-auto max-h-56">
              {primaryTrack.clips.length === 0 ? (
                <div className="text-xs font-mono text-muted-foreground text-center py-6">
                  No clips on track yet.
                </div>
              ) : (
                primaryTrack.clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    className="bg-background border border-border rounded-xl p-2.5 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 truncate max-w-[240px]">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        #{i + 1}
                      </Badge>
                      <span className="text-foreground truncate">{clip.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        {clip.in_point.toFixed(1)}s - {clip.out_point.toFixed(1)}s
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setEditorState((prev) => removeClip(prev, clip.id))}
                        className="text-destructive hover:text-destructive"
                        title="Remove Clip"
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Pane: Single Video Track Multi-Clip Editor */}
      <div className="border-t border-border bg-card/90 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-bold uppercase">
              Video Track 1
            </Badge>
            <span className="text-muted-foreground">
              (Drag handles to trim • Press <strong className="text-foreground">S</strong> or click <strong className="text-foreground">Split</strong> to cut at playhead • Drag to reorder)
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Timeline Zoom Toggle Controls */}
            <div className="flex items-center gap-1.5 bg-muted/30 p-0.5 rounded-lg border border-border">
              <IconZoomIn className="size-3 text-muted-foreground ml-1.5" />
              {[1, 2, 4].map((z) => (
                <Button
                  key={z}
                  variant={zoomLevel === z ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  className="text-[10px] font-mono h-5 px-1.5 w-auto"
                  onClick={() => setZoomLevel(z)}
                  title={`Zoom: ${z === 1 ? 'Fit (100%)' : `${z * 100}%`}`}
                >
                  {z === 1 ? 'Fit' : `${z}x`}
                </Button>
              ))}
            </div>

            <Badge variant="outline" className="font-mono text-primary font-bold">
              Playhead: {playhead.toFixed(2)}s
            </Badge>
          </div>
        </div>

        {/* Timeline Scroll Container */}
        <div className="relative bg-background border border-border rounded-2xl p-3 min-h-[90px] flex items-center overflow-x-auto">
          {primaryTrack.clips.length === 0 ? (
            <div className="w-full text-center text-xs font-mono text-muted-foreground py-4">
              Timeline is empty. Import media above to populate track.
            </div>
          ) : (
            <div
              style={{ width: zoomLevel === 1 ? '100%' : `${zoomLevel * 100}%` }}
              className="flex gap-2 min-w-full items-center relative transition-all"
            >
              {primaryTrack.clips.map((clip, index) => {
                const clipDur = clip.out_point - clip.in_point;
                const widthPercent = totalDuration > 0 ? (clipDur / totalDuration) * 100 : 100;
                const isActive = activeClipInfo?.clip.id === clip.id;

                return (
                  <div
                    key={clip.id}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        setEditorState((prev) => moveClip(prev, draggedIndex, index));
                        setDraggedIndex(null);
                      }
                    }}
                    style={{ width: `${widthPercent}%`, minWidth: '100px' }}
                    className={cn(
                      'group relative h-16 rounded-xl p-2 flex flex-col justify-between select-none cursor-grab active:cursor-grabbing transition-all border-2',
                      isActive
                        ? 'bg-primary/20 border-primary shadow-lg shadow-primary/10'
                        : 'bg-secondary/40 hover:bg-secondary/70 border-border'
                    )}
                    onClick={() => handleSeek(clip.position)}
                  >
                    {/* Left Trim Handle (In-Point) */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-3.5 bg-primary/40 hover:bg-primary cursor-ew-resize rounded-l-lg flex items-center justify-center transition-colors"
                      title="Trim In-Point"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startIn = clip.in_point;
                        const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
                        const elementWidth = rect?.width || 200;
                        const secondsPerPixel = clipDur / Math.max(1, elementWidth);

                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const deltaSeconds = (moveEvent.clientX - startX) * secondsPerPixel;
                          setEditorState((prev) =>
                            trimClip(prev, clip.id, 'in', startIn + deltaSeconds)
                          );
                        };
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove);
                          window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                      }}
                    >
                      <IconGripVertical className="size-2 text-primary-foreground opacity-80" />
                    </div>

                    {/* Clip Body Info */}
                    <div className="px-2 truncate">
                      <div className="text-xs font-semibold text-foreground truncate font-sans">
                        {clip.name}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {clipDur.toFixed(1)}s (in: {clip.in_point.toFixed(1)}s, out: {clip.out_point.toFixed(1)}s)
                      </div>
                    </div>

                    <div className="px-2 flex justify-between items-center text-[9px] font-mono text-muted-foreground">
                      <span>pos: {clip.position.toFixed(1)}s</span>
                      <span className="text-primary truncate max-w-[60px]">
                        {clip.media.slice(0, 6)}
                      </span>
                    </div>

                    {/* Right Trim Handle (Out-Point) */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-3.5 bg-primary/40 hover:bg-primary cursor-ew-resize rounded-r-lg flex items-center justify-center transition-colors"
                      title="Trim Out-Point"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startOut = clip.out_point;
                        const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
                        const elementWidth = rect?.width || 200;
                        const secondsPerPixel = clipDur / Math.max(1, elementWidth);

                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const deltaSeconds = (moveEvent.clientX - startX) * secondsPerPixel;
                          setEditorState((prev) =>
                            trimClip(prev, clip.id, 'out', startOut + deltaSeconds)
                          );
                        };
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove);
                          window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                      }}
                    >
                      <IconGripVertical className="size-2 text-primary-foreground opacity-80" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
