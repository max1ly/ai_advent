# File Templates

## Client component — `app/components/<PascalCase>.tsx`

```tsx
'use client';

import { useState } from 'react';

export interface <Name>Props {
  // typed props here
}

export function <Name>({ /* destructured props */ }: <Name>Props) {
  return (
    <div className="...">
      {/* content */}
    </div>
  );
}
```

## API route — `app/api/<segment>/route.ts`

```ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // delegate to lib/
    const result = await someLibFunction(body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## Streaming API route — `app/api/<segment>/route.ts`

```ts
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

export async function POST(req: Request) {
  const sid = req.headers.get('x-session-id') ?? crypto.randomUUID();
  try {
    const { messages } = await req.json();
    const stream = createUIMessageStream({
      execute: ({ writer }) => runAgent(messages, writer),
    });
    return createUIMessageStreamResponse({ stream, headers: { 'x-session-id': sid } });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => { writer.write({ type: 'error', errorText: errorMessage }); },
    });
    return createUIMessageStreamResponse({ stream, status: 500, headers: { 'x-session-id': sid } });
  }
}
```

## Lib module — `lib/<camelCase>.ts`

```ts
// Named exports only; no default export; no barrel index.ts
export interface FooConfig {
  // ...
}

export function createFoo(config: FooConfig) {
  // ...
}

export async function doSomething(input: string): Promise<string> {
  try {
    // ...
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`doSomething failed: ${message}`);
  }
}
```

## Tool factory — `lib/<domain>/tool.ts`

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const create<Name>Tool = (config: <Name>Config) =>
  tool({
    description: 'Short description used by the model to decide when to call.',
    inputSchema: z.object({
      param: z.string().describe('What this param means'),
    }),
    execute: async ({ param }) => {
      try {
        return { result: await doWork(param) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { result: null, error: message };
      }
    },
  });
```
