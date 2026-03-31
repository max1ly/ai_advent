# Chat MAX — Complete Project Overview

## Project Summary

Chat MAX is an AI-powered chat application built as a progressive learning project over 30 days. What began as a minimal LLM chat interface has evolved into a feature-rich platform with multi-model support, RAG (Retrieval-Augmented Generation), MCP (Model Context Protocol) tool integration, memory layers, task state management, and conversation branching.

**Stack:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS v3, Vercel AI SDK v6, SQLite (better-sqlite3), LanceDB (vector store), Ollama (embeddings + local LLM)

**Repository:** Single-page application at `/day1_ai-chat` within the `ai-advent-challenge` monorepo.

---

## Architecture

### High-Level Data Flow

```
User Input (browser)
    │
    ▼
page.tsx (Client Component)
    │  manages all UI state, handles SSE streaming
    │
    ▼
POST /api/chat
    │  receives message, sessionId, model, settings
    │
    ▼
ChatAgent.chat()
    │  orchestrates the entire response pipeline:
    │  ├── file text extraction
    │  ├── task state machine transitions
    │  ├── facts extraction (if strategy=facts)
    │  ├── system prompt assembly (profile + invariants + memory + RAG + task state)
    │  ├── MCP tool registration
    │  ├── RAG tool registration (or pre-search for weak models)
    │  ├── streamText() → LLM API call
    │  ├── onFinish: persist messages, extract memory, parse state signals
    │  └── emit metrics + RAG sources via SSE data events
    │
    ▼
SSE Stream → browser
    │  events: text-delta, data-metrics, data-rag-sources, tool-input-available, error
    │
    ▼
UI updates in real-time
```

### Directory Structure

```
day1_ai-chat/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Main chat page (Client Component, owns all state)
│   ├── layout.tsx                # Root layout (Server Component, metadata)
│   ├── globals.css               # Tailwind base styles
│   ├── api/
│   │   ├── chat/
│   │   │   ├── route.ts          # POST — send message, stream response
│   │   │   ├── [sessionId]/route.ts  # GET — load session history
│   │   │   └── actions/route.ts  # POST — new-chat, checkpoint, switch-branch
│   │   ├── index/route.ts        # GET/POST — RAG document indexing
│   │   ├── files/[id]/route.ts   # GET — serve file attachments
│   │   ├── memory/route.ts       # GET/PUT/DELETE — memory layer CRUD
│   │   ├── profiles/route.ts     # GET/POST/DELETE — user profile management
│   │   └── mcp/
│   │       ├── servers/route.ts          # GET/POST — list/add MCP servers
│   │       ├── servers/[id]/route.ts     # GET — server status
│   │       ├── servers/[id]/connect/route.ts     # POST — connect
│   │       ├── servers/[id]/disconnect/route.ts  # POST — disconnect
│   │       ├── servers/[id]/tools/route.ts       # GET — list tools
│   │       └── tools/execute/route.ts    # POST — execute MCP tool
│   └── components/
│       ├── ChatContainer.tsx     # Scrollable message list
│       ├── ChatInput.tsx         # Text input + file upload
│       ├── ChatMessage.tsx       # Individual message with markdown
│       ├── ModelSelector.tsx     # Model dropdown
│       ├── MetricsDisplay.tsx    # Token metrics + settings controls
│       ├── MemoryDialog.tsx      # Memory layer viewer/editor
│       ├── InvariantsDialog.tsx  # Invariant constraints editor
│       ├── IndexDialog.tsx       # RAG document index manager
│       ├── McpSettingsDialog.tsx # MCP server management UI
│       ├── ToolConfirmDialog.tsx # MCP tool call approval dialog
│       ├── ToolResultMessage.tsx # Tool result display
│       ├── RagSources.tsx        # RAG source citations display
│       ├── ProfileBar.tsx        # User profile selector
│       └── ErrorMessage.tsx      # Error banner with retry
├── lib/
│   ├── agent.ts                  # ChatAgent class — core chat orchestration
│   ├── sessions.ts               # Session management (in-memory Map + SQLite restore)
│   ├── models.ts                 # Model configurations (6 models, 3 providers)
│   ├── deepseek.ts               # DeepSeek provider setup
│   ├── openrouter.ts             # OpenRouter provider setup
│   ├── ollama.ts                 # Ollama provider setup (local LLM)
│   ├── db.ts                     # SQLite database (all tables, CRUD operations)
│   ├── memory.ts                 # MemoryManager — extraction + system prompt injection
│   ├── task-state.ts             # TaskStateMachine — lifecycle management
│   ├── types.ts                  # All TypeScript interfaces
│   ├── mcp/
│   │   ├── manager.ts            # McpManager — server lifecycle + tool routing
│   │   └── client.ts             # McpClientWrapper — protocol wrapper
│   └── rag/
│       ├── types.ts              # Chunk, ChunkMetadata, IndexingStats
│       ├── chunker.ts            # Structure-aware document chunking
│       ├── embedder.ts           # Ollama embedding (nomic-embed-text)
│       ├── store.ts              # LanceDB vector store operations
│       ├── retriever.ts          # Query embedding + vector search
│       ├── reranker.ts           # Cosine similarity reranking
│       └── tool.ts               # search_documents tool factory
├── data/                         # Runtime data (gitignored)
│   ├── chat.db                   # SQLite database
│   └── lancedb/                  # LanceDB vector store
├── mcp-servers/                  # Custom MCP server implementations
├── docs/                         # Design docs, plans, specs
├── .planning/                    # Project management artifacts
└── .claude/rules/                # AI engineering rules
```

