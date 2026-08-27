'use client';

import React from 'react';
import {
  IconPlus,
  IconMinus,
  IconArrowsExchange,
  IconArrowRight,
  IconSparkles,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { TimelineDiff } from '@/lib/types';

interface DiffDetailsProps {
  diff: TimelineDiff | null;
  loading: boolean;
}

export default function DiffDetails({ diff, loading }: DiffDetailsProps) {
  return (
    <>
      {diff && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono text-xs text-primary">
            <IconSparkles className="size-4 shrink-0" />
            <span>
              <strong>Auto-Generated Commit Note:</strong> &ldquo;{diff.summary}&rdquo;
            </span>
          </div>
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

      {loading ? (
        <div className="py-12 flex items-center justify-center font-mono text-xs text-muted-foreground gap-2">
          <Spinner className="size-5 text-primary" />
          Computing Myers timeline diff...
        </div>
      ) : diff ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center my-1 text-muted-foreground text-xs font-mono gap-2">
            <Separator className="flex-1" />
            <span className="flex items-center gap-1 text-primary bg-background px-3 py-1 rounded-full border border-border">
              <IconArrowRight className="size-3.5" /> Diff Breakdown
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                <IconPlus className="size-3.5" /> Added Clips ({diff.added.length})
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

            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-rose-400 flex items-center gap-1">
                <IconMinus className="size-3.5" /> Removed Clips ({diff.removed.length})
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
          Select two distinct versions above to compute and visualize their differences.
        </div>
      )}
    </>
  );
}
