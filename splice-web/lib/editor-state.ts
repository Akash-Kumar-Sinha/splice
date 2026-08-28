import { TimelineClip } from './types';

export interface Clip {
  id: string;
  media: string;
  in_point: number;
  out_point: number;
  position: number;
  name: string;
  original_duration: number;
}

export interface Track {
  id: string;
  clips: Clip[];
}

export interface EditorState {
  tracks: Track[];
}

export function recalculatePositions(clips: Clip[]): Clip[] {
  let currentPos = 0;
  return clips.map((c) => {
    const duration = Math.max(0.1, c.out_point - c.in_point);
    const updated = { ...c, position: currentPos };
    currentPos += duration;
    return updated;
  });
}

export function addClip(state: EditorState, clip: Clip, trackIndex = 0): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) {
    newTracks[trackIndex] = { id: `track-${trackIndex}`, clips: [] };
  }
  const clips = [...newTracks[trackIndex].clips, clip];
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

export function removeClip(state: EditorState, clipId: string, trackIndex = 0): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips.filter((c) => c.id !== clipId);
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

export function moveClip(
  state: EditorState,
  fromIndex: number,
  toIndex: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = [...newTracks[trackIndex].clips];
  const [moved] = clips.splice(fromIndex, 1);
  if (!moved) return state;
  clips.splice(toIndex, 0, moved);
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

export function trimClip(
  state: EditorState,
  clipId: string,
  edge: 'in' | 'out',
  newTime: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips.map((c) => {
    if (c.id !== clipId) return c;
    if (edge === 'in') {
      const clampedIn = Math.min(Math.max(0, newTime), c.out_point - 0.1);
      return { ...c, in_point: clampedIn };
    } else {
      const maxDur = c.original_duration || c.out_point;
      const clampedOut = Math.max(c.in_point + 0.1, Math.min(newTime, maxDur));
      return { ...c, out_point: clampedOut };
    }
  });
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(clips),
  };
  return { ...state, tracks: newTracks };
}

export function splitClip(
  state: EditorState,
  clipId: string,
  splitVideoTime: number,
  trackIndex = 0
): EditorState {
  const newTracks = [...state.tracks];
  if (!newTracks[trackIndex]) return state;
  const clips = newTracks[trackIndex].clips;
  const targetIndex = clips.findIndex((c) => c.id === clipId);
  if (targetIndex === -1) return state;

  const target = clips[targetIndex];
  if (splitVideoTime <= target.in_point + 0.1 || splitVideoTime >= target.out_point - 0.1) {
    return state;
  }

  const leftClip: Clip = {
    ...target,
    id: `clip-${Date.now()}-a`,
    name: `${target.name} (Part 1)`,
    out_point: splitVideoTime,
  };

  const rightClip: Clip = {
    ...target,
    id: `clip-${Date.now()}-b`,
    name: `${target.name} (Part 2)`,
    in_point: splitVideoTime,
  };

  const newClips = [...clips];
  newClips.splice(targetIndex, 1, leftClip, rightClip);

  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    clips: recalculatePositions(newClips),
  };

  return { ...state, tracks: newTracks };
}

export function getClipInfoAtTime(
  clips: TimelineClip[],
  time: number
): { clip: TimelineClip; offset: number; videoTime: number } | null {
  for (const clip of clips) {
    if (time >= clip.start_time && time < clip.start_time + clip.duration) {
      const offset = time - clip.start_time;
      const inPoint = clip.in_point ?? 0;
      return { clip, offset, videoTime: inPoint + offset };
    }
  }
  if (clips.length > 0) {
    const last = clips[clips.length - 1];
    if (time >= last.start_time + last.duration) {
      const inPoint = last.in_point ?? 0;
      return { clip: last, offset: last.duration, videoTime: inPoint + last.duration };
    }
    const first = clips[0];
    const inPoint = first.in_point ?? 0;
    return { clip: first, offset: 0, videoTime: inPoint };
  }
  return null;
}

