'use client';

import React, { useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

export interface PendingFile {
  file: File;
  preview?: string; // data URL for image previews
}

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  pendingFiles: PendingFile[];
  onFilesSelected: (files: File[]) => void;
  onFileRemove: (index: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  pendingFiles,
  onFilesSelected,
  onFileRemove,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const isDisabled = isLoading || (!input.trim() && pendingFiles.length === 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white px-4 py-3">
      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((pf, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
            >
              {pf.preview ? (
                <img src={pf.preview} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <span className="text-gray-400">📎</span>
              )}
              <span className="max-w-[150px] truncate text-gray-700">{pf.file.name}</span>
              <span className="text-gray-400 text-xs">{formatFileSize(pf.file.size)}</span>
              <button
                type="button"
                onClick={() => onFileRemove(i)}
                className="text-gray-400 hover:text-red-500 ml-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          title="Attach files"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <TextareaAutosize
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={8}
          placeholder="Type a message..."
          className="flex-1 resize-none rounded-full border border-gray-200 px-4 py-2 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          disabled={isDisabled}
          className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
