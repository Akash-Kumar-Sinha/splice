'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconTimeline, IconHistory } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import SyncStatusPill from './SyncStatusPill';
import { Logo } from '@/components/logo/logo';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  headCommitId?: string | null;
  commitCount?: number;
  onOpenStorageModal?: () => void;
}

export default function AppHeader({ headCommitId: _headCommitId, commitCount, onOpenStorageModal }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="h-11 bg-card/60 border-b border-border/60 px-4 flex items-center justify-between shrink-0 backdrop-blur-sm relative z-30">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
          <Logo />
          <span className="font-bold text-[13px] tracking-tight text-foreground">
            Splice
          </span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {[
            { href: '/editor', icon: IconTimeline, label: 'Editor' },
            { href: '/history', icon: IconHistory, label: 'History', count: commitCount },
          ].map(({ href, icon: Icon, label, count }) => (
            <Link key={href} href={href}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 gap-1.5 text-[11px] font-medium rounded-md',
                  pathname === href
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="size-3" />
                {label}
                {count !== undefined && count > 0 && (
                  <span className="text-[9px] text-muted-foreground ml-0.5">{count}</span>
                )}
              </Button>
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        <SyncStatusPill />
        {onOpenStorageModal && (
          <button
            onClick={onOpenStorageModal}
            className="size-1.5 rounded-full bg-emerald-400 hover:bg-emerald-300 transition-colors cursor-pointer"
            title="Storage & GC"
          />
        )}
      </div>
    </header>
  );
}
