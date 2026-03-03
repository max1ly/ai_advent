import { NextResponse } from 'next/server';
import { memoryManager } from '@/lib/memory';
import {
  getSessionMessages,
  saveProfileEntry,
  deleteProfileEntry,
  deleteSolution,
  deleteKnowledge,
  saveWorkingMemory,
  clearWorkingMemory,
  clearAllMemory,
} from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') ?? '';

  const state = memoryManager.getMemoryState(sessionId);
  const messageCount = sessionId ? getSessionMessages(sessionId).length : 0;

  return NextResponse.json({
    stm: { messageCount },
    workingMemory: state.workingMemory,
    profile: state.profile,
    solutions: state.solutions,
    knowledge: state.knowledge,
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { type, action, data, sessionId } = body;

  try {
    switch (type) {
      case 'profile':
        if (action === 'update') {
          saveProfileEntry(data.key, data.value);
        } else if (action === 'delete') {
          deleteProfileEntry(data.key);
        }
        break;
      case 'solutions':
        if (action === 'delete') {
          deleteSolution(data.id);
        }
        break;
      case 'knowledge':
        if (action === 'delete') {
          deleteKnowledge(data.id);
        }
        break;
      case 'working_memory':
        if (action === 'update' && sessionId) {
          saveWorkingMemory(sessionId, data.task_description, data.progress, data.hypotheses);
        } else if (action === 'delete' && sessionId) {
          clearWorkingMemory(sessionId);
        }
        break;
      default:
        return NextResponse.json({ error: 'Unknown memory type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  clearAllMemory();
  return NextResponse.json({ success: true });
}