---

## Core Systems

### 1. Chat Engine (`lib/agent.ts`)

The `ChatAgent` class is the central orchestrator. One instance exists per session (held in a `Map` in `lib/sessions.ts`).

#### Class: `ChatAgent`

**Constructor options:**
```typescript
interface ChatAgentOptions {
  model?: string;           // Model ID from MODELS array
  systemPrompt?: string;    // Override default system prompt
  sessionId?: string;       // Session identifier
  history?: Message[];       // Restore conversation history
  onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
  strategy?: StrategySettings;  // Context window strategy
  mcpManager?: McpManager;      // MCP tool manager
}
```

**Key methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `chat()` | `(userMessage, files?, profileId?, invariants?, forceToolUse?, ragEnabled?, ragThreshold?, ragTopK?, ragRerank?, ragSourceFilter?) → ReadableStream` | Main entry point. Processes input, builds system prompt, calls LLM, returns SSE stream. |
| `getHistory()` | `() → Message[]` | Returns copy of active conversation history |
| `setModel()` | `(modelId: string) → void` | Switch to a different model mid-session |
| `setStrategy()` | `(settings: StrategySettings) → void` | Change context window strategy |
| `clearHistory()` | `() → void` | Reset all state (history, facts, branches, metrics) |
| `createCheckpoint()` | `() → Branch[]` | Snapshot current history into two branches for A/B exploration |
| `switchBranch()` | `(branchId: string) → { messages, activeBranchId } \| null` | Switch to a different conversation branch |
| `getFacts()` | `() → Record<string, string>` | Get extracted facts (facts strategy only) |
| `getBranches()` | `() → { id, name, messageCount }[]` | List available branches |
| `getTaskState()` | `() → { status, currentStep, planLength, paused }` | Get task state machine status |
| `pauseTask()` / `resumeTask()` / `resetTask()` | `() → void` | Task lifecycle controls |

**Internal pipeline (within `chat()`):**

1. Extract text from file attachments (base64 → UTF-8 for text files)
2. Append to message history
3. Detect task intent → transition state machine if idle
4. Auto-resume if paused
5. Check for plan approval/rejection signals (review/validation states)
6. Create `UIMessageStream` with async execute callback:
   - Run facts extraction if strategy = 'facts' (extra LLM call)
   - Build message window per strategy
   - Assemble system prompt: profile + invariants + base prompt + RAG rules + memory + task state
   - Register MCP tools (no execute handler — client confirms first)
   - Register `search_documents` RAG tool if enabled (auto-execute)
   - For weak models: bypass tool calling, pre-search RAG and inject context directly
   - Call `streamText()` with model, system prompt, messages, tools, temperature, maxOutputTokens
   - `onFinish`: persist to history, update session metrics, parse transition signals, extract memory (fire-and-forget)
   - After stream merge: emit `data-metrics` and `data-rag-sources` events

#### System Prompt Assembly

The system prompt is constructed from multiple sections, concatenated with `\n\n`:

1. **User Profile** — optional persona description from `user_profiles` table
2. **Invariants** — mandatory constraints the LLM must never violate
3. **Base System Prompt** — default language instruction
4. **RAG Rules** — when RAG is enabled, instructions to only use retrieved documents
5. **Memory Layers** — long-term memory (profile, solutions, knowledge) + working memory
6. **Task State** — current task lifecycle state with instructions

### 2. Session Management (`lib/sessions.ts`)

Sessions are managed via an in-memory `Map<string, ChatAgent>`. On first access, if a session ID exists in SQLite, history is restored.

**Functions:**

| Function | Description |
|----------|-------------|
| `getOrCreateAgent(sessionId, model?, strategy?)` | Get existing agent or create new one with restored history |
| `getAgent(sessionId)` | Get agent by ID (returns null if not found) |
| `deleteSession(sessionId)` | Remove agent from memory (SQLite data persists) |

