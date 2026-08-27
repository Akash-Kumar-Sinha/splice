'use client';

import React, { useState, useRef, useCallback } from 'react';
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
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  const handleTrimStart = useCallback(
    (
      e: React.MouseEvent,
      clip: Clip,
      edge: 'in' | 'out'
    ) => {
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startTime = edge === 'in' ? clip.in_point : clip.out_point;

      // Use the total timeline container width for a stable pixels→seconds ratio.
      // This avoids the ratio shifting as the clip itself resizes during trim.
      const containerWidth =
        timelineContainerRef.current?.getBoundingClientRect().width || 800;
      const secondsPerPixel = totalDuration / Math.max(1, containerWidth);

      // Prevent text selection & cursor flicker during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaSeconds =
          (moveEvent.clientX - startX) * secondsPerPixel;
        onSetEditorState((prev) =>
          trimClip(prev, clip.id, edge, startTime + deltaSeconds)
        );
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [totalDuration, onSetEditorState]
  );

  return (
    <Card className="border border-border bg-card/80 rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-[10px] font-bold uppercase h-5"
          >
            Track 1
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatTimestamp(playhead)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            S to split · drag to reorder
          </span>
          <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-md border border-border">
            <IconZoomIn className="size-3 text-muted-foreground mx-1" />
            {[1, 2, 4].map((z) => (
              <Button
                key={z}
                variant={zoomLevel === z ? 'secondary' : 'ghost'}
                size="icon-xs"
                className="text-[10px] h-5 px-1.5 w-auto"
                onClick={() => onSetZoomLevel(z)}
                title={z === 1 ? 'Fit' : `${z}x`}
              >
                {z === 1 ? 'Fit' : `${z}x`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="w-full" orientation="horizontal">
        <div
          ref={timelineContainerRef}
          className="relative bg-background/40 p-3 min-h-[80px] flex items-center min-w-full"
        >
          {clips.length === 0 ? (
            <div className="w-full text-center text-[11px] text-muted-foreground py-4">
              Empty timeline — import media above
            </div>
          ) : (
            <div
              style={{
                width: zoomLevel === 1 ? '100%' : `${zoomLevel * 100}%`,
              }}
              className="flex gap-1.5 min-w-full items-center relative transition-all duration-200"
            >
              {clips.map((clip, index) => {
                const clipDur = clip.out_point - clip.in_point;
                const widthPercent =
                  totalDuration > 0
                    ? (clipDur / totalDuration) * 100
                    : 100;
                const isActive = activeClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (
                        draggedIndex !== null &&
                        draggedIndex !== index
                      ) {
                        onSetEditorState((prev) =>
                          moveClip(prev, draggedIndex, index)
                        );
                        setDraggedIndex(null);
                      }
                    }}
                    style={{
                      width: `${widthPercent}%`,
                      minWidth: '100px',
                    }}
                    className={cn(
                      'group relative h-14 rounded-lg p-2 flex flex-col justify-between select-none cursor-grab active:cursor-grabbing transition-all duration-150',
                      isActive
                        ? 'bg-primary/15 border border-primary/40 shadow-sm'
                        : 'bg-muted/40 hover:bg-muted/60 border border-border/60'
                    )}
                    onClick={() => onSeek(clip.position)}
                  >
                    {/* Trim In handle */}
                    <div
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className="absolute left-0 top-0 bottom-0 w-4 bg-primary/30 hover:bg-primary cursor-ew-resize rounded-l-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 z-10"
                      title="Trim In"
                      onMouseDown={(e) =>
                        handleTrimStart(e, clip, 'in')
                      }
                    >
                      <IconGripVertical className="size-2.5 text-primary-foreground" />
                    </div>

                    <div className="px-1 truncate">
                      <div className="text-[11px] font-medium text-foreground truncate">
                        {clip.name}
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {clipDur.toFixed(1)}s
                      </div>
                    </div>

                    <div className="px-1 flex justify-between items-center text-[8px] text-muted-foreground/60">
                      <span>{clip.position.toFixed(1)}s</span>
                      <span className="text-primary/60 truncate max-w-[50px]">
                        {clip.media.slice(0, 5)}
                      </span>
                    </div>

                    {/* Trim Out handle */}
                    <div
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className="absolute right-0 top-0 bottom-0 w-4 bg-primary/30 hover:bg-primary cursor-ew-resize rounded-r-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 z-10"
                      title="Trim Out"
                      onMouseDown={(e) =>
                        handleTrimStart(e, clip, 'out')
                      }
                    >
                      <IconGripVertical className="size-2.5 text-primary-foreground" />
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
