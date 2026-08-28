import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safePlay(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  try {
    const promise = video.play();
    if (promise !== undefined) {
      promise.catch((err) => {
        if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
          return;
        }
        console.warn('Playback exception:', err);
      });
    }
  } catch {
    // ignore
  }
}

export function safePause(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  try {
    video.pause();
  } catch {
    // ignore
  }
}

