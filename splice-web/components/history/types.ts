import { Commit, CommitTreeNode } from '@/lib/types';

export interface HistoryPanelState {
  selectedCommitId: string | null;
  activeHeadId: string | null;
  commits: Commit[];
  treeNodes: CommitTreeNode[];
  isDiffMode: boolean;
  diffBaseId: string | null;
  diffTargetId: string | null;
  selectedForSquash: string[];
  hoveredNodeId: string | null;
  collapsedNodeIds: Set<string>;
  statusMessage: string | null;
  timeline: import('@/lib/types').Timeline | null;
  loadingTimeline: boolean;
}

export interface HistoryPanelActions {
  setSelectedCommitId: (id: string | null) => void;
  setActiveHeadId: (id: string | null) => void;
  setIsDiffMode: (v: boolean) => void;
  setDiffBaseId: (id: string | null) => void;
  setDiffTargetId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setStatusMessage: (msg: string | null) => void;
  handleSelectCommit: (commitId: string, mode?: 'preview' | 'restore') => Promise<void>;
  handleToggleSelectForSquash: (commitId: string, e?: React.MouseEvent) => void;
  handleOpenDiffWithCommit: (commitId: string) => void;
  handleToggleStar: (commit: Commit) => Promise<void>;
  toggleCollapseNode: (nodeId: string, e: React.MouseEvent) => void;
  refreshAll: () => Promise<void>;
}
