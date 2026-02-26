export interface FileAttachment {
  id: number;
  filename: string;
  mediaType: string;
  size: number;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: FileAttachment[];
}
