'use client';

import React, { useState, useEffect, useTransition } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Commit {
  id: string;
  parent: string | null;
  timestamp: string;
  author: string;
  message: string;
  timeline_hash: string;
  media_refs: string[];
}

export interface TimelineClip {
  id: string;
  name: string;
  media_hash: string;
  start_time: number;
  duration: number;
  track_index: number;
}

export interface TimelineTrack {
  id: string;
  name: string;
  track_type: string;
  clips: TimelineClip[];
}

export interface Timeline {
  commit_id: string;
  parent_id: string | null;
  timeline_hash: string;
  message: string;
  author: string;
  timestamp: string;
  tracks: TimelineTrack[];
  media_refs: string[];
  mode: 'preview' | 'restore';
  is_head: boolean;
  total_duration: number;
}

export function useRevert(id: string) {
  return async (mode: 'preview' | 'restore'): Promise<Timeline> => {
    const res = await fetch(`${API_URL}/commits/${id}/revert?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to ${mode} commit: ${res.statusText}`);
    }
    return res.json();
  };
}

interface HistoryPanelProps {
  initialCommits: Commit[];
}

export default function HistoryPanel({ initialCommits }: HistoryPanelProps) {
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [activeHeadId, setActiveHeadId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'json'>('timeline');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchCommits = async () => {
    try {
      const res = await fetch(`${API_URL}/commits`, { cache: 'no-store' });
      if (res.ok) {
        const data: Commit[] = await res.json();
        setCommits(data);
        if (data.length > 0) {
          setActiveHeadId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error refreshing commits:', err);
    }
  };

  const handleSelectCommit = async (commitId: string, mode: 'preview' | 'restore' = 'preview') => {
    setSelectedCommitId(commitId);
    setLoadingTimeline(true);
    setStatusMessage(null);
    try {
      const revertFn = useRevert(commitId);
      const data = await revertFn(mode);
      setTimeline(data);
      if (mode === 'restore') {
        setActiveHeadId(commitId);
        setStatusMessage(`Successfully restored HEAD to commit ${commitId.slice(0, 8)}`);
        await fetchCommits();
      }
    } catch (err) {
      console.error(`Error during ${mode}:`, err);
      setStatusMessage(`Error: Failed to ${mode} commit`);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    if (selectedCommitId) {
      handleSelectCommit(selectedCommitId, 'preview');
    }
  }, []);

  const filteredCommits = commits.filter(
    (c) =>
      c.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.timeline_hash.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-bold text-lg tracking-tight text-white">Splice</h1>
          <span className="text-zinc-500 text-sm">/</span>
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
            Timeline Engine
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {statusMessage && (
            <span className="text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-3 py-1 rounded animate-fade-in">
              {statusMessage}
            </span>
          )}
          <div className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1 text-zinc-400">
            HEAD: <span className="text-emerald-400 font-semibold">{activeHeadId ? `${activeHeadId.slice(0, 8)}...` : 'None'}</span>
          </div>
          <button
            onClick={() => fetchCommits()}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1 rounded transition-colors"
          >
            Refresh Log
          </button>
        </div>
      </header>

      {/* Main Two-Pane Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: History Sidebar */}
        <aside className="w-96 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0">
          <div className="p-4 border-b border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Commit History
              </h2>
              <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                {commits.length} snapshots
              </span>
            </div>
            <input
              type="text"
              placeholder="Search commits by message, id, author..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50 p-2 space-y-1">
            {filteredCommits.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs font-mono">
                No commits match query
              </div>
            ) : (
              filteredCommits.map((commit, index) => {
                const isSelected = selectedCommitId === commit.id;
                const isHead = activeHeadId === commit.id;
                const snapshotNumber = commits.length - 1 - commits.findIndex((c) => c.id === commit.id);

                return (
                  <div
                    key={commit.id}
                    onClick={() => handleSelectCommit(commit.id, 'preview')}
                    className={`group cursor-pointer rounded-lg p-3 transition-all duration-150 border ${
                      isSelected
                        ? 'bg-zinc-800/90 border-zinc-600 shadow-md'
                        : 'bg-zinc-900/20 hover:bg-zinc-800/50 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                          #{snapshotNumber}
                        </span>
                        {isHead && (
                          <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded">
                            HEAD
                          </span>
                        )}
                        {isSelected && !isHead && (
                          <span className="text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded">
                            PREVIEWING
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {commit.timestamp.slice(11, 19)}
                      </span>
                    </div>

                    <div className="mt-1.5 font-medium text-sm text-zinc-200 line-clamp-2">
                      {commit.message}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-400 font-mono">
                      <div className="truncate max-w-[160px] text-zinc-500">
                        {commit.author}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectCommit(commit.id, 'restore');
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-300 text-[11px] font-sans font-medium transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: Timeline Preview & Details */}
        <main className="flex-1 flex flex-col bg-zinc-950 overflow-y-auto">
          {loadingTimeline ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3 text-zinc-400 font-mono text-sm">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Reconstructing timeline state from commit...
              </div>
            </div>
          ) : timeline ? (
            <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
              {/* Snapshot Header Bar */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                        timeline.is_head
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                    >
                      {timeline.is_head ? 'ACTIVE HEAD' : 'DETACHED PREVIEW'}
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      Duration: {timeline.total_duration.toFixed(1)}s
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    {timeline.message}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-400 pt-1">
                    <span>Author: <strong className="text-zinc-300 font-sans">{timeline.author}</strong></span>
                    <span>•</span>
                    <span>Date: <strong className="text-zinc-300">{timeline.timestamp}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start md:self-center">
                  {!timeline.is_head && (
                    <button
                      onClick={() => handleSelectCommit(timeline.commit_id, 'restore')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-lg flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      One-Click Revert (Make HEAD)
                    </button>
                  )}
                </div>
              </div>

              {/* Hashes & Metadata Strip */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Commit ID</div>
                  <div className="text-zinc-300 font-bold truncate mt-0.5">{timeline.commit_id}</div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Timeline Hash</div>
                  <div className="text-cyan-400 font-bold truncate mt-0.5">{timeline.timeline_hash}</div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Media References</div>
                  <div className="text-amber-400 font-bold mt-0.5">{timeline.media_refs.length} objects linked</div>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      activeTab === 'timeline'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Visual Multi-Track Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab('json')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      activeTab === 'json'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Reconstructed JSON
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'timeline' ? (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-6">
                  {/* Time Ruler */}
                  <div className="flex justify-between text-[11px] font-mono text-zinc-500 border-b border-zinc-800 pb-1">
                    <span>0:00</span>
                    <span>{(timeline.total_duration * 0.25).toFixed(1)}s</span>
                    <span>{(timeline.total_duration * 0.5).toFixed(1)}s</span>
                    <span>{(timeline.total_duration * 0.75).toFixed(1)}s</span>
                    <span>{timeline.total_duration.toFixed(1)}s</span>
                  </div>

                  {/* Multi-Track Editor View */}
                  <div className="space-y-4">
                    {timeline.tracks.map((track) => (
                      <div key={track.id} className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                          <span className="font-semibold text-zinc-300">{track.name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{track.track_type}</span>
                        </div>
                        <div className="h-16 bg-zinc-950 border border-zinc-800/80 rounded-lg p-2 relative flex gap-2 overflow-x-auto items-center">
                          {track.clips.map((clip) => {
                            const widthPercent = Math.max(15, (clip.duration / timeline.total_duration) * 100);
                            const isVideo = track.track_type === 'video';

                            return (
                              <div
                                key={clip.id}
                                style={{ width: `${widthPercent}%` }}
                                className={`h-full rounded-md p-2 flex flex-col justify-between text-[11px] font-mono select-none transition-all hover:scale-[1.01] ${
                                  isVideo
                                    ? 'bg-blue-950/70 border border-blue-800 text-blue-200'
                                    : 'bg-purple-950/70 border border-purple-800 text-purple-200'
                                }`}
                              >
                                <div className="font-medium truncate font-sans">{clip.name}</div>
                                <div className="flex justify-between items-center text-[9px] opacity-80">
                                  <span>{clip.duration.toFixed(1)}s</span>
                                  <span className="truncate max-w-[60px] font-mono">{clip.media_hash.slice(0, 6)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Media Reference Blobs */}
                  {timeline.media_refs.length > 0 && (
                    <div className="pt-4 border-t border-zinc-800 space-y-2">
                      <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                        Content-Addressed Media Refs (SHA-256)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {timeline.media_refs.map((hash, i) => (
                          <div
                            key={i}
                            className="bg-zinc-950 border border-zinc-800 rounded p-2 text-xs font-mono flex items-center justify-between text-zinc-400"
                          >
                            <span className="text-zinc-500">#{i + 1}</span>
                            <span className="text-amber-400 font-bold truncate max-w-[240px]">{hash}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                  <pre className="text-xs font-mono text-emerald-400 bg-zinc-950 p-4 rounded-lg overflow-x-auto max-h-[460px]">
                    {JSON.stringify(timeline, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 font-mono text-sm">
              Select a commit from the history sidebar to preview timeline state.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
