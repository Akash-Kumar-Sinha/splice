'use client';

import React from 'react';
import {
  IconPlus,
  IconMinus,
  IconArrowsExchange,
} from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TimelineDiff } from '@/lib/types';
import { cn } from '@/lib/utils';

interface DiffDetailsProps {
  diff: TimelineDiff | null;
  loading: boolean;
}

export default function DiffDetails({ diff, loading }: DiffDetailsProps) {
  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-xs text-muted-foreground gap-2">
        <Spinner className="size-4" />
        Computing diff...
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="text-center py-6 text-[11px] text-muted-foreground">
        Select two distinct versions to see differences.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="italic">{diff.summary}</span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-1 bg-emerald-500/15 text-emerald-400 border-0">
            <IconPlus className="size-2.5" /> {diff.added.length}
          </Badge>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-1 bg-rose-500/15 text-rose-400 border-0">
            <IconMinus className="size-2.5" /> {diff.removed.length}
          </Badge>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-1 bg-amber-500/15 text-amber-300 border-0">
            <IconArrowsExchange className="size-2.5" /> {diff.moved.length}
          </Badge>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <DiffColumn
          icon={<IconPlus className="size-3" />}
          label="Added"
          count={diff.added.length}
          color="emerald"
          items={diff.added.map((a) => `Track ${a.track_index + 1}, Clip #${a.clip_index + 1}`)}
          emptyText="None"
        />
        <DiffColumn
          icon={<IconMinus className="size-3" />}
          label="Removed"
          count={diff.removed.length}
          color="rose"
          items={diff.removed.map((r) => `Track ${r.track_index + 1}, Clip #${r.clip_index + 1}`)}
          emptyText="None"
        />
        <DiffColumn
          icon={<IconArrowsExchange className="size-3" />}
          label="Modified"
          count={diff.moved.length}
          color="amber"
          items={diff.moved.map(([_m, rangeA, rangeB]) => `${rangeA.out_point.toFixed(1)}s → ${rangeB.out_point.toFixed(1)}s`)}

          emptyText="None"
        />
      </div>
    </div>
  );
}

function DiffColumn({
  icon,
  label,
  count,
  color,
  items,
  emptyText,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'emerald' | 'rose' | 'amber';
  items: string[];
  emptyText: string;
}) {
  const colorMap = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    amber: 'text-amber-300',
  };

  return (
    <div className="bg-muted/20 rounded-lg p-2.5">
      <div className={cn("text-[10px] font-medium flex items-center gap-1 mb-1.5", colorMap[color])}>
        {icon}
        {label} ({count})
      </div>
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        {items.length === 0 ? (
          <span className="italic">{emptyText}</span>
        ) : (
          items.map((item, i) => (
            <div key={i} className="truncate">{item}</div>
          ))
        )}
      </div>
    </div>
  );
}
