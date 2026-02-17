'use client';

import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

export default function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isDisabled = isLoading || !input.trim();

  return (
    <form onSubmit={handleSubmit} className="bg-white px-4 py-3">
      <div className="flex items-end gap-2">
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
