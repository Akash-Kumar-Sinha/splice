'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { IconGitCompare } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Commit, Timeline, TimelineDiff } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { getClipInfoAtTime } from '@/lib/editor-state';
import { safePlay, safePause } from '@/lib/utils';

import VersionSelector from './diff/VersionSelector';
import DualVideoMonitor from './diff/DualVideoMonitor';
import DiffDetails from './diff/DiffDetails';
import {
  SkipBackwardButton,
  PlayPauseButton,
  SkipForwardButton,
  TimelineSlider,
  TimeDisplay,
} from '@/components/video-component';

export interface ClipRef {
  media: string;
  track_index: number;
  clip_index: number;
}

export interface TimeRange {
  in_point: number;
  out_point: number;
  position: number;
}

interface DiffInspectorProps {
  commits: Commit[];
  baseCommitId: string | null;
  targetCommitId: string | null;
  onSelectBase: (id: string) => void;
  onSelectTarget: (id: string) => void;
  onClose?: () => void;
}

export default function DiffInspector({
  commits,
  baseCommitId,
  targetCommitId,
  onSelectBase,
  onSelectTarget,
  onClose,
}: DiffInspectorProps) {
  const [diff, setDiff] = useState<TimelineDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [timelineA, setTimelineA] = useState<Timeline | null>(null);
  const [timelineB, setTimelineB] = useState<Timeline | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterTime, setMasterTime] = useState(0);
  const [audioFocus, setAudioFocus] = useState<'a' | 'b' | 'both'>('b');

  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  const baseCommit = commits.find((c) => c.id === baseCommitId);
  const targetCommit = commits.find((c) => c.id === targetCommitId);

  const treeGroups = useMemo(() => {
    const commitMap = new Map<string, Commit>(commits.map((c) => [c.id, c]));
    const getRootId = (id: string) => {
      let curr = commitMap.get(id);
      const visited = new Set<string>();
      while (curr && curr.parent && commitMap.has(curr.parent) && !visited.has(curr.id)) {
        visited.add(curr.id);
        curr = commitMap.get(curr.parent);
      }
      return curr ? curr.id : id;
    };
    const map = new Map<string, { root: Commit; members: Commit[] }>();
    for (const c of commits) {
      const rootId = getRootId(c.id);
      const rootCommit = commitMap.get(rootId) || c;
      if (!map.has(rootId)) map.set(rootId, { root: rootCommit, members: [] });
      map.get(rootId)!.members.push(c);
    }
    return map;
  }, [commits]);

  const activeTreeGroup = useMemo(() => {
    if (!baseCommitId) return null;
    for (const [, group] of treeGroups) {
      if (group.members.some((m) => m.id === baseCommitId)) return group;
    }
    return null;
  }, [baseCommitId, treeGroups]);

  useEffect(() => {
    if (activeTreeGroup && activeTreeGroup.members.length > 0) {
      const isTargetInSameTree = activeTreeGroup.members.some((m) => m.id === targetCommitId);
      if (!isTargetInSameTree || targetCommitId === baseCommitId) {
        const candidate =
          activeTreeGroup.members.find((m) => m.id === baseCommit?.parent) ||
          activeTreeGroup.members.find((m) => m.parent === baseCommitId) ||
          activeTreeGroup.members.find((m) => m.id !== baseCommitId) ||
          activeTreeGroup.members[0];
        if (candidate && candidate.id !== targetCommitId) onSelectTarget(candidate.id);
      }
    }
  }, [baseCommitId, activeTreeGroup, targetCommitId, baseCommit, onSelectTarget]);

  useEffect(() => {
    if (!baseCommitId || !targetCommitId || baseCommitId === targetCommitId) {
      setDiff(null);
      return;
    }
    const fetchDiff = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/commits/diff?from=${baseCommitId}&to=${targetCommitId}`);
        if (res.ok) setDiff(await res.json());
      } catch (err) {
        console.error('Failed to load diff:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDiff();
  }, [baseCommitId, targetCommitId]);

  useEffect(() => {
    if (!baseCommitId) { setTimelineA(null); return; }
    fetch(`${API_URL}/commits/${baseCommitId}/revert?mode=preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setTimelineA(data); })
      .catch((err) => console.error('Failed to fetch timeline A:', err));
  }, [baseCommitId]);

  useEffect(() => {
    if (!targetCommitId) { setTimelineB(null); return; }
    fetch(`${API_URL}/commits/${targetCommitId}/revert?mode=preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setTimelineB(data); })
      .catch((err) => console.error('Failed to fetch timeline B:', err));
  }, [targetCommitId]);

  const clipsA = timelineA?.tracks?.[0]?.clips || [];
  const clipsB = timelineB?.tracks?.[0]?.clips || [];
  const durationA = timelineA?.total_duration || 10;
  const durationB = timelineB?.total_duration || 10;
  const maxDuration = Math.max(0.1, durationA, durationB);

  const activeClipA = getClipInfoAtTime(clipsA, masterTime);
  const activeClipB = getClipInfoAtTime(clipsB, masterTime);

  const mediaHashA =
    activeClipA?.clip.media_hash || clipsA[0]?.media_hash || timelineA?.media_refs?.[0] || baseCommit?.media_refs?.[0] || null;
  const mediaHashB =
    activeClipB?.clip.media_hash || clipsB[0]?.media_hash || timelineB?.media_refs?.[0] || targetCommit?.media_refs?.[0] || null;

  const handleSetAudioMode = useCallback((mode: 'a' | 'b' | 'both') => {
    setAudioFocus(mode);
    if (videoRefA.current) {
      videoRefA.current.muted = mode === 'b';
      if (mode !== 'b' && videoRefA.current.volume === 0) videoRefA.current.volume = 1;
    }
    if (videoRefB.current) {
      videoRefB.current.muted = mode === 'a';
      if (mode !== 'a' && videoRefB.current.volume === 0) videoRefB.current.volume = 1;
    }
  }, []);

  useEffect(() => {
    if (videoRefA.current) videoRefA.current.muted = audioFocus === 'b';
    if (videoRefB.current) videoRefB.current.muted = audioFocus === 'a';
  }, [audioFocus]);

  const handleMasterSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, maxDuration));
    setMasterTime(clamped);

    // Sync Video A
    if (videoRefA.current) {
      if (clamped >= durationA) {
        safePause(videoRefA.current);
        const last = clipsA[clipsA.length - 1];
        if (last) {
          videoRefA.current.currentTime = (last.in_point ?? 0) + last.duration;
        }
      } else {
        const infoA = getClipInfoAtTime(clipsA, clamped);
        if (infoA) {
          videoRefA.current.currentTime = infoA.videoTime;
          if (isPlaying) safePlay(videoRefA.current);
        }
      }
    }

    // Sync Video B
    if (videoRefB.current) {
      if (clamped >= durationB) {
        safePause(videoRefB.current);
        const last = clipsB[clipsB.length - 1];
        if (last) {
          videoRefB.current.currentTime = (last.in_point ?? 0) + last.duration;
        }
      } else {
        const infoB = getClipInfoAtTime(clipsB, clamped);
        if (infoB) {
          videoRefB.current.currentTime = infoB.videoTime;
          if (isPlaying) safePlay(videoRefB.current);
        }
      }
    }
  };

  const toggleMasterPlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      safePause(videoRefA.current);
      safePause(videoRefB.current);
    } else {
      const startTime = masterTime >= maxDuration - 0.1 ? 0 : masterTime;
      if (masterTime >= maxDuration - 0.1) {
        setMasterTime(0);
      }
      setIsPlaying(true);

      if (videoRefA.current && startTime < durationA) {
        const infoA = getClipInfoAtTime(clipsA, startTime);
        if (infoA) {
          if (Math.abs(videoRefA.current.currentTime - infoA.videoTime) > 0.2) {
            videoRefA.current.currentTime = infoA.videoTime;
          }
          safePlay(videoRefA.current);
        }
      }
      if (videoRefB.current && startTime < durationB) {
        const infoB = getClipInfoAtTime(clipsB, startTime);
        if (infoB) {
          if (Math.abs(videoRefB.current.currentTime - infoB.videoTime) > 0.2) {
            videoRefB.current.currentTime = infoB.videoTime;
          }
          safePlay(videoRefB.current);
        }
      }
    }
  };

  // Smooth RAF Playhead Clock
  useEffect(() => {
    if (!isPlaying) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setMasterTime((prev) => {
        const next = prev + dt;
        if (next >= maxDuration) {
          setIsPlaying(false);
          safePause(videoRefA.current);
          safePause(videoRefB.current);
          return maxDuration;
        }
        if (next >= durationA && videoRefA.current && !videoRefA.current.paused) {
          safePause(videoRefA.current);
        }
        if (next >= durationB && videoRefB.current && !videoRefB.current.paused) {
          safePause(videoRefB.current);
        }
        return next;
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, maxDuration, durationA, durationB]);

  // Seamless boundary clip transition for Video A
  const handleTimeUpdateA = useCallback(() => {
    const vid = videoRefA.current;
    if (!vid || !isPlaying) return;
    const currentVidTime = vid.currentTime;
    const info = getClipInfoAtTime(clipsA, masterTime);
    if (!info) return;
    const currentClip = info.clip;
    const inPoint = currentClip.in_point ?? 0;
    const outPoint = currentClip.out_point ?? (inPoint + currentClip.duration);

    if (currentVidTime >= outPoint - 0.04) {
      const currentIndex = clipsA.findIndex((c) => c.id === currentClip.id);
      if (currentIndex >= 0 && currentIndex < clipsA.length - 1) {
        const nextClip = clipsA[currentIndex + 1];
        if (nextClip.media_hash === currentClip.media_hash) {
          vid.currentTime = nextClip.in_point ?? 0;
          safePlay(vid);
        }
      } else {
        safePause(vid);
      }
    }
  }, [clipsA, isPlaying, masterTime]);

  // Seamless boundary clip transition for Video B
  const handleTimeUpdateB = useCallback(() => {
    const vid = videoRefB.current;
    if (!vid || !isPlaying) return;
    const currentVidTime = vid.currentTime;
    const info = getClipInfoAtTime(clipsB, masterTime);
    if (!info) return;
    const currentClip = info.clip;
    const inPoint = currentClip.in_point ?? 0;
    const outPoint = currentClip.out_point ?? (inPoint + currentClip.duration);

    if (currentVidTime >= outPoint - 0.04) {
      const currentIndex = clipsB.findIndex((c) => c.id === currentClip.id);
      if (currentIndex >= 0 && currentIndex < clipsB.length - 1) {
        const nextClip = clipsB[currentIndex + 1];
        if (nextClip.media_hash === currentClip.media_hash) {
          vid.currentTime = nextClip.in_point ?? 0;
          safePlay(vid);
        }
      } else {
        safePause(vid);
      }
    }
  }, [clipsB, isPlaying, masterTime]);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconGitCompare className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Compare Versions</h3>
          {diff && (
            <span className="text-[10px] text-muted-foreground">
              {diff.added.length} added · {diff.removed.length} removed · {diff.moved.length} modified
            </span>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-[11px] text-muted-foreground hover:text-foreground">
            ✕ Close
          </Button>
        )}
      </div>

      {/* Version selectors — flat row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <VersionSelector
          label="Base (A)"
          badge={baseCommitId || 'None'}
          commit={baseCommit}
          commitId={baseCommitId}
          selectedId={baseCommitId}
          treeGroups={treeGroups}
          activeTreeGroup={activeTreeGroup}
          isBase
          otherCommitId={targetCommitId}
          onSelect={onSelectBase}
        />
        <div className="hidden md:flex items-center justify-center">
          <div className="w-8 h-px bg-border/60" />
        </div>
        <VersionSelector
          label="Target (B)"
          badge={targetCommitId || 'None'}
          badgeVariant="default"
          commit={targetCommit}
          commitId={targetCommitId}
          selectedId={targetCommitId}
          treeGroups={treeGroups}
          activeTreeGroup={activeTreeGroup}
          isBase={false}
          otherCommitId={baseCommitId}
          onSelect={onSelectTarget}
        />
      </div>

      {/* Dual video */}
      <DualVideoMonitor
        baseCommit={baseCommit}
        targetCommit={targetCommit}
        mediaHashA={mediaHashA}
        mediaHashB={mediaHashB}
        clipsA={clipsA}
        clipsB={clipsB}
        durationA={durationA}
        durationB={durationB}
        timeA={Math.min(masterTime, durationA)}
        timeB={Math.min(masterTime, durationB)}
        activeClipA={activeClipA}
        activeClipB={activeClipB}
        audioFocus={audioFocus}
        isPlaying={isPlaying}
        videoRefA={videoRefA}
        videoRefB={videoRefB}
        diff={diff}
        onSetAudioFocus={handleSetAudioMode}
        onSeekA={handleMasterSeek}
        onSeekB={handleMasterSeek}
        onTimeUpdateA={handleTimeUpdateA}
        onTimeUpdateB={handleTimeUpdateB}
      />

      {/* Sync transport */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <SkipBackwardButton
              onClick={() => handleMasterSeek(Math.max(0, masterTime - 5))}
              onSeekStart={() => handleMasterSeek(0)}
              title="Step backward 5s (or double click to jump to start)"
            />
            <PlayPauseButton
              isPlaying={isPlaying}
              onToggle={toggleMasterPlay}
              playLabel="Play synced"
              pauseLabel="Pause"
            />
            <SkipForwardButton
              onClick={() => handleMasterSeek(Math.min(maxDuration, masterTime + 5))}
              onSeekEnd={() => handleMasterSeek(maxDuration)}
              title="Step forward 5s (or double click to jump to end)"
            />
          </div>

          <TimeDisplay currentTime={masterTime} duration={maxDuration} showDuration />
        </div>
        <TimelineSlider
          currentTime={masterTime}
          duration={maxDuration}
          onSeek={handleMasterSeek}
          showTimeDisplay={false}
          isPlaying={isPlaying}
        />
      </div>

      {/* Diff details */}
      <DiffDetails diff={diff} loading={loading} />
    </div>
  );
}
