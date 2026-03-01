import { NextResponse } from 'next/server';
import { getOrCreateAgent, deleteSession } from '@/lib/sessions';

export async function POST(req: Request) {
  const { sessionId, action, branchId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  if (action === 'new-chat') {
    deleteSession(sessionId);
    return NextResponse.json({ success: true });
  }

  const { agent } = getOrCreateAgent(sessionId);

  switch (action) {
    case 'checkpoint': {
      const branches = agent.createCheckpoint();
      return NextResponse.json({ branches });
    }
    case 'switch-branch': {
      if (!branchId) {
        return NextResponse.json({ error: 'branchId required' }, { status: 400 });
      }
      const result = agent.switchBranch(branchId);
      if (!result) {
        return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
      }
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
