'use client';

import React, { useRef } from 'react';
import { IconUpload } from '@tabler/icons-react';
import { Spinner } from '@/components/ui/spinner';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface EditorUploadZoneProps {
  isUploading: boolean;
  uploadProgress: number;
  uploadFileName: string;
  onFileUpload: (files: FileList | null) => void;
}

export default function EditorUploadZone({
  isUploading,
  uploadProgress,
  uploadFileName,
  onFileUpload,
}: EditorUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFileUpload(e.dataTransfer.files);
        }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          'border border-dashed border-border hover:border-primary/60 bg-muted/10 hover:bg-muted/30 rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 min-h-[120px]',
          isUploading && 'pointer-events-none border-primary/40 bg-primary/5'
        )}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div className="flex items-center gap-2 text-sm">
              <Spinner className="size-4 text-primary" />
              <span className="font-medium text-foreground truncate">
                {uploadFileName || 'Uploading...'}
              </span>
              <span className="text-primary font-bold text-xs">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full">
              <ProgressTrack className="h-1.5 bg-muted rounded-full overflow-hidden">
                <ProgressIndicator className="h-full bg-primary rounded-full transition-all duration-150" />
              </ProgressTrack>
            </Progress>
          </div>
        ) : (
          <>
            <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center">
              <IconUpload className="size-5 text-muted-foreground" />
            </div>
            <div className="text-xs font-medium text-foreground">
              Drop media or click to browse
            </div>
            <div className="text-[11px] text-muted-foreground">
              MP4, WebM, MOV · SHA-256 deduped
            </div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => onFileUpload(e.target.files)}
      />
    </>
  );
}
