'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconCloudCheck,
  IconCloudUpload,
  IconCloudOff,
  IconAlertCircle,
  IconRefresh,
  IconServer,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface SyncStatusReport {
  state: 'synced' | 'pending' | 'syncing' | 'offline' | 'error';
  pending_count: number;
  last_synced_at: string | null;
  remote_target: string;
  error_message: string | null;
}

export default function SyncStatusPill() {
  const [status, setStatus] = useState<SyncStatusReport | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sync/status`, { cache: 'no-store' });
      if (res.ok) {
        const data: SyncStatusReport = await res.json();
        setStatus(data);
      }
    } catch {
      // Backend may be offline or starting up
      setStatus((prev) =>
        prev
          ? { ...prev, state: 'offline', error_message: 'Cannot reach local Splice server' }
          : null
      );
    }
  }, []);

  // Poll sync status every 3 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleTriggerSync = async () => {
    setIsTriggering(true);
    try {
      const res = await fetch(`${API_URL}/sync/trigger`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (err) {
      console.error('Trigger sync error:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleToggleOffline = async () => {
    if (!status) return;
    const nextOffline = status.state !== 'offline';
    try {
      const res = await fetch(`${API_URL}/sync/offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offline: nextOffline }),
      });
      if (res.ok) {
        const data: SyncStatusReport = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Toggle offline error:', err);
    }
  };

  if (!status) return null;

  const state = status.state;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Interactive Sync Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border shadow-sm',
          state === 'synced' &&
            'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
          state === 'pending' &&
            'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 animate-pulse',
          state === 'syncing' &&
            'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25',
          state === 'offline' &&
            'bg-muted/60 text-muted-foreground border-border hover:bg-muted',
          state === 'error' &&
            'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
        )}
        title="Click to view cloud sync status"
      >
        {state === 'synced' && (
          <>
            <IconCloudCheck className="size-3.5 text-emerald-400" />
            <span>Synced</span>
          </>
        )}
        {state === 'pending' && (
          <>
            <IconCloudUpload className="size-3.5 text-amber-300" />
            <span>{status.pending_count} Pending</span>
          </>
        )}
        {state === 'syncing' && (
          <>
            <Spinner className="size-3.5 text-sky-400" />
            <span>Syncing...</span>
          </>
        )}

        {state === 'offline' && (
          <>
            <IconCloudOff className="size-3.5 text-muted-foreground" />
            <span>Offline ({status.pending_count})</span>
          </>
        )}
        {state === 'error' && (
          <>
            <IconAlertCircle className="size-3.5 text-rose-400" />
            <span>Sync Error</span>
          </>
        )}
      </button>

      {/* Detailed Sync Popover Modal */}
      {isOpen && (
        <Card className="absolute right-0 mt-2 w-80 p-4 bg-popover/95 border border-border shadow-2xl rounded-2xl z-50 flex flex-col gap-3 font-sans backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <IconServer className="size-4 text-primary" />
              <span className="text-xs font-bold text-foreground">Cloud Sync & Outbox</span>
            </div>
            <Badge
              variant={state === 'synced' ? 'default' : 'outline'}
              className="text-[10px] capitalize"
            >
              {state}
            </Badge>
          </div>

          {/* Target & Last Sync Meta */}
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border">
            <div className="flex items-center justify-between">
              <span>Remote:</span>
              <span className="text-foreground font-semibold truncate max-w-[150px]">
                {status.remote_target}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pending in Outbox:</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {status.pending_count} commit(s)
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Synced:</span>
              <span className="text-foreground text-[10px]">
                {status.last_synced_at
                  ? new Date(status.last_synced_at).toLocaleTimeString()
                  : 'Not yet synced'}
              </span>
            </div>
          </div>

          {status.error_message && (
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-start gap-2">
              <IconAlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="truncate">{status.error_message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              onClick={handleTriggerSync}
              disabled={isTriggering || state === 'offline'}
              className="flex-1 text-xs font-bold"
            >
              {isTriggering ? (
                <Spinner className="size-3.5 mr-1.5" />
              ) : (
                <IconRefresh className="size-3.5 mr-1.5" />
              )}
              {isTriggering ? 'Syncing...' : 'Sync Now'}
            </Button>


            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleOffline}
              className="text-xs text-muted-foreground"
              title="Toggle Offline Work Mode"
            >
              {state === 'offline' ? (
                <>
                  <IconWifi className="size-3.5 mr-1 text-emerald-400" /> Go Online
                </>
              ) : (
                <>
                  <IconWifiOff className="size-3.5 mr-1" /> Work Offline
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
