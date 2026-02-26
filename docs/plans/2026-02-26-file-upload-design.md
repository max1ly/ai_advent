# File Upload & Display in Chat — Design

## Goal

Allow users to upload any file format to the chat. Display images and videos inline. Show other files as styled pills. Extract text from text-based files and send to the model as part of the message.

## Upload UI

Paperclip/attach button in `ChatInput.tsx` next to the textarea. Native file picker, any format. Selected files appear as removable preview chips above the textarea before sending.

## File Storage

Files stored as BLOBs in SQLite. New `files` table:
- `id` (auto-increment)
- `message_id` (references messages table)
- `session_id` (indexed)
- `filename` (original name)
- `media_type` (MIME type)
- `data` (BLOB — raw file bytes)
- `size` (bytes)
- `created_at`

New API endpoint `GET /api/files/[id]` serves file data with correct `Content-Type` header.

## Message Flow

**Client:** POST to `/api/chat` sends `{ message, sessionId, model, files: [{ filename, mediaType, data (base64) }] }`.

**Server:** Saves files to SQLite. Extracts text from text-based files (txt, csv, code — read as UTF-8). Text content appended to user message as `[File: filename.txt]\n<content>`. Images/videos NOT sent to model — text extraction only.

**Agent:** Receives enriched text message. No changes to `streamText()` — everything stays as text content.

## Chat Display

- **Images** (`image/*`): Inline `<img>`, max 400px wide / 300px tall, loaded from `/api/files/[id]`
- **Videos** (`video/*`): Inline `<video controls>`, same size constraints
- **Other files**: Styled pill/chip with filename, size, file-type icon

File attachments render above text content in user message bubble. No file size limit.

## Files Changed

| File | Change |
|------|--------|
| `lib/db.ts` | Add `files` table, `saveFile()`, `getFile()`, `getMessageFiles()` queries |
| `lib/agent.ts` | Accept files in `chat()`, extract text, append to message |
| `lib/types.ts` | Add `FileAttachment` type, update `DisplayMessage` |
| `app/api/chat/route.ts` | Accept files in POST body, save to DB, pass to agent |
| `app/api/files/[id]/route.ts` | **New** — GET endpoint to serve file BLOBs |
| `app/components/ChatInput.tsx` | Add attach button, file preview chips |
| `app/components/ChatMessage.tsx` | Render images, videos, file pills |
| `app/page.tsx` | Handle file state, send files with messages |

No new dependencies.
