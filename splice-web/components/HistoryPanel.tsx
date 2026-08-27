'use client';

import React, { useState, useEffect } from 'react';
import {
  IconHistory,
  IconSearch,
  IconArrowBackUp,
  IconRefresh,
  IconClock,
  IconUser,
  IconMovie,
  IconCode,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

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
    <SidebarProvider className="h-full">
      <div className="flex flex-1 w-full h-full overflow-hidden bg-background text-foreground">
        {/* Shadcn Sidebar */}
        <Sidebar className="border-r border-border bg-card/40 w-80 shrink-0" collapsible="none">
          <SidebarHeader className="p-3 border-b border-border gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                <IconHistory className="size-4 text-primary" />
                <span>Snapshots</span>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {commits.length}
              </Badge>
            </div>
            <div className="relative">
              <IconSearch className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Filter history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs font-mono"
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="p-2">
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
                Linear Commit Chain
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {filteredCommits.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs font-mono">
                      No matching commits
                    </div>
                  ) : (
                    filteredCommits.map((commit) => {
                      const isSelected = selectedCommitId === commit.id;
                      const isHead = activeHeadId === commit.id;
                      const snapshotNumber =
                        commits.length - 1 - commits.findIndex((c) => c.id === commit.id);

                      return (
                        <SidebarMenuItem key={commit.id}>
                          <div
                            onClick={() => handleSelectCommit(commit.id, 'preview')}
                            className={cn(
                              'w-full text-left rounded-xl p-2.5 transition-all border flex flex-col gap-1.5 cursor-pointer',
                              isSelected
                                ? 'bg-card border-primary/60 shadow-sm'
                                : 'bg-card/20 hover:bg-card/60 border-border/40'
                            )}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[9px] px-1 py-0"
                                >
                                  #{snapshotNumber}
                                </Badge>
                                {isHead && (
                                  <Badge
                                    variant="default"
                                    className="font-mono text-[9px] px-1 py-0"
                                  >
                                    HEAD
                                  </Badge>
                                )}
                                {isSelected && !isHead && (
                                  <Badge
                                    variant="secondary"
                                    className="font-mono text-[9px] px-1 py-0 text-primary"
                                  >
                                    PREVIEW
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {commit.timestamp.slice(11, 19)}
                              </span>
                            </div>

                            <div className="font-medium text-xs text-foreground line-clamp-2">
                              {commit.message}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/30">
                              <span className="truncate max-w-[120px] flex items-center gap-1">
                                <IconUser className="size-2.5" /> {commit.author}
                              </span>
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectCommit(commit.id, 'restore');
                                }}
                              >
                                <IconArrowBackUp data-icon="inline-start" />
                                Restore
                              </Button>
                            </div>
                          </div>
                        </SidebarMenuItem>
                      );
                    })
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-border flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Active HEAD:</span>
              <Badge variant="outline" className="font-mono text-primary font-bold">
                {activeHeadId ? `${activeHeadId.slice(0, 8)}...` : 'None'}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchCommits()} className="w-full">
              <IconRefresh data-icon="inline-start" />
              Refresh Commit Log
            </Button>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Inset: Timeline Viewer & Details */}
        <SidebarInset className="flex-1 flex flex-col bg-background overflow-y-auto">
          {/* Top Bar inside Inset */}
          <header className="h-12 border-b border-border bg-card/40 px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <IconHistory className="size-4 text-primary" />
              <span>Snapshot Inspector</span>
              {statusMessage && (
                <>
                  <Separator orientation="vertical" className="h-3" />
                  <span className="text-primary font-medium">{statusMessage}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === 'timeline' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('timeline')}
              >
                <IconMovie data-icon="inline-start" />
                Timeline View
              </Button>
              <Button
                variant={activeTab === 'json' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('json')}
              >
                <IconCode data-icon="inline-start" />
                JSON
              </Button>
            </div>
          </header>

          <main className="flex-1 p-6 overflow-y-auto">
            {loadingTimeline ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
                  <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Reconstructing timeline state from commit...
                </div>
              </div>
            ) : timeline ? (
              <div className="max-w-4xl mx-auto flex flex-col gap-6">
                {/* Snapshot Header Bar */}
                <Card className="p-6 bg-card/50">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={timeline.is_head ? 'default' : 'secondary'}
                          className="font-mono font-bold"
                        >
                          {timeline.is_head ? 'ACTIVE HEAD' : 'DETACHED PREVIEW'}
                        </Badge>
                        <Badge variant="outline" className="font-mono">
                          <IconClock className="size-3 text-muted-foreground" />
                          Duration: {timeline.total_duration.toFixed(1)}s
                        </Badge>
                      </div>
                      <h2 className="text-2xl font-bold text-foreground tracking-tight">
                        {timeline.message}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground pt-1">
                        <span>
                          Author: <strong className="text-foreground">{timeline.author}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Date: <strong className="text-foreground">{timeline.timestamp}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start md:self-center">
                      {!timeline.is_head && (
                        <Button
                          onClick={() => handleSelectCommit(timeline.commit_id, 'restore')}
                          variant="default"
                        >
                          <IconArrowBackUp data-icon="inline-start" />
                          One-Click Revert (Make HEAD)
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Hashes & Metadata Strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                  <Card className="p-3 bg-card/30">
                    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                      Commit ID
                    </div>
                    <div className="text-foreground font-bold truncate mt-0.5">
                      {timeline.commit_id}
                    </div>
                  </Card>
                  <Card className="p-3 bg-card/30">
                    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                      Timeline Hash
                    </div>
                    <div className="text-primary font-bold truncate mt-0.5">
                      {timeline.timeline_hash}
                    </div>
                  </Card>
                  <Card className="p-3 bg-card/30">
                    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                      Media References
                    </div>
                    <div className="text-foreground font-bold mt-0.5">
                      {timeline.media_refs.length} objects linked
                    </div>
                  </Card>
                </div>

                {/* Tab Content */}
                {activeTab === 'timeline' ? (
                  <Card className="p-6 bg-card/40 flex flex-col gap-6">
                    {/* Time Ruler */}
                    <div className="flex justify-between text-[11px] font-mono text-muted-foreground border-b border-border pb-1">
                      <span>0:00</span>
                      <span>{(timeline.total_duration * 0.25).toFixed(1)}s</span>
                      <span>{(timeline.total_duration * 0.5).toFixed(1)}s</span>
                      <span>{(timeline.total_duration * 0.75).toFixed(1)}s</span>
                      <span>{timeline.total_duration.toFixed(1)}s</span>
                    </div>

                    {/* Multi-Track Editor View */}
                    <div className="flex flex-col gap-4">
                      {timeline.tracks.map((track) => (
                        <div key={track.id} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                            <span className="font-semibold text-foreground">{track.name}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {track.track_type}
                            </Badge>
                          </div>
                          <div className="h-16 bg-background border border-border rounded-xl p-2 relative flex gap-2 overflow-x-auto items-center">
                            {track.clips.map((clip) => {
                              const widthPercent = Math.max(
                                15,
                                (clip.duration / timeline.total_duration) * 100
                              );
                              const isVideo = track.track_type === 'video';

                              return (
                                <div
                                  key={clip.id}
                                  style={{ width: `${widthPercent}%` }}
                                  className={cn(
                                    'h-full rounded-lg p-2 flex flex-col justify-between text-[11px] font-mono select-none transition-all border',
                                    isVideo
                                      ? 'bg-primary/20 border-primary text-foreground'
                                      : 'bg-secondary/40 border-border text-foreground'
                                  )}
                                >
                                  <div className="font-medium truncate font-sans">{clip.name}</div>
                                  <div className="flex justify-between items-center text-[9px] text-muted-foreground">
                                    <span>{clip.duration.toFixed(1)}s</span>
                                    <span className="truncate max-w-[60px] font-mono">
                                      {clip.media_hash.slice(0, 6)}
                                    </span>
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
                      <div className="pt-4 border-t border-border flex flex-col gap-2">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                          Content-Addressed Media Refs (SHA-256)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {timeline.media_refs.map((hash, i) => (
                            <div
                              key={i}
                              className="bg-background border border-border rounded-xl p-2.5 text-xs font-mono flex items-center justify-between text-muted-foreground"
                            >
                              <Badge variant="outline" className="text-[10px]">
                                #{i + 1}
                              </Badge>
                              <span className="text-primary font-bold truncate max-w-[240px]">
                                {hash}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ) : (
                  <Card className="p-4 bg-card/40">
                    <pre className="text-xs font-mono text-primary bg-background p-4 rounded-xl overflow-x-auto max-h-[460px] border border-border">
                      {JSON.stringify(timeline, null, 2)}
                    </pre>
                  </Card>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                Select a commit from the sidebar to preview timeline state.
              </div>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
