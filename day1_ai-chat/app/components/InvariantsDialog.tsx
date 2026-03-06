'use client';

import { useState } from 'react';
import type { Invariant } from '@/lib/types';

interface InvariantsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invariants: Invariant[];
  onUpdate: (invariants: Invariant[]) => void;
}

export default function InvariantsDialog({ isOpen, onClose, invariants, onUpdate }: InvariantsDialogProps) {
  const [newText, setNewText] = useState('');

  if (!isOpen) return null;

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    const inv: Invariant = {
      id: crypto.randomUUID(),
      text,
      enabled: true,
      createdAt: Date.now(),
    };
    onUpdate([...invariants, inv]);
    setNewText('');
  };

  const handleToggle = (id: string) => {
    onUpdate(invariants.map((inv) => inv.id === id ? { ...inv, enabled: !inv.enabled } : inv));
  };

  const handleDelete = (id: string) => {
    onUpdate(invariants.filter((inv) => inv.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const activeCount = invariants.filter((inv) => inv.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Invariants</h2>
            <p className="text-xs text-gray-400">
              {activeCount > 0 ? `${activeCount} active constraint${activeCount !== 1 ? 's' : ''}` : 'No active constraints'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
          >
            &#x2715;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {invariants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No invariants yet. Add constraints the AI must never violate.
            </p>
          ) : (
            <ul className="space-y-2">
              {invariants.map((inv) => (
                <li
                  key={inv.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    inv.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(inv.id)}
                    className={`mt-0.5 w-8 h-5 rounded-full flex-shrink-0 transition-colors relative ${
                      inv.enabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        inv.enabled ? 'left-3.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                  {/* Text */}
                  <span className="text-sm text-gray-700 flex-1">{inv.text}</span>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0"
                  >
                    &#x2715;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new */}
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Always use TypeScript, never JavaScript"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