Session IDs are UUIDs generated server-side, sent to client via `x-session-id` response header, and stored in `localStorage`.

### 3. Database (`lib/db.ts`)

SQLite database at `data/chat.db` using `better-sqlite3` with WAL mode for concurrent reads during streaming.

**Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `messages` | Chat history | `session_id`, `role` (user/assistant/system), `content`, `model` |
| `files` | File attachments | `message_id`, `session_id`, `filename`, `media_type`, `data` (BLOB) |
| `working_memory` | Per-session working memory | `session_id` (UNIQUE), `task_description`, `progress`, `hypotheses` |
| `memory_profile` | User profile facts (LTM) | `key` (UNIQUE), `value` |
| `memory_solutions` | Learned procedures (LTM) | `task`, `steps` (JSON), `outcome` |
| `memory_knowledge` | General facts (LTM) | `fact` (UNIQUE), `source` |
| `user_profiles` | Named persona profiles | `name` (UNIQUE), `description` |
| `task_state` | Task lifecycle persistence | `session_id` (PK), `status`, `plan` (JSON), `current_step` |
| `mcp_servers` | MCP server configurations | `id`, `name`, `transport`, `config` (JSON), `enabled` |

**HMR Protection:** Uses `globalThis._db` singleton pattern to prevent multiple connections during Next.js hot module replacement.

**Key CRUD functions exported:**
- Messages: `saveMessage()`, `getSessionMessages()`, `getSessionMessagesWithFiles()`
- Files: `saveFile()`, `getFile()`, `getMessageFiles()`
- Working Memory: `getWorkingMemory()`, `saveWorkingMemory()`, `clearWorkingMemory()`
- Profile: `getProfile()`, `saveProfileEntry()`, `deleteProfileEntry()`
- Solutions: `getSolutions()`, `saveSolution()`, `deleteSolution()`
- Knowledge: `getKnowledge()`, `saveKnowledge()`, `deleteKnowledge()`
- User Profiles: `getProfiles()`, `getProfileById()`, `createProfile()`, `deleteProfile()`
- Task State: `getTaskState()`, `saveTaskState()`, `deleteTaskState()`
- MCP Servers: `getMcpServers()`, `getMcpServer()`, `createMcpServer()`, `updateMcpServer()`, `deleteMcpServer()`

---

## Feature Systems

### 4. Multi-Model Support (`lib/models.ts`)

Six models across three providers, organized by tier:

| Model ID | Label | Tier | Provider | Context | Temperature | Max Output |
|----------|-------|------|----------|---------|-------------|------------|
| `llama3.2:3b` | Llama 3.2 3B (Local) | weak | ollama | 8K | 0.3 | 1024 |
| `google/gemma-3n-e2b-it:free` | Gemma 3n 2B | weak | openrouter | 8K | 0.5 | 1024 |
| `arcee-ai/trinity-mini:free` | Trinity Mini 3B | weak | openrouter | 131K | 0.5 | 1024 |
| `nvidia/nemotron-3-nano-30b-a3b:free` | Nemotron Nano 3B (DEFAULT) | medium | openrouter | 262K | 0.7 | 2048 |
| `stepfun/step-3.5-flash:free` | Step 3.5 Flash | strong | openrouter | 262K | 0.7 | 2048 |
| `deepseek-chat` | DeepSeek Chat (Paid) | strong | deepseek | 128K | 0.7 | 2048 |

**Provider configurations:**
- `lib/deepseek.ts` — `createDeepSeek({ apiKey })` using `@ai-sdk/deepseek`
- `lib/openrouter.ts` — `createOpenRouter({ apiKey })` using `@openrouter/ai-sdk-provider`
- `lib/ollama.ts` — `createOpenAI({ baseURL: ollama/v1 })` using `@ai-sdk/openai` (OpenAI-compatible)

**Model selection logic in ChatAgent:**
```typescript
private getModelInstance() {
  switch (this.modelConfig.provider) {
    case 'openrouter': return openrouter(this.modelConfig.id);
    case 'ollama':     return ollama.chat(this.modelConfig.id);
    default:           return deepseek(this.modelConfig.id);
  }
}
```

### 5. Context Window Strategies (`lib/agent.ts`)

Three strategies for managing conversation context sent to the LLM:

**Sliding Window** (default):
- Sends the last N messages (configurable `windowSize`, default 10)
- Simple, predictable token usage

**Facts Extraction**:
- Before each LLM call, runs a separate `generateText()` call to extract key facts from the conversation into a JSON object
- Injects facts as a preamble before the sliding window
- Extra token cost per exchange (facts extraction call)
- Facts persist across the window boundary

