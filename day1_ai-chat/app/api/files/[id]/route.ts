import { getFile } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fileId = parseInt(id, 10);

  if (isNaN(fileId)) {
    return new Response('Invalid file ID', { status: 400 });
  }

  const file = getFile(fileId);
  if (!file) {
    return new Response('File not found', { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.media_type,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Content-Length': String(file.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
