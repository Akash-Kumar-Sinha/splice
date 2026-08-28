export interface Commit {
  id: string;
  parent: string | null;
  timestamp: string;
  author: string;
  message: string;
  timeline_hash: string;
  media_refs: string[];
  tags: string[];
}

export interface CommitTreeNode {
  commit: Commit;
  tags: string[];
  depth: number;
  children: CommitTreeNode[];
}

export interface TimelineClip {
  id: string;
  name: string;
  media_hash: string;
  start_time: number;
  duration: number;
  track_index: number;
  in_point?: number;
  out_point?: number;
}


export interface TimelineTrack {
  id: string;
  name: string;
  track_type: string;
  clips: TimelineClip[];
}

export interface Timeline {
  commit_id: string;
  parent_id: string | null;
  timeline_hash: string;
  message: string;
  author: string;
  timestamp: string;
  tracks: TimelineTrack[];
  media_refs: string[];
  mode: 'preview' | 'restore';
  is_head: boolean;
  total_duration: number;
}

export interface ClipRef {
  media: string;
  track_index: number;
  clip_index: number;
}

export interface TimeRange {
  in_point: number;
  out_point: number;
  position: number;
}

export interface TimelineDiff {
  added: ClipRef[];
  removed: ClipRef[];
  moved: [ClipRef, TimeRange, TimeRange][];
  effects_changed: ClipRef[];
  summary: string;
}
