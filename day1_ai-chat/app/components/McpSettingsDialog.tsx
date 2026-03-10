'use client';

import { useCallback, useEffect, useState } from 'react';
import type { McpTransport, McpServerStatus, McpStdioConfig, McpSseConfig } from '@/lib/types';

interface McpSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type AddFormTransport = 'stdio' | 'sse';

interface AddForm {
  name: string;
  transport: AddFormTransport;
  // stdio fields
  command: string;
  args: string;
  env: string;
  // sse fields
  url: string;
  headers: string;
}

const EMPTY_FORM: AddForm = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
};

export default function McpSettingsDialog({ isOpen, onClose }: McpSettingsDialogProps) {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mcp/servers');
      if (!res.ok) throw new Error(`Failed to fetch servers: ${res.status}`);
      const data = await res.json();
      setServers(data.servers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchServers();
    } else {
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    }
  }, [isOpen, fetchServers]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      await fetchServers();
    } catch {
      setError('Failed to toggle server');
    }
  };

  const handleConnect = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}/connect`, { method: 'POST' });
      if (!res.ok) throw new Error('Connect failed');
      await fetchServers();
    } catch {
      setError('Failed to connect server');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error('Disconnect failed');
      await fetchServers();
    } catch {
      setError('Failed to disconnect server');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchServers();
    } catch {
      setError('Failed to delete server');
    }
  };

  const handleAdd = async () => {
    const name = form.name.trim();
    if (!name) return;

    let config: McpStdioConfig | McpSseConfig;
    if (form.transport === 'stdio') {
      const command = form.command.trim();
      if (!command) return;
      const args = form.args.trim() ? form.args.trim().split(/\s+/) : [];
      let env: Record<string, string> | undefined;
      if (form.env.trim()) {
        try {
          env = JSON.parse(form.env.trim());
        } catch {
          setError('Env must be valid JSON (e.g. {"KEY": "value"})');
          return;
        }
      }
      config = { command, args, ...(env ? { env } : {}) };
    } else {
      const url = form.url.trim();
      if (!url) return;
      let headers: Record<string, string> | undefined;
      if (form.headers.trim()) {
        try {
          headers = JSON.parse(form.headers.trim());
        } catch {
          setError('Headers must be valid JSON (e.g. {"Authorization": "Bearer ..."})');
          return;
        }
      }
      config = { url, ...(headers ? { headers } : {}) };
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, transport: form.transport, config }),
      });
      if (!res.ok) throw new Error('Failed to add server');
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const statusDot = (status: McpServerStatus['status']) => {
    const colors: Record<string, string> = {
      connected: 'bg-green-500',
      error: 'bg-red-500',
      disconnected: 'bg-gray-400',
    };
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? 'bg-gray-400'}`}
        title={status}
      />
    );
  };

  const transportBadge = (transport: McpTransport) => (
    <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
      {transport}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">MCP Servers</h2>
            <p className="text-xs text-gray-400">
              {servers.filter((s) => s.status === 'connected').length > 0
                ? `${servers.filter((s) => s.status === 'connected').length} connected`
                : 'No servers connected'}
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
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">
                &#x2715;
              </button>
            </div>
          )}

          {loading && servers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading servers...</p>
          ) : servers.length === 0 && !showAddForm ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No MCP servers configured. Add one to extend AI capabilities with external tools.
            </p>
          ) : (
            <ul className="space-y-2">
              {servers.map((server) => (
                <li
                  key={server.id}
                  className={`p-3 rounded-lg border ${
                    server.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(server.id, server.enabled)}
                      className={`w-8 h-5 rounded-full flex-shrink-0 transition-colors relative ${
                        server.enabled ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          server.enabled ? 'left-3.5' : 'left-0.5'
                        }`}
                      />
                    </button>

                    {/* Status dot + name + transport badge */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {statusDot(server.status)}
                      <span className="text-sm font-medium text-gray-700 truncate">{server.name}</span>
                      {transportBadge(server.transport)}
                      {server.status === 'connected' && server.tools.length > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {server.status === 'connected' ? (
                        <button
                          onClick={() => handleDisconnect(server.id)}
                          className="text-xs px-2 py-1 rounded text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(server.id)}
                          className="text-xs px-2 py-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          disabled={!server.enabled}
                        >
                          Connect
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(server.id)}
                        className="text-gray-300 hover:text-red-500 text-sm"
                      >
                        &#x2715;
                      </button>
                    </div>
                  </div>

                  {/* Error message */}
                  {server.status === 'error' && server.error && (
                    <p className="mt-2 text-xs text-red-500 pl-11">{server.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add Server Form */}
          {showAddForm && (
            <div className="mt-4 p-4 rounded-lg border border-blue-200 bg-blue-50/30 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Add Server</h3>

              {/* Name */}
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Server name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {/* Transport tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {(['stdio', 'sse'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, transport: t })}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                      form.transport === t
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Transport-specific fields */}
              {form.transport === 'stdio' ? (
                <>
                  <input
                    type="text"
                    value={form.command}
                    onChange={(e) => setForm({ ...form, command: e.target.value })}
                    placeholder="Command (e.g. npx)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={form.args}
                    onChange={(e) => setForm({ ...form, args: e.target.value })}
                    placeholder="Arguments (space-separated, e.g. -y @modelcontextprotocol/server-filesystem)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={form.env}
                    onChange={(e) => setForm({ ...form, env: e.target.value })}
                    placeholder='Env vars as JSON (optional, e.g. {"API_KEY": "..."})'
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="SSE endpoint URL (e.g. http://localhost:8080/sse)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={form.headers}
                    onChange={(e) => setForm({ ...form, headers: e.target.value })}
                    placeholder='Headers as JSON (optional, e.g. {"Authorization": "Bearer ..."})'
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </>
              )}

              {/* Form actions */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={submitting || !form.name.trim() || (form.transport === 'stdio' ? !form.command.trim() : !form.url.trim())}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + Add Server
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-center">
              Configure an MCP server to provide additional tools to the AI.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
