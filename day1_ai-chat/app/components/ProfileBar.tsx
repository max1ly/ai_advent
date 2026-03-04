'use client';

import { useCallback, useEffect, useState } from 'react';

interface Profile {
  id: number;
  name: string;
  description: string;
}

interface ProfileBarProps {
  selectedProfileId: number | null;
  onProfileChange: (profileId: number | null) => void;
}

export default function ProfileBar({ selectedProfileId, onProfileChange }: ProfileBarProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles);
      }
    } catch {
      // silent fail on fetch
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newDescription.trim()) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create profile');
        return;
      }

      const created = await res.json();
      setProfiles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onProfileChange(created.id);
      setNewName('');
      setNewDescription('');
      setIsDialogOpen(false);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [newName, newDescription, onProfileChange]);

  const handleDelete = useCallback(async () => {
    if (!selectedProfileId) return;

    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;

    if (!window.confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/profiles?id=${selectedProfileId}`, { method: 'DELETE' });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== selectedProfileId));
        onProfileChange(null);
      }
    } catch {
      // silent fail
    }
  }, [selectedProfileId, profiles, onProfileChange]);

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm">
        <label className="text-gray-600 font-medium shrink-0">Profile:</label>

        <select
          value={selectedProfileId ?? ''}
          onChange={(e) => onProfileChange(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded bg-white text-sm truncate"
        >
          <option value="">No profile</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setNewName('');
            setNewDescription('');
            setError('');
            setIsDialogOpen(true);
          }}
          className="px-3 py-1.5 rounded text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:scale-105 active:scale-95 transition-all shrink-0"
        >
          Add Profile
        </button>

        {selectedProfileId && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 rounded text-sm text-white bg-gradient-to-r from-red-600 to-rose-600 hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            Delete
          </button>
        )}
      </div>

      {/* Add Profile Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Developer, Tutor, Analyst"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe how the assistant should behave with this profile. For example: Be concise, use code examples, explain step by step..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsDialogOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim() || !newDescription.trim()}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
