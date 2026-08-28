'use client';

import React, { useState } from 'react';
import {
  IconFolder,
  IconFolderPlus,
  IconChevronDown,
  IconCheck,
  IconTrash,
  IconPlus,
} from '@tabler/icons-react';
import { useRepository } from '@/lib/repo-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function RepositorySelector() {
  const { repositories, activeRepo, setActiveRepoId, createRepository, deleteRepository } = useRepository();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createRepository(newRepoName.trim(), newRepoDesc.trim() || undefined);
      if (created) {
        setNewRepoName('');
        setNewRepoDesc('');
        setShowCreateModal(false);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (repositories.length <= 1) {
      alert('Cannot delete the only repository.');
      return;
    }
    if (confirm('Are you sure you want to delete this repository and all its version history?')) {
      await deleteRepository(id);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="h-7 px-2 gap-1.5 text-[11px] font-medium text-foreground bg-muted/40 hover:bg-muted/70 rounded-md border border-border/50 max-w-[200px] inline-flex items-center cursor-pointer transition-colors outline-none">
          <IconFolder className="size-3 text-primary shrink-0" />
          <span className="truncate max-w-[130px] font-semibold">
            {activeRepo ? activeRepo.name : 'Select Project'}
          </span>
          <IconChevronDown className="size-2.5 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>


        <DropdownMenuContent align="start" className="w-56 p-1 bg-card/95 backdrop-blur-md border-border/60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-semibold px-2 py-1 uppercase tracking-wider">
              Repositories & Folders
            </DropdownMenuLabel>

            <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
              {repositories.map((repo) => {
                const isActive = activeRepo?.id === repo.id;
                return (
                  <DropdownMenuItem
                    key={repo.id}
                    onClick={() => setActiveRepoId(repo.id)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <IconFolder className={`size-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="truncate flex flex-col">
                        <span className={`font-medium truncate ${isActive ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                          {repo.name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isActive && <IconCheck className="size-3 text-primary" />}
                      {repositories.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(repo.id, e)}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-opacity"
                          title="Delete repository"
                        >
                          <IconTrash className="size-2.5" />
                        </button>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem

            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-primary cursor-pointer hover:bg-primary/10"
          >
            <IconPlus className="size-3" />
            <span>New Repository...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New Repository Dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm p-0 gap-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                <IconFolderPlus className="size-4" />
              </div>
              <div>
                <DialogTitle>Create Repository</DialogTitle>
                <DialogDescription>
                  Organize your video versions into a project folder.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreate} className="p-6 pt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-foreground/80">Project Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Short Film Cut 1, Commercial Ad"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                className="bg-muted/40 border border-border/60 rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-foreground/80">Description (Optional)</label>
              <input
                type="text"
                placeholder="e.g., 4K Director master cut"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
                className="bg-muted/40 border border-border/60 rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newRepoName.trim() || isCreating}
                className="h-7 text-xs"
              >
                {isCreating ? 'Creating...' : 'Create Folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
