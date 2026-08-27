'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  IconDownload,
  IconMovie,
  IconCheck,
  IconAlertCircle,
  IconSparkles,
  IconCpu,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

export type ExportFormatType = 'h264' | 'prores';

export interface ExportJob {
  id: string;
  commit_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  progress: number;
  format: ExportFormatType;
  output_path?: string;
  error?: string;
}

interface ExportDialogProps {
  commitId: string;
  commitMessage: string;
  isOpen: boolean;
  onClose: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ExportDialog({
  commitId,
  commitMessage,
  isOpen,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormatType>('h264');
  const [resolution, setResolution] = useState<'1080p' | '4k' | 'source'>('1080p');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleStartExport = async () => {
    try {
      setIsStarting(true);
      setErrorMsg(null);

      const res = await fetch(`${API_URL}/commits/${commitId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_id: commitId,
          format,
          resolution,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Export failed: ${res.status} ${res.statusText}`);
      }

      const createdJob: ExportJob = await res.json();
      setJob(createdJob);
      setIsStarting(false);

      // Start polling for job status
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_URL}/jobs/${createdJob.id}`);
          if (pollRes.ok) {
            const updatedJob: ExportJob = await pollRes.json();
            setJob(updatedJob);
            if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
            }
          }
        } catch (err) {
          console.warn('Polling export status error:', err);
        }
      }, 500);
    } catch (err: any) {
      console.error('Failed to start export:', err);
      setIsStarting(false);
      setErrorMsg(err.message || 'Failed to start export job');
    }
  };

  const handleReset = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setJob(null);
    setErrorMsg(null);
  };

  if (!isOpen) return null;

  const isCompleted = job?.status === 'completed';
  const isProcessing = job?.status === 'processing' || job?.status === 'queued';
  const isFailed = job?.status === 'failed';
  const progressPercent = Math.round((job?.progress ?? 0) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <IconMovie className="size-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Export Full-Res Video</h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-xs font-mono">
                {commitMessage} ({commitId.slice(0, 7)})
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
          {!job ? (
            <>
              {/* Format Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <IconSparkles className="size-3.5 text-primary" /> Export Codec & Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('h264')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      format === 'h264'
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">H.264 (MP4)</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">Web & Social</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Universally compatible high quality compressed video. Best for sharing & web.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('prores')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      format === 'prores'
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">Apple ProRes 422</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30">Master HQ</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      10-bit broadcast quality master archive. Visually lossless intermediate MOV.
                    </p>
                  </button>
                </div>
              </div>

              {/* Resolution Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <IconCpu className="size-3.5 text-muted-foreground" /> Output Resolution
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '1080p', label: '1080p Full HD', desc: '1920 × 1080' },
                    { id: '4k', label: '4K Ultra HD', desc: '3840 × 2160' },
                    { id: 'source', label: 'Native Source', desc: 'Same as clips' },
                  ].map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => setResolution(res.id as any)}
                      className={`p-2.5 rounded-xl border text-center flex flex-col items-center gap-0.5 transition-all ${
                        resolution === res.id
                          ? 'border-primary bg-primary/10 font-bold text-primary ring-1 ring-primary'
                          : 'border-border bg-background hover:bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      <span className="text-xs">{res.label}</span>
                      <span className="text-[9px] opacity-75 font-mono">{res.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-2 text-destructive text-xs">
                  <IconAlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          ) : (
            /* Active Export Progress State */
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isProcessing && <Spinner className="size-4 text-primary" />}
                  {isCompleted && (
                    <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <IconCheck className="size-3.5" />
                    </div>
                  )}
                  {isFailed && (
                    <div className="size-5 rounded-full bg-destructive/20 text-destructive flex items-center justify-center">
                      <IconAlertCircle className="size-3.5" />
                    </div>
                  )}
                  <span className="font-bold text-xs text-foreground">
                    {isCompleted
                      ? 'Render Complete!'
                      : isFailed
                      ? 'Render Failed'
                      : 'Rendering Timeline Composition...'}
                  </span>
                </div>

                <Badge
                  variant={isCompleted ? 'default' : isFailed ? 'destructive' : 'secondary'}
                  className="text-[10px] uppercase font-mono"
                >
                  {job.status}
                </Badge>
              </div>

              <div className="flex flex-col gap-1.5">
                <Progress value={progressPercent} className="w-full h-2 rounded-full overflow-hidden" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>
                    {format.toUpperCase()} • {resolution.toUpperCase()}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
              </div>

              {isCompleted && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col gap-3 mt-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <IconCheck className="size-4" />
                    <span>Your full-quality video is ready for download!</span>
                  </div>
                  <a
                    href={`${API_URL}/exports/${job.id}/download`}
                    download
                    className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-xs py-2.5 px-4 rounded-xl shadow hover:bg-primary/90 transition-colors"
                  >
                    <IconDownload className="size-4" /> Download Exported Video (
                    {format === 'prores' ? '.MOV' : '.MP4'})
                  </a>
                </div>
              )}

              {isFailed && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
                  <p className="font-semibold">Error during export rendering:</p>
                  <p className="text-[11px] mt-1 font-mono">{job.error || 'Unknown error occurred'}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={job ? handleReset : onClose}
            className="text-xs"
          >
            {job ? 'Back to Config' : 'Cancel'}
          </Button>

          {!job ? (
            <Button
              variant="default"
              size="sm"
              onClick={handleStartExport}
              disabled={isStarting}
              className="font-bold gap-1.5 shadow"
            >
              {isStarting ? <Spinner className="size-3.5" /> : <IconDownload className="size-4" />}
              {isStarting ? 'Starting Export...' : 'Start Full-Res Export'}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
              Close Window
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
