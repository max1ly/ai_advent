'use client';

import { useEffect } from 'react';
import { registerShortcuts } from '@/lib/keyboard-shortcuts';
import type { ShortcutHandlers } from '@/lib/keyboard-shortcuts';

export interface KeyboardShortcutsProps {
  handlers: ShortcutHandlers;
}

export function KeyboardShortcuts({ handlers }: KeyboardShortcutsProps) {
  useEffect(() => {
    const cleanup = registerShortcuts(handlers);
    return cleanup;
  }, [handlers]);

  return null;
}
