'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  IconGitCompare,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlayerPlay,
  IconPlayerPause,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Commit, Timeline, TimelineDiff } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { getClipInfoAtTime } from '@/lib/editor-state';

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

  const prevClipAIdRef = useRef<string | null>(null);
  const prevClipBIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentClipAId = activeClipA?.clip.id || null;
    if (prevClipAIdRef.current !== currentClipAId) {
      prevClipAIdRef.current = currentClipAId;
      if (videoRefA.current && activeClipA) {
        videoRefA.current.currentTime = activeClipA.videoTime;
        if (isPlaying) {
          videoRefA.current.play().catch(console.warn);
        }
      }
    }
  }, [activeClipA, isPlaying]);

  useEffect(() => {
    const currentClipBId = activeClipB?.clip.id || null;
    if (prevClipBIdRef.current !== currentClipBId) {
      prevClipBIdRef.current = currentClipBId;
      if (videoRefB.current && activeClipB) {
        videoRefB.current.currentTime = activeClipB.videoTime;
        if (isPlaying) {
          videoRefB.current.play().catch(console.warn);
        }
      }
    }
  }, [activeClipB, isPlaying]);

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
    const infoA = getClipInfoAtTime(clipsA, clamped);
    if (videoRefA.current && infoA) {
      videoRefA.current.currentTime = infoA.videoTime;
      if (isPlaying) videoRefA.current.play().catch(console.warn);
    }
    const infoB = getClipInfoAtTime(clipsB, clamped);
    if (videoRefB.current && infoB) {
      videoRefB.current.currentTime = infoB.videoTime;
      if (isPlaying) videoRefB.current.play().catch(console.warn);
    }
  };

  const toggleMasterPlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      videoRefA.current?.pause();
      videoRefB.current?.pause();
    } else {
      if (masterTime >= maxDuration - 0.1) handleMasterSeek(0);
      setIsPlaying(true);
      const infoA = getClipInfoAtTime(clipsA, masterTime);
      if (videoRefA.current && infoA) {
        if (Math.abs(videoRefA.current.currentTime - infoA.videoTime) > 0.3) {
          videoRefA.current.currentTime = infoA.videoTime;
        }
        videoRefA.current.play().catch(console.warn);
      }
      const infoB = getClipInfoAtTime(clipsB, masterTime);
      if (videoRefB.current && infoB) {
        if (Math.abs(videoRefB.current.currentTime - infoB.videoTime) > 0.3) {
          videoRefB.current.currentTime = infoB.videoTime;
        }
        videoRefB.current.play().catch(console.warn);
      }
    }
  };

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setMasterTime((prev) => {
        const next = prev + 0.05;
        if (next >= maxDuration) {
          setIsPlaying(false);
          videoRefA.current?.pause();
          videoRefB.current?.pause();
          return maxDuration;
        }

        const infoA = getClipInfoAtTime(clipsA, next);
        if (videoRefA.current && infoA) {
          if (videoRefA.current.paused && videoRefA.current.readyState >= 2) {
            videoRefA.current.currentTime = infoA.videoTime;
            videoRefA.current.play().catch(console.warn);
          }
        }

        const infoB = getClipInfoAtTime(clipsB, next);
        if (videoRefB.current && infoB) {
          if (videoRefB.current.paused && videoRefB.current.readyState >= 2) {
            videoRefB.current.currentTime = infoB.videoTime;
            videoRefB.current.play().catch(console.warn);
          }
        }

        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isPlaying, maxDuration, clipsA, clipsB]);


  return (
    <Card className="p-6 bg-card/60 border border-border flex flex-col gap-6 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <IconGitCompare className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-foreground">Dual-View Comparison & Visual Diff</h3>
              <Badge variant="outline" className="font-mono text-[10px]">Side-by-Side Sync Player</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Compare two versions simultaneously with synchronized lockstep video playback.
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>✕ Close Diff</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        <VersionSelector
          label="Base Version (A)"
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
        <div className="hidden md:flex items-center justify-center px-0.5">
          <div className="w-px h-full min-h-[70px] bg-gradient-to-b from-transparent via-border to-transparent [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)]" />
        </div>
        <VersionSelector
          label="Compare Target (B)"
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
      />

      <div className="flex flex-col gap-2 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <SkipBackwardButton
              onSeekStart={() => handleMasterSeek(0)}
              title="Jump Both to Start"
            />
            <PlayPauseButton
              isPlaying={isPlaying}
              onToggle={toggleMasterPlay}
              playLabel="Play Both Synced"
              pauseLabel="Pause Both"
            />
            <SkipForwardButton
              onSeekEnd={() => handleMasterSeek(maxDuration)}
              title="Jump Both to End"
            />
          </div>

          <p className="text-primary flex items-center gap-1.5 py-1 px-2.5">
            <span>Sync Playhead:</span>
            <TimeDisplay
              currentTime={masterTime}
              duration={maxDuration}
              showDuration={true}
            />
          </p>

        </div>
        <TimelineSlider
          currentTime={masterTime}
          duration={maxDuration}
          onSeek={handleMasterSeek}
          showTimeDisplay={false}
          isPlaying={isPlaying}
        />


      </div>



      <DiffDetails diff={diff} loading={loading} />
    </Card>
  );
}
