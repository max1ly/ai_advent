'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndexingStats } from '@/lib/rag/types';

interface IndexDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDocs: string[];
  onSelectedDocsChange: (docs: string[]) => void;
}

const ACCEPT = '.pdf,.md,.txt,.ts,.js,.py,.tsx,.jsx,.go,.rs,.java,.c,.cpp,.rb';

export default function IndexDialog({ isOpen, onClose, selectedDocs, onSelectedDocsChange }: IndexDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [stats, setStats] = useState<IndexingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexedFiles, setIndexedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch indexed files when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/index')
      .then(res => res.json())
      .then(data => setIndexedFiles(data.files ?? []))
      .catch(() => setIndexedFiles([]));
  }, [isOpen, stats]); // re-fetch after successful indexing (stats changes)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setStats(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0] ?? null;
    if (dropped) {
      setFile(dropped);
      setStats(null);
      setError(null);
    }
  }, []);

  const handleIndex = useCallback(async () => {
    if (!file) return;

    setIsIndexing(true);
    setError(null);
    setStats(null);

    try {
      const base64 = await fileToBase64(file);

      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mediaType: file.type || guessMediaType(file.name),
          data: base64,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Server error: ${res.status}`);
        return;
      }

      setStats(data as IndexingStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to index document');
    } finally {
      setIsIndexing(false);
    }
  }, [file]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isIndexing) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isIndexing, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="index-dialog-title">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 id="index-dialog-title" className="text-lg font-semibold text-gray-800">Index Document</h2>
            <p className="text-xs text-gray-400">Upload a document to chunk, embed, and store</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
          >
            &#x2715;
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-4">
          {/* Indexed files */}
          {indexedFiles.length > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Indexed Documents ({indexedFiles.length})
                </h3>
                <button
                  onClick={() => {
                    if (selectedDocs.length === indexedFiles.length) {
                      onSelectedDocsChange([]);
                    } else {
                      onSelectedDocsChange([...indexedFiles]);
                    }
                  }}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  {selectedDocs.length === indexedFiles.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mb-2">
                {selectedDocs.length === 0 ? 'All documents searched' : `${selectedDocs.length} selected for RAG search`}
              </p>
              <ul className="space-y-1">
                {indexedFiles.map((name) => {
                  const isSelected = selectedDocs.includes(name);
                  return (
                    <li
                      key={name}
                      onClick={() => {
                        if (isSelected) {
                          onSelectedDocsChange(selectedDocs.filter(d => d !== name));
                        } else {
                          onSelectedDocsChange([...selectedDocs, name]);
                        }
                      }}
                      className={`flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-0.5 transition-colors ${
                        isSelected
                          ? 'text-emerald-800 bg-emerald-50'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {name}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* File upload */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div>
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{formatSize(file.size)}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Drop a file here or click to select</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Markdown, Text, Code files</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <h3 className="text-sm font-semibold text-emerald-800 mb-2">Indexing Stats</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">File:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.filename}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Strategy:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.strategy}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Chunks:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.totalChunks}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Avg size:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.avgChunkSize} chars</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Min/Max:</span>{' '}
                    <span className="font-medium text-gray-800">
                      {stats.minChunkSize}/{stats.maxChunkSize}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Dimensions:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.embeddingDimensions}d</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Time:</span>{' '}
                    <span className="font-medium text-gray-800">{stats.timeMs}ms</span>
                  </div>
                </div>
              </div>

              {/* Chunk previews */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Chunk Previews ({stats.previews.length})
                </h3>
                <div className="space-y-2">
                  {stats.previews.map((preview, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
                          #{preview.metadata.chunk_id}
                        </span>
                        {preview.metadata.section && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 rounded text-blue-700">
                            {preview.metadata.section}
                          </span>
                        )}
                        {preview.metadata.start_char !== undefined && preview.metadata.start_char >= 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 rounded text-amber-700">
                            chars {preview.metadata.start_char}-{preview.metadata.end_char}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {preview.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={handleIndex}
            disabled={!file || isIndexing}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg text-sm font-medium hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isIndexing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Indexing...
              </>
            ) : (
              'Index'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'md': return 'text/markdown';
    case 'txt': return 'text/plain';
    case 'ts': case 'tsx': return 'text/typescript';
    case 'js': case 'jsx': return 'text/javascript';
    case 'py': return 'text/x-python';
    default: return 'text/plain';
  }
}
