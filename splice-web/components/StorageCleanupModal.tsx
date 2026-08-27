'use client';

import React, { useState, useEffect } from 'react';
import {
  IconTrash,
  IconDatabase,
  IconSparkles,
  IconCheck,
  IconAlertCircle,
  IconStar,
  IconClock,
  IconRecycle,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export interface GcReport {
  commits_scanned: number;
  commits_retained: number;
  commits_pruned: number;
  media_scanned: number;
  media_retained: number;
  media_pruned: number;
  bytes_freed: number;
  total_media_bytes: number;
  remaining_media_bytes: number;
  dry_run: boolean;
}

interface StorageCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCleanupCompleted?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = 1;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function StorageCleanupModal({
  isOpen,
  onClose,
  onCleanupCompleted,
}: StorageCleanupModalProps) {
  const [keepStarredForever, setKeepStarredForever] = useState(true);
  const [pruneAfterDays, setPruneAfterDays] = useState(30);
  const [estimate, setEstimate] = useState<GcReport | null>(null);
  const [lastReport, setLastReport] = useState<GcReport | null>(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [isRunningGc, setIsRunningGc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchEstimate = async () => {
    try {
      setIsLoadingEstimate(true);
      setErrorMsg(null);
      const res = await fetch(`${API_URL}/gc/estimate`);
      if (res.ok) {
        const data: GcReport = await res.json();
        setEstimate(data);
      }
    } catch (err: any) {
      console.error('Error fetching GC estimate:', err);
    } finally {
      setIsLoadingEstimate(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEstimate();
      setLastReport(null);
    }
  }, [isOpen]);

  const handleRunCleanup = async () => {
    try {
      setIsRunningGc(true);
      setErrorMsg(null);

      const res = await fetch(`${API_URL}/gc/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keep_starred_forever: keepStarredForever,
          prune_after_days: pruneAfterDays,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `GC failed: ${res.statusText}`);
      }

      const report: GcReport = await res.json();
      setLastReport(report);
      onCleanupCompleted?.();
      fetchEstimate();
    } catch (err: any) {
      console.error('Failed to run GC:', err);
      setErrorMsg(err.message || 'Garbage collection failed');
    } finally {
      setIsRunningGc(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <IconDatabase className="size-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Storage Management & GC</h3>
              <p className="text-[11px] text-muted-foreground">
                Mark-and-Sweep Garbage Collection for saves & media
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Storage Stat Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-background border border-border rounded-xl flex flex-col gap-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Total Media Store</span>
                <IconDatabase className="size-3.5 text-primary" />
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {isLoadingEstimate ? (
                  <Spinner className="size-4" />
                ) : (
                  formatBytes(estimate?.total_media_bytes ?? 0)
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {estimate?.media_scanned ?? 0} content-addressed blobs
              </span>
            </div>

            <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex flex-col gap-1">
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-[11px] font-medium font-semibold">Reclaimable Space</span>
                <IconRecycle className="size-3.5" />
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {isLoadingEstimate ? (
                  <Spinner className="size-4" />
                ) : (
                  formatBytes(estimate?.bytes_freed ?? 0)
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {estimate?.commits_pruned ?? 0} stale saves • {estimate?.media_pruned ?? 0} unreferenced files
              </span>
            </div>
          </div>

          {/* Retention Policy Settings */}
          <div className="p-4 bg-muted/20 border border-border rounded-xl flex flex-col gap-3">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <IconSparkles className="size-3.5 text-primary" /> Retention Policy Rules
            </h4>

            {/* Rule 1: Keep Starred Forever */}
            <label className="flex items-center justify-between cursor-pointer gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2">
                <IconStar className="size-4 text-amber-400 fill-amber-400/20" />
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    Keep Starred Versions Forever
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Starred milestones and picture locks are never pruned
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={keepStarredForever}
                onChange={(e) => setKeepStarredForever(e.target.checked)}
                className="size-4 accent-primary rounded cursor-pointer"
              />
            </label>

            {/* Rule 2: Prune Stale Age */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2">
                <IconClock className="size-4 text-muted-foreground" />
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    Prune Transient Saves Older Than
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Unstarred auto-saves older than this threshold are purged
                  </span>
                </div>
              </div>
              <select
                value={pruneAfterDays}
                onChange={(e) => setPruneAfterDays(Number(e.target.value))}
                className="bg-background border border-border text-xs rounded-lg px-2.5 py-1 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>

          {/* Success / Result Feedback */}
          {lastReport && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-emerald-400 text-xs">
              <IconCheck className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Garbage Collection Completed Successfully!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Freed <strong>{formatBytes(lastReport.bytes_freed)}</strong> by pruning{' '}
                  <strong>{lastReport.commits_pruned}</strong> stale saves and{' '}
                  <strong>{lastReport.media_pruned}</strong> orphaned media files. Remaining storage:{' '}
                  <strong>{formatBytes(lastReport.remaining_media_bytes)}</strong>.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-2 text-destructive text-xs">
              <IconAlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/10">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleRunCleanup}
            disabled={isRunningGc || isLoadingEstimate}
            className="font-bold gap-1.5 shadow bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isRunningGc ? <Spinner className="size-3.5" /> : <IconTrash className="size-4" />}
            {isRunningGc ? 'Collecting Garbage...' : 'Run Cleanup Now'}
          </Button>
        </div>
      </div>
    </div>
  );
}