**Branching**:
- Sends entire conversation history (no windowing)
- Supports checkpoints: snapshot current state into two branches (A/B)
- User can switch between branches to explore different conversation paths
- Branches stored in memory, not persisted to SQLite

### 6. Memory System (`lib/memory.ts`)

Four-layer memory system with automatic extraction:

**Working Memory (STM):**
- Per-session, short-term
- Tracks: current task description, progress, hypotheses
- Replaced when a new task is detected

**Profile (LTM):**
- Global, persistent
- Key-value pairs about the user (name, role, expertise, preferences)
- Extracted from explicit user statements only

**Solutions (LTM):**
- Global, persistent
- Completed task procedures (task → steps → outcome)
- Only created when a task is successfully completed

**Knowledge (LTM):**
- Global, persistent
- General facts and domain knowledge from conversations

**Extraction pipeline:**
After each exchange, `memoryManager.extractMemory()` runs as fire-and-forget:
1. Gathers existing memory state
2. Sends user message + existing context to LLM with `MEMORY_EXTRACTION_PROMPT`
3. Parses JSON response with memory updates
4. Applies updates to SQLite via `applyExtraction()`

**System prompt injection:**
`buildSystemPromptSection(sessionId)` assembles memory into the system prompt:
- LTM first (stable context): profile → solutions → knowledge
- Working memory second (volatile context)

### 7. Task State Machine (`lib/task-state.ts`)

Manages multi-step task lifecycle with state persistence:

**States:** `idle` → `planning` → `review` → `execution` → `validation` → `done` / `failed`

**Transitions:**

| From | Signal | To | Description |
|------|--------|----|-------------|
| idle | TASK_START | planning | User states a task intent |
| planning | PLAN_READY | review | LLM produces a numbered plan |
| review | PLAN_APPROVED | execution | User approves the plan |
| review | PLAN_REJECTED | planning | User rejects, LLM replans |
| execution | STEP_COMPLETE | execution | A step finishes (increments counter) |
| execution | VALIDATION_START | validation | All steps done, present results |
| validation | RESULT_APPROVED | done | User accepts the outcome |
| validation | RESULT_REJECTED | execution | User rejects, re-execute |
| done/failed | TASK_START | planning | Start a new task |

**Signal parsing:** LLM output is scanned for bracket signals: `[PLAN_READY]`, `[STEP_COMPLETE:N]`, `[VALIDATION_START]`, `[TASK_DONE]`, `[TASK_FAILED]`

**Intent detection functions:**
- `detectTaskIntent(message)` — matches imperative verbs ("build", "create", "implement"...)
- `detectApprovalIntent(message)` — matches approval phrases ("yes", "go ahead", "lgtm"...)
- `detectRejectionIntent(message)` — matches rejection phrases ("no", "redo", "try again"...)

**System prompt injection:** `buildStatePrompt()` generates context-aware instructions based on current state, including plan display, step tracking, and blocked signal warnings.

### 8. Invariants System

User-defined mandatory constraints injected into the system prompt. The LLM is instructed to:
1. Refuse requests that conflict with invariants
2. State which invariant(s) would be violated
3. Explain the conflict
4. Suggest alternatives

Stored client-side in `localStorage` per session. Sent to server with each message.

### 9. User Profiles

Named personas with custom descriptions. When selected, the profile description is prepended to the system prompt, changing the LLM's behavior/personality.

Stored in SQLite `user_profiles` table. Managed via `/api/profiles` REST endpoint.

---

## RAG System (`lib/rag/`)

Full retrieval-augmented generation pipeline with structure-aware chunking, vector embeddings, and cosine similarity reranking.

### Pipeline Flow

```
Document Upload (IndexDialog UI)
    │
    ▼
POST /api/index
    │  ├── PDF: pdf-parse → text extraction
    │  └── Text/Markdown/Code: Buffer.toString('utf-8')
    │
    ▼
chunkDocument() (lib/rag/chunker.ts)
    │  Structure-aware splitting:
    │  ├── Markdown: split by headings (h1-h3)
    │  ├── Code: split by function/class boundaries
    │  └── Text/PDF: split by paragraphs (double newline)
    │  Sub-splits at sentence boundaries if chunk > 2000 chars
    │
    ▼
embedTexts() (lib/rag/embedder.ts)
    │  Ollama client → nomic-embed-text model
    │  384-dimensional vectors, batch embedding
    │
    ▼
insertChunks() (lib/rag/store.ts)
    │  LanceDB vector database at data/lancedb/
    │  Table: "documents"
    │  Fields: vector, text, source, chunk_id, strategy, section, page, start_char, end_char, indexed_at
    │
    ▼ (at query time)
    │
retrieveRelevant() (lib/rag/retriever.ts)
    │  1. Embed query → nomic-embed-text
    │  2. searchChunks() → LanceDB L2 distance search
    │  3. Optional source filtering (WHERE source IN (...))
    │  4. rerankAndFilter() → cosine similarity reranking
    │  5. Threshold filtering (default 0.3)
    │  6. Return top-K results (default 5)
    │
    ▼
Used by ChatAgent via:
    ├── search_documents tool (strong/medium models — LLM decides when to search)
    └── Pre-search injection (weak models — always search, inject context into system prompt)
```

