'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { UIMessage } from '@ai-sdk/react';

interface ChatMessageProps {
  message: UIMessage;
}

// Helper to extract text content from UIMessage parts
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part: any) => part.text)
    .join('');
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const role = message.role;
  const content = getTextContent(message);
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-3 text-white shadow-md">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message with markdown rendering
  const components: Components = {
    code({ inline, className, children, ...props }: any) {
      if (inline) {
        return (
          <code
            className="rounded bg-gray-100 px-1 py-0.5"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <pre className="overflow-x-auto rounded-lg bg-gray-100 p-4">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
  };

  return (
    <div className="flex justify-start">
      <div className="prose max-w-none max-w-[80%] rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
