export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return isNaN(d.getTime())
      ? isoStr.slice(0, 19).replace('T', ' ')
      : d.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  } catch {
    return isoStr;
  }
}

export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.0';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}