### Chunking Strategies (`lib/rag/chunker.ts`)

**Markdown:** Splits at `# ## ###` headings. Each section becomes a chunk with the heading as its `section` metadata. Preamble before first heading captured as `(preamble)`.

**Code:** Splits at function/class/const declaration boundaries. Each declaration becomes a chunk with the function/class name as `section`. Imports captured as `(imports)`.

**Text/PDF:** Splits at double-newline paragraph boundaries.

**Sub-splitting:** Any chunk exceeding 2000 characters is further split at sentence boundaries (`.!?\n`).

### Embedding (`lib/rag/embedder.ts`)

- Model: `nomic-embed-text` (384 dimensions)
- Client: Ollama native client (not OpenAI-compatible endpoint)
- Auto-pulls model if not present
- Batch embedding for efficiency

### Vector Store (`lib/rag/store.ts`)

- Database: LanceDB at `data/lancedb/`
- Table: `documents`
- Operations: `insertChunks()`, `searchChunks()`, `getIndexedFiles()`
- Search: L2 distance with optional source filtering via SQL WHERE clause
- Creates table on first insert, appends to existing table thereafter

### Reranking (`lib/rag/reranker.ts`)

- Computes full cosine similarity between query vector and each result's stored vector
- Sorts by cosine similarity descending
- Filters by threshold (removes low-relevance results)
- Falls back to L2 distance ordering on error

### RAG Tool (`lib/rag/tool.ts`)

Factory function `createSearchDocumentsTool(opts?)` creates a parameterized Vercel AI SDK tool:
- Input: `{ query: string }`
- Output: `{ results: Array<{ text, source, section, score }>, query, totalResults }`
- Server-side execution (no user confirmation required)
- Parameters captured in closure per-request: threshold, topK, rerank, sourceFilter

### Weak Model Optimization

