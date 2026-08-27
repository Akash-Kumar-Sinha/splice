'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  IconUpload,
  IconDeviceFloppy,
  IconSparkles,
  IconDownload,
  IconFilePlus,
  IconGitBranch,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API_URL } from '@/lib/api';
import {
  Clip,
  EditorState,
  addClip,
  removeClip,
  splitClip,
  recalculatePositions,
} from '@/lib/editor-state';
import { useUpload } from '@/hooks/use-upload';

import EditorVideoMonitor from './editor/EditorVideoMonitor';
import EditorUploadZone from './editor/EditorUploadZone';
import EditorClipList from './editor/EditorClipList';
import EditorTimelineTrack from './editor/EditorTimelineTrack';

export type { Clip, Track, EditorState } from '@/lib/editor-state';
export { recalculatePositions, addClip, removeClip, moveClip, trimClip, splitClip } from '@/lib/editor-state';
export { useUpload } from '@/hooks/use-upload';

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
  headCommitId: _headCommitId,
  loadedTimeline,
  onCommitSaved,
}: TimelineEditorProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    tracks: [{ id: 'track-0', clips: [] }],
  });
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [activeParentName, setActiveParentName] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [commitMessage, setCommitMessage] = useState('Updated video timeline edit');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadFn = useUpload();

  const primaryTrack = editorState.tracks[0] || { id: 'track-0', clips: [] };
  const totalDuration = primaryTrack.clips.reduce(
    (acc, c) => acc + Math.max(0.1, c.out_point - c.in_point),
    0
  );

  const getActiveClipInfo = useCallback(
    (time: number) => {
      for (const clip of primaryTrack.clips) {
        const clipDur = clip.out_point - clip.in_point;
        if (time >= clip.position && time < clip.position + clipDur) {
          return { clip, offset: time - clip.position, videoTime: clip.in_point + (time - clip.position) };
        }
      }
      if (primaryTrack.clips.length > 0) {
        const last = primaryTrack.clips[primaryTrack.clips.length - 1];
        if (time >= last.position + (last.out_point - last.in_point)) {
          return { clip: last, offset: last.out_point - last.in_point, videoTime: last.out_point };
        }
        const first = primaryTrack.clips[0];
        return { clip: first, offset: 0, videoTime: first.in_point };
      }
      return null;
    },
    [primaryTrack.clips]
  );

  const activeClipInfo = getActiveClipInfo(playhead);

  const handleSplitAtPlayhead = useCallback(() => {
    if (!activeClipInfo) return;
    setEditorState((prev) => splitClip(prev, activeClipInfo.clip.id, activeClipInfo.videoTime));
    setSaveStatus(`Split clip "${activeClipInfo.clip.name}" at ${activeClipInfo.videoTime.toFixed(1)}s`);
  }, [activeClipInfo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleSplitAtPlayhead(); }
      else if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSplitAtPlayhead, isPlaying, playhead, totalDuration]);

  useEffect(() => {
    if (videoRef.current) { videoRef.current.muted = isMuted; videoRef.current.volume = volume; }
  }, [isMuted, volume]);

  const togglePlay = () => {
    if (primaryTrack.clips.length === 0) return;
    if (!isPlaying) {
      if (playhead >= totalDuration - 0.05) {
        setPlayhead(0);
        if (videoRef.current && primaryTrack.clips[0]) videoRef.current.currentTime = primaryTrack.clips[0].in_point;
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.play().catch((err) => { console.warn('Playback prevented:', err); setIsPlaying(false); });
    } else {
      vid.pause();
    }
  }, [isPlaying]);

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
        if (nextClip.media === currentClip.media) { vid.currentTime = nextClip.in_point; vid.play().catch(console.warn); }
      } else {
        setIsPlaying(false); setPlayhead(totalDuration); vid.pause();
      }
    } else {
      setPlayhead(currentClip.position + Math.max(0, currentVidTime - currentClip.in_point));
    }
  };

  const handleSeek = (newTime: number) => {
    const clamped = Math.max(0, Math.min(newTime, totalDuration));
    setPlayhead(clamped);
    const info = getActiveClipInfo(clamped);
    if (videoRef.current && info) videoRef.current.currentTime = info.videoTime;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true); setSaveStatus(null); setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadFileName(file.name); setUploadProgress(0);
        const { hash, duration } = await uploadFn(file, (p) => setUploadProgress(p));
        const newClip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          media: hash, in_point: 0, out_point: Math.max(1, duration || 5.0),
          position: totalDuration, name: file.name, original_duration: Math.max(1, duration || 5.0),
        };
        setEditorState((prev) => addClip(prev, newClip));
      }
    } catch (err) {
      console.error('Error uploading:', err); setSaveStatus('Error uploading media file');
    } finally {
      setIsUploading(false); setUploadProgress(0); setUploadFileName('');
    }
  };

  const handleSaveCommit = async () => {
    if (primaryTrack.clips.length === 0) { setSaveStatus('Cannot save empty timeline'); return; }
    setSaveStatus('Saving timeline commit...');
    try {
      const mediaRefs = primaryTrack.clips.map((c) => c.media);
      const rawJson = JSON.stringify(editorState);
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawJson));
      const timelineHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetch(`${API_URL}/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent: activeParentId, author: 'aks.krsinha@gmail.com',
          message: commitMessage.trim() || 'Saved timeline edit',
          timeline_hash: timelineHash, media_refs: mediaRefs, timeline_raw: editorState,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save: ${res.statusText}`);
      const commitId = await res.json();
      setActiveParentId(commitId);
      setActiveParentName(commitMessage.trim() || 'Saved Version');
      setSaveStatus(activeParentId ? `Saved ${commitId.slice(0, 8)}!` : `Saved root project ${commitId.slice(0, 8)}!`);
      if (onCommitSaved) onCommitSaved();
    } catch (err) {
      console.error('Error saving:', err); setSaveStatus('Error saving commit snapshot');
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExportVideo = async () => {
    if (primaryTrack.clips.length === 0) { alert('No clips to export.'); return; }
    setIsExporting(true);
    try {
      const res = await fetch(`${API_URL}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline_raw: editorState }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Export failed' })); throw new Error(err.error || `HTTP ${res.status}`); }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `splice_cut_${Date.now()}.mp4`;
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
      setSaveStatus('Export downloaded!');
    } catch (err: any) { console.error('Export error:', err); alert(`Export failed: ${err.message}`); }
    finally { setIsExporting(false); }
  };

  useEffect(() => {
    if (loadedTimeline) {
      setActiveParentId(loadedTimeline.commit_id);
      setActiveParentName(loadedTimeline.message);
      if (loadedTimeline.tracks?.[0]?.clips?.length) {
        const initialClips: Clip[] = loadedTimeline.tracks[0].clips.map((c, idx) => ({
          id: c.id || `clip-${Date.now()}-${idx}`, media: c.media_hash,
          in_point: 0, out_point: c.duration, position: c.start_time ?? (idx * 10.0),
          name: c.name, original_duration: c.duration,
        }));
        setEditorState({ tracks: [{ id: 'track-0', clips: recalculatePositions(initialClips) }] });
      } else if (loadedTimeline.media_refs?.length) {
        const initialClips: Clip[] = loadedTimeline.media_refs.map((mediaHash, idx) => ({
          id: `clip-${Date.now()}-${idx}`, media: mediaHash, in_point: 0, out_point: 10.0,
          position: idx * 10.0, name: `Clip #${idx + 1} (${mediaHash.slice(0, 6)})`, original_duration: 10.0,
        }));
        setEditorState({ tracks: [{ id: 'track-0', clips: recalculatePositions(initialClips) }] });
      }
      setCommitMessage(`Edit based on: ${loadedTimeline.message}`);
      setSaveStatus(`Loaded "${loadedTimeline.message}" (Branch mode)`);
    }
  }, [loadedTimeline]);

  const handleStartNewProject = () => {
    setEditorState({ tracks: [{ id: 'track-0', clips: [] }] });
    setActiveParentId(null); setActiveParentName(null);
    setCommitMessage('Initial project cut'); setPlayhead(0); setIsPlaying(false);
    setSaveStatus('Started new independent project (Root Tree)');
  };

  const handleUnlinkParent = () => {
    setActiveParentId(null); setActiveParentName(null);
    setSaveStatus('Unlinked: will save as independent project');
  };

  const generateAutoNote = () => {
    if (primaryTrack.clips.length === 0) { setCommitMessage('Empty timeline'); return; }
    const first = primaryTrack.clips[0];
    const dur = first.out_point - first.in_point;
    if (primaryTrack.clips.length === 1) {
      if (first.original_duration && Math.abs(dur - first.original_duration) > 0.05) {
        setCommitMessage(`Trimmed ${first.name} by ${(first.original_duration - dur).toFixed(1)}s`);
      } else {
        setCommitMessage(`Cut: ${first.name} (${dur.toFixed(1)}s)`);
      }
    } else {
      setCommitMessage(`Multi-clip edit: ${primaryTrack.clips.length} clips (${primaryTrack.clips[0].name}, ${primaryTrack.clips[1].name}...)`);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground font-sans overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/60 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={handleStartNewProject} size="sm" variant="outline" className="h-8 text-xs gap-1.5" title="Start fresh project">
            <IconFilePlus data-icon="inline-start" /> New
          </Button>
          <Button onClick={() => document.querySelector<HTMLInputElement>('[type="file"]')?.click()} disabled={isUploading} size="sm" className="h-8 text-xs gap-1.5">
            {isUploading ? <Spinner className="size-3.5" /> : <IconUpload data-icon="inline-start" />}
            {isUploading ? 'Uploading...' : 'Import'}
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <span className="text-[11px] text-muted-foreground">
            {primaryTrack.clips.length} clip{primaryTrack.clips.length !== 1 ? 's' : ''} · {totalDuration.toFixed(1)}s
          </span>

          {activeParentId && (
            <Badge variant="secondary" className="text-[10px] gap-1 h-5">
              <IconGitBranch className="size-3" />
              <span className="truncate max-w-[100px]">{activeParentName || activeParentId.slice(0, 7)}</span>
              <button onClick={handleUnlinkParent} className="ml-0.5 hover:text-foreground">✕</button>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Version notes..."
            className="w-48 h-8 text-xs"
          />
          <Button variant="ghost" size="sm" onClick={generateAutoNote} title="Auto-generate note" className="h-8 px-2 text-xs text-muted-foreground">
            <IconSparkles data-icon="inline-start" />
          </Button>
          <Button onClick={handleExportVideo} size="sm" variant="outline" disabled={isExporting || primaryTrack.clips.length === 0} className="h-8 text-xs gap-1.5">
            {isExporting ? <Spinner className="size-3.5" /> : <IconDownload data-icon="inline-start" />}
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
          <Button onClick={handleSaveCommit} size="sm" className="h-8 text-xs gap-1.5 font-semibold">
            <IconDeviceFloppy data-icon="inline-start" /> Save
          </Button>
        </div>
      </div>

      {saveStatus && (
        <div className="bg-muted/40 border-b border-border px-4 py-2 text-xs text-primary flex items-center justify-between">
          <span>{saveStatus}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setSaveStatus(null)}>✕</Button>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 size-full">
        <div className="p-6 flex flex-col gap-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
            <EditorVideoMonitor
              activeClipInfo={activeClipInfo}
              playhead={playhead}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              isMuted={isMuted}
              volume={volume}
              videoRef={videoRef}
              onTogglePlay={togglePlay}
              onSeek={handleSeek}
              onSetIsMuted={setIsMuted}
              onSetVolume={setVolume}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current && activeClipInfo) {
                  videoRef.current.currentTime = activeClipInfo.videoTime;
                  if (isPlaying) videoRef.current.play().catch(console.warn);
                }
              }}
              onSplitAtPlayhead={handleSplitAtPlayhead}
            />

            <div className="flex flex-col gap-4">
              <EditorUploadZone
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                uploadFileName={uploadFileName}
                onFileUpload={handleFileUpload}
              />
              <EditorClipList
                clips={primaryTrack.clips}
                onRemoveClip={(id) => setEditorState((prev) => removeClip(prev, id))}
              />
            </div>
          </div>

          <EditorTimelineTrack
            clips={primaryTrack.clips}
            totalDuration={totalDuration}
            playhead={playhead}
            activeClipId={activeClipInfo?.clip.id || null}
            zoomLevel={zoomLevel}
            onSetZoomLevel={setZoomLevel}
            onSeek={handleSeek}
            onSetEditorState={setEditorState}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
