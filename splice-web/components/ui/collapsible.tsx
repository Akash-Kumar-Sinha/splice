'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

export function useCollapsible() {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error('useCollapsible must be used within a Collapsible');
  }
  return context;
}

export interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

export function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <CollapsibleContext.Provider
      value={{ open, onOpenChange: handleOpenChange, disabled }}
    >
      <div
        data-state={open ? 'open' : 'closed'}
        data-disabled={disabled ? '' : undefined}
        className={cn(className)}
        {...props}
      >
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export interface CollapsibleTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function CollapsibleTrigger({
  className,
  onClick,
  children,
  ...props
}: CollapsibleTriggerProps) {
  const { open, onOpenChange, disabled } = useCollapsible();

  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={open}
      data-state={open ? 'open' : 'closed'}
      data-disabled={disabled ? '' : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !disabled) {
          onOpenChange(!open);
        }
      }}
      className={cn('cursor-pointer select-none', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export interface CollapsibleContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  forceMount?: boolean;
}

export function CollapsibleContent({
  className,
  children,
  forceMount,
  ...props
}: CollapsibleContentProps) {
  const { open } = useCollapsible();

  if (!open && !forceMount) {
    return null;
  }

  return (
    <div
      data-state={open ? 'open' : 'closed'}
      className={cn('overflow-hidden transition-all', className)}
      {...props}
    >
      {children}
    </div>
  );
}
