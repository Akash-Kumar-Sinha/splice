'use client';

import React from 'react';
import { IconGitMerge } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Commit } from '@/lib/types';

interface SquashModalProps {
  commits: Commit[];
  selectedIds: string[];
  squashMessage: string;
  isSquashing: boolean;
  onMessageChange: (msg: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function SquashModal({
  commits,
  selectedIds,
  squashMessage,
  isSquashing,
  onMessageChange,
  onConfirm,
  onClose,
}: SquashModalProps) {
  const selectedCommits = commits
    .filter((c) => selectedIds.includes(c.id))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <IconGitMerge className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Squash Selected Versions</h3>
              <p className="text-xs text-muted-foreground">
                Collapse {selectedIds.length} historical checkpoints into one clean version.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="bg-background/80 border border-border rounded-xl p-3 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          <div className="text-[10px] text-muted-foreground uppercase font-bold">
            Versions to be collapsed ({selectedIds.length}):
          </div>
          {selectedCommits.map((c, idx) => (
            <div key={c.id} className="text-xs flex items-center gap-2 text-foreground">
              <span className="text-primary font-bold">{idx + 1}.</span>
              <span className="truncate flex-1">{c.message}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{c.id.slice(0, 7)}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Squashed Version Message / Summary:
          </label>
          <textarea
            rows={4}
            value={squashMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Describe the combined changes in this squashed version..."
            className="w-full bg-background border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSquashing}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={isSquashing || !squashMessage.trim()}
            className="font-bold gap-1.5 shadow"
          >
            {isSquashing ? <Spinner className="size-3.5" /> : <IconGitMerge className="size-4" />}
            {isSquashing ? 'Squashing...' : 'Confirm Squash'}
          </Button>
        </div>
      </div>
    </div>
  );
}
