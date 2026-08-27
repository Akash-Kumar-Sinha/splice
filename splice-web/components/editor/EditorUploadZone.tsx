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
          "border-2 border-dashed border-border hover:border-primary/80 bg-muted/20 hover:bg-muted/40 rounded-2xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 min-h-[150px]",
          isUploading && "pointer-events-none opacity-90"
        )}
      >
        <IconUpload className="size-7 text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">
          Drag and drop media files here, or click to browse
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Accepts MP4, WebM, MOV. Files will be hashed via SHA-256 and deduped.
        </div>

        {isUploading && (
          <div className="w-full max-w-sm mt-3 bg-card border border-primary/40 rounded-xl p-3 flex flex-col gap-2 shadow-md animate-in fade-in-0 duration-150">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <Spinner className="size-3.5 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate max-w-[200px]">
                  Uploading {uploadFileName || 'media'}...
                </span>
              </div>
              <span className="text-primary font-bold shrink-0 ml-2">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full">
              <ProgressTrack className="h-2 bg-muted rounded-full overflow-hidden">
                <ProgressIndicator className="h-full bg-primary rounded-full transition-all duration-150" />
              </ProgressTrack>
            </Progress>
          </div>
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
