'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { DisplayMessage, FileAttachment } from '@/lib/types';
import RagSources from './RagSources';
import WriteConfirmDialog from './WriteConfirmDialog';

export interface PendingWriteData {
  writeId: string;
  path: string;
  diff: string;
  isNewFile: boolean;
}

interface ChatMessageProps {
  message: DisplayMessage;
  pendingWrites?: PendingWriteData[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileDisplay({ file }: { file: FileAttachment }) {
  const url = `/api/files/${file.id}`;

  if (file.mediaType.startsWith('image/')) {
    return (
      <img
        src={url}
        alt={file.filename}
        className="max-w-[400px] max-h-[300px] object-contain rounded-lg"
        loading="lazy"
      />
    );
  }

  if (file.mediaType.startsWith('video/')) {
    return (
      <video
        controls
        className="max-w-[400px] max-h-[300px] rounded-lg"
        preload="metadata"
      >
        <source src={url} type={file.mediaType} />
      </video>
    );
  }

  // Generic file pill
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <span className="text-gray-400">📎</span>
      <span className="font-medium text-gray-700 max-w-[200px] truncate">{file.filename}</span>
      <span className="text-gray-400 text-xs">{formatFileSize(file.size)}</span>
    </div>
  );
}

function FileAttachments({ files }: { files: FileAttachment[] }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((file) => (
        <FileDisplay key={file.id} file={file} />
      ))}
    </div>
  );
}

export default function ChatMessage({ message, pendingWrites }: ChatMessageProps) {
  const role = message.role;
  const content = message.content;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-3 text-white shadow-md">
          {message.files && <FileAttachments files={message.files} />}
          {content}
        </div>
      </div>
    );
  }

  // Empty assistant message — loading dots handled by ChatContainer
  if (!content) return null;

  // Assistant message with markdown rendering
  const components: Components = {
    pre({ children, ...props }: any) {
      return (
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4" {...props}>
          {children}
        </pre>
      );
    },
    code({ className, children, ...props }: any) {
      const isBlock = className?.startsWith('language-');
      if (isBlock) {
        return (
          <code className={`text-gray-100 text-sm ${className}`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded bg-gray-800 text-gray-100 px-1.5 py-0.5 text-sm"
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div className="flex justify-start">
      <div className="prose max-w-none max-w-[80%] rounded-2xl rounded-bl-md bg-white shadow-sm border border-gray-100 px-5 py-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
        {pendingWrites && pendingWrites.length > 0 && pendingWrites.map((pw) => (
          <WriteConfirmDialog
            key={pw.writeId}
            writeId={pw.writeId}
            path={pw.path}
            diff={pw.diff}
            isNewFile={pw.isNewFile}
          />
        ))}
        {message.ragSources && message.ragSources.length > 0 && (
          <RagSources sources={message.ragSources} />
        )}
      </div>
    </div>
  );
}
