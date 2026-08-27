'use client';

import React, { useState } from 'react';
import { IconZoomIn, IconGripVertical } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTimestamp } from '@/lib/api';
import { Clip, EditorState, trimClip, moveClip } from '@/lib/editor-state';
import { cn } from '@/lib/utils';

interface EditorTimelineTrackProps {
  clips: Clip[];
  totalDuration: number;
  playhead: number;
  activeClipId: string | null;
  zoomLevel: number;
  onSetZoomLevel: (z: number) => void;
  onSeek: (time: number) => void;
  onSetEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
}

export default function EditorTimelineTrack({
  clips,
  totalDuration,
  playhead,
  activeClipId,
  zoomLevel,
  onSetZoomLevel,
  onSeek,
  onSetEditorState,
}: EditorTimelineTrackProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  return (
    <Card className="border border-border bg-card/80 p-4 rounded-2xl flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-bold uppercase">
            Video Track 1
          </Badge>
          <span className="text-muted-foreground text-[11px]">
            (Drag handles to trim • Press <strong className="text-foreground">S</strong> to split • Drag to reorder)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg border border-border">
            <IconZoomIn className="size-3 text-muted-foreground ml-1.5" />
            {[1, 2, 4].map((z) => (
              <Button
                key={z}
                variant={zoomLevel === z ? 'secondary' : 'ghost'}
                size="icon-xs"
                className="text-[10px] font-mono h-5 px-1.5 w-auto"
                onClick={() => onSetZoomLevel(z)}
                title={`Zoom: ${z === 1 ? 'Fit' : `${z}x`}`}
              >
                {z === 1 ? 'Fit' : `${z}x`}
              </Button>
            ))}
          </div>
          <Badge variant="outline" className="font-mono text-primary font-bold text-[11px]">
            Playhead: {formatTimestamp(playhead)} ({playhead.toFixed(2)}s)
          </Badge>
        </div>
      </div>

      <ScrollArea className="w-full pb-1" orientation="horizontal">
        <div className="relative bg-background/60 border border-border rounded-xl p-3 min-h-[90px] flex items-center min-w-full">
          {clips.length === 0 ? (
            <div className="w-full text-center text-xs font-mono text-muted-foreground py-4">
              Timeline is empty. Import media above to populate track.
            </div>
          ) : (
            <div
              style={{ width: zoomLevel === 1 ? '100%' : `${zoomLevel * 100}%` }}
              className="flex gap-2 min-w-full items-center relative transition-all"
            >
              {clips.map((clip, index) => {
                const clipDur = clip.out_point - clip.in_point;
                const widthPercent = totalDuration > 0 ? (clipDur / totalDuration) * 100 : 100;
                const isActive = activeClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        onSetEditorState((prev) => moveClip(prev, draggedIndex, index));
                        setDraggedIndex(null);
                      }
                    }}
                    style={{ width: `${widthPercent}%`, minWidth: '110px' }}
                    className={cn(
                      'group relative h-16 rounded-xl p-2 flex flex-col justify-between select-none cursor-grab active:cursor-grabbing transition-all border-2',
                      isActive
                        ? 'bg-primary/20 border-primary shadow-md shadow-primary/10'
                        : 'bg-secondary/40 hover:bg-secondary/70 border-border'
                    )}
                    onClick={() => onSeek(clip.position)}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-3.5 bg-primary/40 hover:bg-primary cursor-ew-resize rounded-l-lg flex items-center justify-center transition-colors"
                      title="Trim In-Point"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startIn = clip.in_point;
                        const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
                        const elementWidth = rect?.width || 200;
                        const secondsPerPixel = clipDur / Math.max(1, elementWidth);
                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const deltaSeconds = (moveEvent.clientX - startX) * secondsPerPixel;
                          onSetEditorState((prev) => trimClip(prev, clip.id, 'in', startIn + deltaSeconds));
                        };
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove);
                          window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                      }}
                    >
                      <IconGripVertical className="size-2 text-primary-foreground opacity-80" />
                    </div>

                    <div className="px-2 truncate">
                      <div className="text-xs font-semibold text-foreground truncate font-sans">{clip.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {clipDur.toFixed(1)}s (in: {clip.in_point.toFixed(1)}s, out: {clip.out_point.toFixed(1)}s)
                      </div>
                    </div>

                    <div className="px-2 flex justify-between items-center text-[9px] font-mono text-muted-foreground">
                      <span>pos: {clip.position.toFixed(1)}s</span>
                      <span className="text-primary truncate max-w-[60px]">{clip.media.slice(0, 6)}</span>
                    </div>

                    <div
                      className="absolute right-0 top-0 bottom-0 w-3.5 bg-primary/40 hover:bg-primary cursor-ew-resize rounded-r-lg flex items-center justify-center transition-colors"
                      title="Trim Out-Point"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startOut = clip.out_point;
                        const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
                        const elementWidth = rect?.width || 200;
                        const secondsPerPixel = clipDur / Math.max(1, elementWidth);
                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const deltaSeconds = (moveEvent.clientX - startX) * secondsPerPixel;
                          onSetEditorState((prev) => trimClip(prev, clip.id, 'out', startOut + deltaSeconds));
                        };
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove);
                          window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                      }}
                    >
                      <IconGripVertical className="size-2 text-primary-foreground opacity-80" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
