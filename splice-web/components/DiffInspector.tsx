'use client';

import React, { useState, useEffect } from 'react';
import {
  IconGitCompare,
  IconPlus,
  IconMinus,
  IconArrowsExchange,
  IconMovie,
  IconArrowRight,
  IconClock,
  IconSparkles,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Commit } from './HistoryPanel';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

export interface TimelineDiff {
  added: ClipRef[];
  removed: ClipRef[];
  moved: [ClipRef, TimeRange, TimeRange][];
  effects_changed: ClipRef[];
  summary: string;
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
  const [loading, setLoading] = useState<boolean>(false);

  const baseCommit = commits.find((c) => c.id === baseCommitId);
  const targetCommit = commits.find((c) => c.id === targetCommitId);

  useEffect(() => {
    if (!baseCommitId || !targetCommitId || baseCommitId === targetCommitId) {
      setDiff(null);
      return;
    }

    const fetchDiff = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/commits/diff?from=${baseCommitId}&to=${targetCommitId}`
        );
        if (res.ok) {
          const data: TimelineDiff = await res.json();
          setDiff(data);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiff();
  }, [baseCommitId, targetCommitId]);

  return (
    <Card className="p-6 bg-card/60 border border-border flex flex-col gap-6 shadow-xl">
      {/* Header with Commit Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <IconGitCompare className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-foreground">Timeline Visual Diff</h3>
              <Badge variant="outline" className="font-mono text-[10px]">
                Strategy Comparator
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Compare structural changes, trimming deltas, and track differences between two saves.
            </p>
          </div>
        </div>

        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕ Close Diff
          </Button>
        )}
      </div>

      {/* Selectors Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Version A */}
        <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Base Version (A)
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {baseCommitId ? `${baseCommitId.slice(0, 8)}...` : 'None'}
            </Badge>
          </div>
          <select
            value={baseCommitId || ''}
            onChange={(e) => onSelectBase(e.target.value)}
            className="w-full bg-card border border-border rounded-lg text-xs font-mono p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select base commit...
            </option>
            {commits.map((c) => (
              <option key={`base-${c.id}`} value={c.id}>
                {c.message} ({c.id.slice(0, 7)})
              </option>
            ))}
          </select>
          {baseCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {baseCommit.author} • {baseCommit.media_refs.length} media items
            </div>
          )}
        </div>

        {/* Target Version B */}
        <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-primary font-semibold">
              Compare Target (B)
            </span>
            <Badge variant="default" className="font-mono text-[10px]">
              {targetCommitId ? `${targetCommitId.slice(0, 8)}...` : 'None'}
            </Badge>
          </div>
          <select
            value={targetCommitId || ''}
            onChange={(e) => onSelectTarget(e.target.value)}
            className="w-full bg-card border border-border rounded-lg text-xs font-mono p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select target commit to compare...
            </option>
            {commits.map((c) => (
              <option key={`target-${c.id}`} value={c.id}>
                {c.message} ({c.id.slice(0, 7)})
              </option>
            ))}
          </select>
          {targetCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {targetCommit.author} • {targetCommit.media_refs.length} media items
            </div>
          )}
        </div>
      </div>

      {/* Auto-Note Summary Banner */}
      {diff && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono text-xs text-primary">
            <IconSparkles className="size-4 shrink-0" />
            <span>
              <strong>Auto-Generated Commit Note:</strong> &ldquo;{diff.summary}&rdquo;
            </span>
          </div>

          {/* Color-Coded Stats Legend */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] gap-1 font-mono">
              <IconPlus className="size-2.5" /> {diff.added.length} Added
            </Badge>
            <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 text-[10px] gap-1 font-mono">
              <IconMinus className="size-2.5" /> {diff.removed.length} Removed
            </Badge>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] gap-1 font-mono">
              <IconArrowsExchange className="size-2.5" /> {diff.moved.length} Modified/Trimmed
            </Badge>
          </div>
        </div>
      )}

      {/* Diff Visual Tracks */}
      {loading ? (
        <div className="py-12 flex items-center justify-center font-mono text-xs text-muted-foreground gap-2">
          <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Computing Myers timeline diff...
        </div>
      ) : diff ? (
        <div className="flex flex-col gap-4">
          {/* Base A Timeline Track Preview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span className="font-semibold text-foreground">
                Base Track A ({baseCommit?.message || 'Version A'})
              </span>
              <span className="text-[10px]">
                {baseCommit?.media_refs.length || 0} clips
              </span>
            </div>
            <div className="h-16 bg-background border border-border rounded-xl p-2 relative flex gap-2 overflow-x-auto items-center">
              {baseCommit?.media_refs.length === 0 ? (
                <div className="w-full text-center text-xs font-mono text-muted-foreground">
                  Empty track
                </div>
              ) : (
                baseCommit?.media_refs.map((hash, idx) => {
                  const isRemoved = diff.removed.some(
                    (r) => r.media === hash || r.clip_index === idx
                  );
                  const isMoved = diff.moved.some(
                    ([m]) => m.media === hash || m.clip_index === idx
                  );

                  return (
                    <div
                      key={`a-${idx}`}
                      className={cn(
                        'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] font-mono border-2 transition-all',
                        isRemoved
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : isMoved
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-secondary/40 border-border text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">Clip #{idx + 1}</span>
                        {isRemoved && (
                          <Badge variant="outline" className="text-[9px] border-rose-500 text-rose-400 px-1 py-0">
                            REMOVED
                          </Badge>
                        )}
                        {isMoved && (
                          <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-300 px-1 py-0">
                            MODIFIED
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[9px] opacity-80">{hash.slice(0, 10)}...</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Transition Indicator */}
          <div className="flex items-center justify-center my-1 text-muted-foreground text-xs font-mono gap-2">
            <Separator className="flex-1" />
            <span className="flex items-center gap-1 text-primary bg-background px-3 py-1 rounded-full border border-border">
              <IconArrowRight className="size-3.5" /> Delta Evolution
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Target B Timeline Track Preview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-primary">
              <span className="font-semibold text-foreground">
                Target Track B ({targetCommit?.message || 'Version B'})
              </span>
              <span className="text-[10px]">
                {targetCommit?.media_refs.length || 0} clips
              </span>
            </div>
            <div className="h-16 bg-background border border-border rounded-xl p-2 relative flex gap-2 overflow-x-auto items-center">
              {targetCommit?.media_refs.length === 0 ? (
                <div className="w-full text-center text-xs font-mono text-muted-foreground">
                  Empty track
                </div>
              ) : (
                targetCommit?.media_refs.map((hash, idx) => {
                  const isAdded = diff.added.some(
                    (a) => a.media === hash || a.clip_index === idx
                  );
                  const isMoved = diff.moved.some(
                    ([m]) => m.media === hash || m.clip_index === idx
                  );

                  return (
                    <div
                      key={`b-${idx}`}
                      className={cn(
                        'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] font-mono border-2 transition-all',
                        isAdded
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : isMoved
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-secondary/40 border-border text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">Clip #{idx + 1}</span>
                        {isAdded && (
                          <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-300 px-1 py-0">
                            ADDED
                          </Badge>
                        )}
                        {isMoved && (
                          <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-300 px-1 py-0">
                            TRIMMED
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[9px] opacity-80">{hash.slice(0, 10)}...</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detailed Changes List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {/* Added */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                <IconPlus className="size-3.5" /> Added ({diff.added.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.added.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.added.map((a, i) => (
                    <div key={i} className="truncate">
                      • Track {a.track_index + 1}, Clip #{a.clip_index + 1}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Removed */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-rose-400 flex items-center gap-1">
                <IconMinus className="size-3.5" /> Removed ({diff.removed.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.removed.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.removed.map((r, i) => (
                    <div key={i} className="truncate">
                      • Track {r.track_index + 1}, Clip #{r.clip_index + 1}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Moved/Trimmed */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-amber-300 flex items-center gap-1">
                <IconArrowsExchange className="size-3.5" /> Modified / Trimmed ({diff.moved.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.moved.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.moved.map(([m, rangeA, rangeB], i) => (
                    <div key={i} className="truncate">
                      • Clip #{m.clip_index + 1}: {rangeA.out_point.toFixed(1)}s → {rangeB.out_point.toFixed(1)}s
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 font-mono text-xs text-muted-foreground">
          Select two distinct commits above to compute and visualize their differences.
        </div>
      )}
    </Card>
  );
}
