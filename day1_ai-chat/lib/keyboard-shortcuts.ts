export interface ShortcutHandlers {
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onCopyLastAssistantMessage: () => void;
  onCloseDialog: () => void;
  onShowHelp: () => void;
}

export interface ShortcutDefinition {
  key: string;
  label: string;
  description: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { key: 'Cmd/Ctrl + K', label: 'New Chat', description: 'Start a new chat session' },
  { key: 'Cmd/Ctrl + /', label: 'Toggle Sidebar', description: 'Show or hide the session history sidebar' },
  { key: 'Cmd/Ctrl + Shift + C', label: 'Copy Last Message', description: 'Copy the last assistant message to clipboard' },
  { key: 'Escape', label: 'Close Dialog', description: 'Close any open dialog or overlay' },
  { key: '?', label: 'Show Shortcuts', description: 'Show this keyboard shortcuts help (when not typing)' },
];

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (active as HTMLElement).isContentEditable;
}

export function registerShortcuts(handlers: ShortcutHandlers): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl + K → new chat
    if (mod && e.key === 'k') {
      e.preventDefault();
      handlers.onNewChat();
      return;
    }

    // Cmd/Ctrl + / → toggle sidebar
    if (mod && e.key === '/') {
      e.preventDefault();
      handlers.onToggleSidebar();
      return;
    }

    // Cmd/Ctrl + Shift + C → copy last assistant message
    if (mod && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      handlers.onCopyLastAssistantMessage();
      return;
    }

    // Escape → close dialog
    if (e.key === 'Escape') {
      handlers.onCloseDialog();
      return;
    }

    // ? → show help (only when not focused on input)
    if (e.key === '?' && !isInputFocused() && !mod && !e.altKey) {
      e.preventDefault();
      handlers.onShowHelp();
      return;
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}
