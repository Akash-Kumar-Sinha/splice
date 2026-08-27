import { API_URL } from '@/lib/api';
import { Timeline } from '@/lib/types';

export function useRevert(id: string) {
  return async (mode: 'preview' | 'restore'): Promise<Timeline> => {
    const res = await fetch(`${API_URL}/commits/${id}/revert?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to ${mode} commit: ${res.statusText}`);
    }
    return res.json();
  };
}