For `tier: 'weak'` models (which can't reliably call tools), RAG bypasses tool calling:
1. Pre-searches with the user's query before calling the LLM
2. Injects retrieved context directly into the system prompt as `=== RETRIEVED DOCUMENTS ===`
3. Removes the `search_documents` tool from the tool list
4. LLM answers from injected context instead of deciding when to search

---

## MCP System (`lib/mcp/`)

Model Context Protocol integration for connecting to external tool servers.

### Architecture

```
UI (McpSettingsDialog)
    │  Add/remove/connect/disconnect servers
    │
    ▼
REST API (/api/mcp/*)
    │  CRUD for server configs
    │  Connect/disconnect lifecycle
    │  Tool execution
    │
    ▼
McpManager (lib/mcp/manager.ts) — Singleton
    │  Manages Map<serverId, McpClientWrapper>
    │  Auto-connects enabled servers on startup
    │
    ▼
McpClientWrapper (lib/mcp/client.ts)
    │  Wraps @modelcontextprotocol/sdk Client
    │  Supports stdio and SSE transports
    │
    ▼
MCP Servers (external processes)
    │  Connected via stdio (spawn process) or SSE (HTTP)
    │  Expose tools via MCP protocol
```

### McpManager (`lib/mcp/manager.ts`)

Singleton with HMR protection (`globalThis._mcpManager`).

**Key methods:**

| Method | Description |
|--------|-------------|
| `connect(serverId)` | Connect to MCP server, list its tools |
| `disconnect(serverId)` | Close connection, remove from map |
| `disconnectAll()` | Disconnect all servers |
| `callTool(serverId, toolName, args)` | Call a tool on a specific server |
| `callToolByName(toolName, args)` | Find server with tool and call it |
| `getAllTools()` | Get all tools from all connected servers |
| `getServerStatuses()` | Get status of all configured servers |
| `autoConnectEnabled()` | Auto-connect all enabled servers on startup |

### McpClientWrapper (`lib/mcp/client.ts`)

Wraps the `@modelcontextprotocol/sdk` Client with status tracking.

- Supports `stdio` transport (spawns subprocess) and `sse` transport (HTTP endpoint)
- Tracks connection status: `connected` | `disconnected` | `error`
- Lists available tools after connection
- Handles tool execution with proper error propagation

### Tool Execution Flow

1. LLM decides to call an MCP tool during `streamText()`
2. Tool is registered without an `execute` handler (client-side confirmation required)
3. `tool-input-available` SSE event sent to browser with tool name and args
4. User sees `ToolConfirmDialog` — approves or denies
5. If approved: client POSTs to `/api/mcp/tools/execute`
6. Server calls `mcpManager.callTool()` or `mcpManager.callToolByName()`
7. Result returned to client
8. Client feeds result back to LLM via continuation message
9. LLM can chain additional tool calls (up to 5 in pipeline)

### Tool Chaining & Arg Enrichment

The client tracks pipeline results in `toolChainResultsRef`:
- After each tool result, accumulated data is merged
- On the next tool call, missing args are filled from merged pipeline data
- This prevents the LLM from "forgetting" intermediate results (e.g., a translation from step 1 needed in step 3)
- Pipeline depth limited to 5 steps; after that, `forceToolUse` is disabled

### Server Configuration

Stored in SQLite `mcp_servers` table:
```typescript
interface McpServer {
  id: string;           // UUID
  name: string;         // Display name
  transport: 'stdio' | 'sse';
  config: McpStdioConfig | McpSseConfig;
  enabled: boolean;     // Auto-connect on startup
}
```

**Stdio config:** `{ command: string, args: string[], env?: Record<string, string> }`
**SSE config:** `{ url: string, headers?: Record<string, string> }`

---

## API Reference

### Chat Endpoints

#### `POST /api/chat`

Send a message and receive a streaming SSE response.

**Request body:**
```json
{
  "message": "string",
  "sessionId": "string | null",
  "model": "string",
  "files": [{ "filename": "string", "mediaType": "string", "data": "base64" }],
  "strategy": "sliding-window | facts | branching",
  "windowSize": 10,
  "profileId": "number | undefined",
  "invariants": ["string"],
  "forceToolUse": false,
  "ragEnabled": false,
  "ragThreshold": 0.3,
  "ragTopK": 10,
  "ragRerank": true,
  "ragSourceFilter": ["filename1.md"]
}
```

**Response:** SSE stream with events:
- `text-delta` — `{ delta: "string" }` — LLM output chunk
- `data-metrics` — `{ lastRequest: {...}, session: {...}, taskState: {...} }` — token metrics
- `data-rag-sources` — `[{ text, source, section, score }]` — retrieved documents
- `tool-input-available` — `{ toolName, toolCallId, input }` — MCP tool call request
- `error` — `{ errorText: "string" }` — error event

**Headers:** `x-session-id` — session UUID

#### `GET /api/chat/[sessionId]`

Load session history with file attachments.

**Response:**
```json
{
  "messages": [{
    "role": "user | assistant",
    "content": "string",
    "createdAt": "ISO datetime",
    "files": [{ "id": 1, "filename": "...", "mediaType": "...", "size": 1234 }]
  }]
}
```

#### `POST /api/chat/actions`

Session management actions.

**Actions:**
- `{ sessionId, action: "new-chat" }` — delete session from memory
- `{ sessionId, action: "checkpoint" }` → `{ branches: [...] }` — create A/B branches
- `{ sessionId, action: "switch-branch", branchId }` → `{ messages: [...], activeBranchId }` — switch branch

### RAG Endpoints

#### `GET /api/index`

List all indexed document filenames.

**Response:** `{ files: ["doc1.md", "doc2.pdf"] }`

#### `POST /api/index`

Index a document for RAG retrieval.

**Request body:**
```json
{
  "filename": "string",
  "mediaType": "string",
  "data": "base64-encoded content"
}
```

**Response:** Indexing statistics:
```json
{
  "filename": "...",
  "strategy": "structure-aware",
  "totalChunks": 15,
  "avgChunkSize": 420,
  "minChunkSize": 89,
  "maxChunkSize": 1847,
  "embeddingDimensions": 384,
  "timeMs": 2340,
  "previews": [{ "text": "...", "metadata": {...} }]
}
```

### Memory Endpoints

#### `GET /api/memory?sessionId=...`

Get all memory layers for a session.

**Response:**
```json
{
  "stm": { "messageCount": 12 },
  "workingMemory": { "task_description": "...", "progress": "...", "hypotheses": "..." },
  "profile": [{ "key": "name", "value": "Max" }],
  "solutions": [{ "task": "...", "steps": "[...]", "outcome": "success" }],
  "knowledge": [{ "fact": "...", "source": "conversation" }]
}
```

#### `PUT /api/memory`

Update a specific memory layer.

**Request body:** `{ type: "profile|solutions|knowledge|working_memory", action: "update|delete", data: {...}, sessionId?: "..." }`

#### `DELETE /api/memory`

Clear all memory layers.

### Profile Endpoints

#### `GET /api/profiles`

List all user profiles. **Response:** `{ profiles: [{ id, name, description, created_at }] }`

#### `POST /api/profiles`

Create a profile. **Body:** `{ name, description }` **Response:** `{ id, name, description }`

#### `DELETE /api/profiles?id=N`

Delete a profile by ID.

### File Endpoints

#### `GET /api/files/[id]`

Serve a file attachment by ID. Returns the file with correct `Content-Type` header.

### MCP Endpoints

#### `GET /api/mcp/servers`

List all configured MCP servers with connection status and tools.

#### `POST /api/mcp/servers`

Add a new MCP server. **Body:** `{ name, transport: "stdio|sse", config: {...} }`

#### `GET /api/mcp/servers/[id]`

Get status of a specific server.

#### `POST /api/mcp/servers/[id]/connect`

Connect to a server and list its tools.

#### `POST /api/mcp/servers/[id]/disconnect`

Disconnect from a server.

#### `GET /api/mcp/servers/[id]/tools`

List tools available on a connected server.

#### `POST /api/mcp/tools/execute`

Execute an MCP tool. **Body:** `{ serverId?, toolName, args, callId }`

---

## UI Components

### Page (`app/page.tsx`)

The main Client Component that owns all state:

**State variables:**
- `model`, `strategy`, `windowSize` — model and context settings
- `messages` — `DisplayMessage[]` conversation history
- `status` — `'ready' | 'submitted' | 'streaming'`
- `input`, `pendingFiles` — user input state
- `metrics` — token usage metrics
- `branches`, `activeBranchId` — conversation branching state
- `invariants` — user-defined constraints
- `ragEnabled`, `ragThreshold`, `ragTopK`, `ragRerank`, `ragSourceFilter` — RAG settings
- `pendingToolCall` — MCP tool awaiting user confirmation
- `toolChainDepthRef`, `toolChainResultsRef` — MCP pipeline tracking

**Settings persistence:** All user preferences saved to `localStorage` and restored on mount.

### Component Hierarchy

```
Home (page.tsx)
├── header
│   ├── McpSettingsDialog button
│   ├── ModelSelector
│   └── MetricsDisplay
│       ├── strategy selector
│       ├── window size control
│       ├── new chat / checkpoint / branch buttons
│       ├── memory / invariants / index buttons
│       └── RAG toggle + settings
├── ChatContainer
│   └── ChatMessage (×N)
│       ├── markdown rendering (react-markdown + remark-gfm)
│       └── RagSources (if present)
├── ToolConfirmDialog (conditional)
├── ErrorMessage (conditional)
├── ChatInput
│   ├── textarea (react-textarea-autosize)
│   └── file upload
├── MemoryDialog
├── InvariantsDialog
├── IndexDialog
└── McpSettingsDialog
```

### Key Component Behaviors

**ChatContainer:** Scrollable message area with `data-chat-container` attribute for programmatic scrolling. Auto-scrolls to bottom after history load.

**ChatInput:** Auto-resizing textarea with Enter to send, Shift+Enter for newline. File upload via drag-and-drop or file picker. Shows file previews for images.

**ChatMessage:** Renders markdown via `react-markdown` with `remark-gfm` plugin. Displays RAG source citations via `RagSources` component.

**ToolConfirmDialog:** Shows MCP tool name, server name, and args. User can Allow or Deny. On allow, triggers tool execution and LLM continuation.

**IndexDialog:** Lists indexed documents, allows uploading new documents for RAG indexing. Shows indexing progress and statistics.

---

## TypeScript Interfaces

### Core Types (`lib/types.ts`)

```typescript
// Message display in UI
interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: FileAttachment[];
  ragSources?: RagSource[];
}

// File attachment metadata
interface FileAttachment {
  id: number;
  filename: string;
  mediaType: string;
  size: number;
}

// RAG search result
interface RagSource {
  text: string;
  source: string;    // filename
  section: string;
  score: number;     // cosine similarity (0-1)
}

// Context window strategy
type StrategyType = 'sliding-window' | 'facts' | 'branching';

interface StrategySettings {
  type: StrategyType;
  windowSize: number;
}

// Conversation branch
interface Branch {
  id: string;
  name: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

// Token metrics
interface LastRequestMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  strategyTokens: number;
}

interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalStrategyTokens: number;
  exchanges: number;
}

// Task state machine
type TaskStatus = 'idle' | 'planning' | 'review' | 'execution' | 'validation' | 'done' | 'failed';

interface TaskState {
  sessionId: string;
  status: TaskStatus;
  paused: boolean;
  taskDescription: string | null;
  plan: string[];
  currentStep: number;
  stepResults: StepResult[];
  summary: string | null;
  updatedAt: string;
}

// Memory layers
interface MemoryState {
  workingMemory: WorkingMemoryEntry | null;
  profile: ProfileEntry[];
  solutions: SolutionEntry[];
  knowledge: KnowledgeEntry[];
}

// MCP types
type McpTransport = 'stdio' | 'sse';

interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  config: McpStdioConfig | McpSseConfig;
  enabled: boolean;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
}

// User-defined invariant
interface Invariant {
  id: string;
  text: string;
  enabled: boolean;
  createdAt: number;
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | Yes | — | DeepSeek API key |
| `OPENROUTER_API_KEY` | No | — | OpenRouter API key (for free models) |
| `OLLAMA_HOST` | No | `http://localhost:11434` | Ollama server URL |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` | Override default DeepSeek model |

---

## Development

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server on port 3030 (0.0.0.0) |
| `pnpm build` | Production build |
| `pnpm start` | Production server on port 3030 |
| `pnpm lint` | ESLint |
| `pnpm mcp:dev` | Start all 5 custom MCP servers |

### Prerequisites

- Node.js 18+
- pnpm
- Ollama running locally (for embeddings and local LLM)
- DeepSeek API key (for paid model)
- OpenRouter API key (optional, for free cloud models)

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Tailwind v3 (not v4) | v4 has PostCSS compatibility issues |
| Next.js 15 (not 16) | 16 has Turbopack build bugs |
| Port 3030 | Avoids conflicts with other services |
| SQLite (not Postgres) | Zero-config, embedded, sufficient for single-user |
| LanceDB (not pgvector) | Embedded vector store, no external DB needed |
| Ollama for embeddings | Free, local, no API costs |
| better-sqlite3 (not Prisma) | Direct SQL, no ORM overhead, WAL mode for streaming |

---

## Custom MCP Servers

The project includes 5 custom MCP servers in `mcp-servers/` directory (a cat facts pipeline demo):

1. **cat-facts-fetch** — Fetches random cat facts from an external API
2. **cat-facts-process** — Processes and formats cat facts
3. **cat-facts-store** — Stores facts (simulated persistence)
4. **cat-facts-translate** — Translates facts to other languages
5. **cat-facts-display** — Formats facts for display

These demonstrate MCP server authoring and the tool chaining/pipeline orchestration capability.

---

## Project History (30-Day Development Timeline)

| Day | Feature | Key Changes |
|-----|---------|-------------|
| 1 | First LLM API call | Basic chat with DeepSeek API |
| 5 | Model comparison | Multi-model support, benchmarks |
| 6 | Chat Agent | `ChatAgent` class, session management |
| 7-8 | Token counting | Metrics tracking, context window awareness |
| 9 | Summarization | Context compression strategy |
| 10 | Context strategies | Sliding window, facts, branching |
| 11 | Memory layers | Working memory, profile, solutions, knowledge |
| 12 | User profiles | Named persona system |
| 13 | Task state | State machine for multi-step tasks |
| 14 | Invariants | User-defined constraints |
| 15 | Task gates | Approval/rejection workflow |
| 16 | MCP integration | Model Context Protocol client |
| 17 | MCP server | Custom MCP server authoring |
| 18 | Scheduled MCP | Scheduled tool execution |
| 19 | MCP pipeline | Multi-tool orchestration with arg enrichment |
| 20 | MCP orchestrator | Pipeline completion, force tool use |
| 21 | RAG chunks | Document chunking (structure-aware) |
| 22 | RAG search | Vector embeddings + LanceDB retrieval |
| 23 | RAG reranking | Cosine similarity reranking |
| 24 | RAG sources | Source citation display in UI |
| 25 | RAG production | Weak model optimization, source filtering |
| 26 | Local LLM | Ollama integration (Llama 3.2) |
| 27 | Local LLM optimization | Temperature tuning, output limits |
| 28 | Local LLM + RAG | RAG with local models |
| 29 | LLM temperature | Per-model temperature configuration |
| 30 | Local LLM server | Ollama as AI SDK provider |

---

## Testing

- **Framework:** Vitest 4.x with jsdom environment
- **React testing:** @testing-library/react
- **Test location:** `app/components/__tests__/`
- **Run tests:** `npx vitest run` or `pnpm vitest run`

Current test coverage is minimal (RagSources component test exists).

---

## Deployment

- **Docker:** Multi-stage build with standalone output (see `Dockerfile` and `DEPLOY.md`)
- **Dev server:** `pnpm dev` on port 3030, bound to `0.0.0.0`
- **Production:** `pnpm build && pnpm start`
- **Data persistence:** SQLite at `data/chat.db`, LanceDB at `data/lancedb/`
