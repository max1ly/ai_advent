import { NextResponse } from 'next/server';
import { getProfiles, createProfile, deleteProfile } from '@/lib/db';

export async function GET() {
  const profiles = getProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  try {
    const { name, description } = await req.json();

    if (!name?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 },
      );
    }

    const id = createProfile(name.trim(), description.trim());
    return NextResponse.json({ id, name: name.trim(), description: description.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A profile with this name already exists' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Profile id is required' }, { status: 400 });
  }

  deleteProfile(Number(id));
  return NextResponse.json({ success: true });
}
