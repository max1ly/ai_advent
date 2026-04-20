'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SystemPromptItem {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

export interface SystemPromptSelectorProps {
  selectedPromptId: string | null;
  onSelectPrompt: (id: string | null, content: string) => void;
  onManageOpen: () => void;
}

export function SystemPromptSelector({
  selectedPromptId,
  onSelectPrompt,
  onManageOpen,
}: SystemPromptSelectorProps) {
  const [prompts, setPrompts] = useState<SystemPromptItem[]>([]);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/system-prompts');
      if (!res.ok) return;
      const data = await res.json();
      setPrompts(data.prompts ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[SystemPromptSelector] Failed to load:', message);
    }
  }, []);

  useEffect(() => {
    loadPrompts().catch(() => {});
  }, [loadPrompts]);

  // Auto-select default prompt on initial load
  useEffect(() => {
    if (selectedPromptId === null && prompts.length > 0) {
      const defaultPrompt = prompts.find((p) => p.isDefault);
      if (defaultPrompt) {
        onSelectPrompt(defaultPrompt.id, defaultPrompt.content);
      }
    }
  }, [prompts, selectedPromptId, onSelectPrompt]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      if (id === '__manage__') {
        onManageOpen();
        return;
      }
      const prompt = prompts.find((p) => p.id === id);
      if (prompt) {
        onSelectPrompt(prompt.id, prompt.content);
      }
    },
    [prompts, onSelectPrompt, onManageOpen],
  );

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedPromptId ?? ''}
        onChange={handleChange}
        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
        aria-label="System prompt"
      >
        {prompts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.isDefault ? ' (default)' : ''}
          </option>
        ))}
        <option value="__manage__">Manage...</option>
      </select>
    </div>
  );
}
