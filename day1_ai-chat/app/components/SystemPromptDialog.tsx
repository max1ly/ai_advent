'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SystemPromptItem } from '@/app/components/SystemPromptSelector';

export interface SystemPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptsChanged: () => void;
}

export function SystemPromptDialog({
  isOpen,
  onClose,
  onPromptsChanged,
}: SystemPromptDialogProps) {
  const [prompts, setPrompts] = useState<SystemPromptItem[]>([]);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/system-prompts');
      if (!res.ok) return;
      const data = await res.json();
      setPrompts(data.prompts ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[SystemPromptDialog] Failed to load:', message);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPrompts().catch(() => {});
    }
  }, [isOpen, loadPrompts]);

  const handleCreate = useCallback(async () => {
    if (!editName.trim() || !editContent.trim()) return;
    try {
      const res = await fetch('/api/system-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), content: editContent.trim() }),
      });
      if (res.ok) {
        setEditName('');
        setEditContent('');
        setIsCreating(false);
        await loadPrompts();
        onPromptsChanged();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[SystemPromptDialog] Create failed:', message);
    }
  }, [editName, editContent, loadPrompts, onPromptsChanged]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/system-prompts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await loadPrompts();
        onPromptsChanged();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[SystemPromptDialog] Delete failed:', message);
    }
  }, [loadPrompts, onPromptsChanged]);

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/system-prompts/${id}/default`, {
        method: 'PUT',
      });
      if (res.ok) {
        await loadPrompts();
        onPromptsChanged();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[SystemPromptDialog] Set default failed:', message);
    }
  }, [loadPrompts, onPromptsChanged]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-label="Manage System Prompts">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold text-gray-800">System Prompts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="border rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-800">
                  {prompt.name}
                  {prompt.isDefault && (
                    <span className="ml-2 text-xs text-green-600 font-normal">(default)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {!prompt.isDefault && (
                    <button
                      onClick={() => handleSetDefault(prompt.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(prompt.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label={`Delete ${prompt.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">
                {prompt.content}
              </p>
            </div>
          ))}

          {prompts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No system prompts yet.</p>
          )}
        </div>

        <div className="border-t p-4">
          {isCreating ? (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Prompt name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
                aria-label="Prompt name"
              />
              <textarea
                placeholder="System prompt content..."
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full border rounded px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                aria-label="Prompt content"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!editName.trim() || !editContent.trim()}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setIsCreating(false); setEditName(''); setEditContent(''); }}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded hover:border-blue-400"
            >
              + New Prompt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
