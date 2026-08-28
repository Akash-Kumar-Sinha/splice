'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Repository } from './types';
import { API_URL } from './api';

interface RepositoryContextType {
  repositories: Repository[];
  activeRepo: Repository | null;
  isLoading: boolean;
  setActiveRepoId: (id: string) => void;
  createRepository: (name: string, description?: string) => Promise<Repository | null>;
  deleteRepository: (id: string) => Promise<boolean>;
  refreshRepositories: () => Promise<void>;
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeRepoId, setActiveRepoIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRepositories = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/repositories`, { cache: 'no-store' });
      if (res.ok) {
        const data: Repository[] = await res.json();
        setRepositories(data);

        // Auto-select stored or first repo, or create a default if none exist
        if (data.length > 0) {
          const stored = typeof window !== 'undefined' ? localStorage.getItem('splice_active_repo_id') : null;
          const match = stored ? data.find((r) => r.id === stored) : null;
          const selected = match || data[0];
          setActiveRepoIdState(selected.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('splice_active_repo_id', selected.id);
          }
        } else {
          // If no repositories exist at all, auto-create "Main Project"
          try {
            const createRes = await fetch(`${API_URL}/repositories`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Main Project', description: 'Default repository' }),
            });
            if (createRes.ok) {
              const newRepo: Repository = await createRes.json();
              setRepositories([newRepo]);
              setActiveRepoIdState(newRepo.id);
              if (typeof window !== 'undefined') {
                localStorage.setItem('splice_active_repo_id', newRepo.id);
              }
            }
          } catch (createErr) {
            console.error('Error auto-creating default repository:', createErr);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching repositories:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  const setActiveRepoId = useCallback((id: string) => {
    setActiveRepoIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('splice_active_repo_id', id);
    }
  }, []);

  const createRepository = useCallback(async (name: string, description?: string) => {
    try {
      const res = await fetch(`${API_URL}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (res.ok) {
        const newRepo: Repository = await res.json();
        setRepositories((prev) => [newRepo, ...prev]);
        setActiveRepoId(newRepo.id);
        return newRepo;
      }
    } catch (err) {
      console.error('Error creating repository:', err);
    }
    return null;
  }, [setActiveRepoId]);

  const deleteRepository = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/repositories/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRepositories((prev) => {
          const next = prev.filter((r) => r.id !== id);
          if (activeRepoId === id && next.length > 0) {
            setActiveRepoId(next[0].id);
          }
          return next;
        });
        return true;
      }
    } catch (err) {
      console.error('Error deleting repository:', err);
    }
    return false;
  }, [activeRepoId, setActiveRepoId]);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) || repositories[0] || null;

  return (
    <RepositoryContext.Provider
      value={{
        repositories,
        activeRepo,
        isLoading,
        setActiveRepoId,
        createRepository,
        deleteRepository,
        refreshRepositories: fetchRepositories,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepository() {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepository must be used within a RepositoryProvider');
  }
  return context;
}
