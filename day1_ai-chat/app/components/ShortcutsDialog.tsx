'use client';

import { SHORTCUT_DEFINITIONS } from '@/lib/keyboard-shortcuts';

export interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="shortcuts-dialog-backdrop"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close shortcuts dialog"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUT_DEFINITIONS.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">{shortcut.label}</span>
                <p className="text-xs text-gray-500">{shortcut.description}</p>
              </div>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-600">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
