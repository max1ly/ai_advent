import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, readdirSync, statSync } from 'fs';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import { createTwoFilesPatch } from 'diff';
import { chunkDocument } from '@/lib/rag/chunker';
import { embedTexts } from '@/lib/rag/embedder';
import { insertChunks, getIndexedFiles } from '@/lib/rag/store';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 10000;
const MAX_DIFF_CHARS = 8000;
const MAX_FILE_LIST_LINES = 500;
const MAX_FILE_READ_CHARS = 10000;
const MAX_SEARCH_RESULTS = 50;
const MAX_DIFF_DISPLAY_CHARS = 8000;

// --- Pending writes ---

interface PendingWrite {
  id: string;
  path: string;
  content: string;
  diff: string;
  isNewFile: boolean;
  createdAt: number;
}

// Use globalThis to survive Next.js HMR (same pattern as db.ts, mcp/manager.ts)
const globalForPendingWrites = globalThis as unknown as {
  _pendingWrites?: Map<string, PendingWrite>;
};
const pendingWrites = globalForPendingWrites._pendingWrites ?? new Map<string, PendingWrite>();
globalForPendingWrites._pendingWrites = pendingWrites;

const PENDING_WRITE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING_WRITES = 50;

// Accumulated pending writes for the current response cycle
let responsePendingWrites: PendingWrite[] = [];

function cleanExpiredWrites(): void {
  const now = Date.now();
  for (const [id, pw] of pendingWrites) {
    if (now - pw.createdAt > PENDING_WRITE_TTL) {
      pendingWrites.delete(id);
    }
  }
}

export function applyPendingWrite(id: string): { result: string } | { error: string } {
  cleanExpiredWrites();
  const pw = pendingWrites.get(id);
  if (!pw) {
    return { error: 'Pending write not found or expired' };
  }
  try {
    const resolved = validatePath(pw.path);
    const dir = resolve(resolved, '..');
    const { mkdirSync, writeFileSync } = require('fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolved, pw.content, 'utf-8');
    pendingWrites.delete(id);
    console.log(`\x1b[36m[DevAssistant]\x1b[0m Applied write: ${pw.path} (${pw.content.length} chars)`);
    return { result: `File written: ${pw.path} (${pw.content.length} characters)` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Failed to write: ${msg}` };
  }
}

export function rejectPendingWrite(id: string): { result: string } {
  pendingWrites.delete(id);
  return { result: 'Write cancelled' };
}

export function getPendingWritesForResponse(): PendingWrite[] {
  const writes = responsePendingWrites;
  responsePendingWrites = [];
  return writes;
}

// --- Git helper ---

async function runGit(args: string[], maxChars?: number, maxLines?: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: process.cwd(),
      timeout: GIT_TIMEOUT,
      maxBuffer: 1024 * 1024,
    });
    let output = stdout.trim();
    if (maxLines) {
      const lines = output.split('\n');
      if (lines.length > maxLines) {
        output = lines.slice(0, maxLines).join('\n') + `\n[truncated — ${lines.length - maxLines} more lines]`;
      }
    }
    if (maxChars && output.length > maxChars) {
      output = output.slice(0, maxChars) + '\n[truncated]';
    }
    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) return 'Error: git is not installed';
    if (msg.includes('not a git repository')) return 'Error: not a git repository';
    if (msg.includes('TIMEOUT')) return 'Error: git command timed out';
    return `Error: ${msg}`;
  }
}

// --- Path validation ---

function validatePath(userPath: string): string {
  const baseDir = process.cwd();
  const resolved = resolve(baseDir, userPath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Path outside project directory');
  }
  return resolved;
}

// --- Git tools ---

const emptySchema = z.object({});

const commitCountSchema = z.object({
  count: z.number().optional().describe('Number of commits to show (default 10)'),
});

function createGitBranchTool() {
  return tool({
    description: 'Get the current git branch name',
    inputSchema: emptySchema,
    execute: async () => {
      const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
      return { branch };
    },
  });
}

function createGitRecentCommitsTool() {
  return tool({
    description: 'Get recent git commits (one-line format)',
    inputSchema: commitCountSchema,
    execute: async ({ count }: { count?: number }) => {
      const n = count ?? 10;
      const log = await runGit(['log', '--oneline', `-${n}`]);
      return { commits: log };
    },
  });
}

function createGitFileListTool() {
  return tool({
    description: 'List all tracked files in the git repository',
    inputSchema: emptySchema,
    execute: async () => {
      const files = await runGit(['ls-files'], undefined, MAX_FILE_LIST_LINES);
      return { files };
    },
  });
}

function createGitDiffTool() {
  return tool({
    description: 'Show current unstaged and staged git changes',
    inputSchema: emptySchema,
    execute: async () => {
      const unstaged = await runGit(['diff'], MAX_DIFF_CHARS);
      const staged = await runGit(['diff', '--cached'], MAX_DIFF_CHARS);
      const parts: string[] = [];
      if (unstaged) parts.push(`=== Unstaged changes ===\n${unstaged}`);
      if (staged) parts.push(`=== Staged changes ===\n${staged}`);
      return { diff: parts.length > 0 ? parts.join('\n\n') : 'No changes' };
    },
  });
}

// --- File tools ---

const pathSchema = z.object({
  path: z.string().describe('File path relative to project root'),
});

const readFileSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  start_line: z.number().optional().describe('Start reading from this line number (1-based). Omit to read from the beginning.'),
  end_line: z.number().optional().describe('Stop reading at this line number (inclusive). Omit to read to the end or until the character limit.'),
});

const writeFileSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  content: z.string().describe('Content to write to the file'),
});

const listDirSchema = z.object({
  path: z.string().describe('Directory path relative to project root'),
  recursive: z.boolean().optional().describe('List recursively (default false)'),
});

const searchFilesSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  glob: z.string().optional().describe('File glob filter (e.g. "*.tsx")'),
});

function createReadFileTool() {
  return tool({
    description: 'Read a file from the project. Returns content with line numbers. Use start_line/end_line to read specific sections of large files.',
    inputSchema: readFileSchema,
    execute: async ({ path: filePath, start_line, end_line }: { path: string; start_line?: number; end_line?: number }) => {
      try {
        const resolved = validatePath(filePath);
        const content = await readFile(resolved, 'utf-8');
        const allLines = content.split('\n');
        const totalLines = allLines.length;

        // Apply line range if specified
        const startIdx = start_line ? Math.max(0, start_line - 1) : 0;
        const endIdx = end_line ? Math.min(totalLines, end_line) : totalLines;
        const lines = allLines.slice(startIdx, endIdx);

        const numbered = lines.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n');
        if (numbered.length > MAX_FILE_READ_CHARS) {
          return { content: numbered.slice(0, MAX_FILE_READ_CHARS) + `\n[truncated — showing lines ${startIdx + 1}-?, file has ${totalLines} lines total]` };
        }
        const rangeInfo = (start_line || end_line) ? ` (lines ${startIdx + 1}-${endIdx} of ${totalLines})` : (totalLines > 200 ? ` (${totalLines} lines total)` : '');
        return { content: numbered + rangeInfo };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT')) return { content: `Error: file not found — ${filePath}` };
        return { content: `Error: ${msg}` };
      }
    },
  });
}

function createWriteFileTool() {
  return tool({
    description: 'Create or overwrite a file in the project. Creates parent directories if needed. Changes require user approval before being applied.',
    inputSchema: writeFileSchema,
    execute: async ({ path: filePath, content }: { path: string; content: string }) => {
      try {
        const resolved = validatePath(filePath);

        // Read current file content (empty if new file)
        let oldContent = '';
        let isNewFile = true;
        try {
          oldContent = await readFile(resolved, 'utf-8');
          isNewFile = false;
        } catch {
          // File doesn't exist — new file
        }

        // Compute unified diff with 2 lines of context
        let diff = createTwoFilesPatch(
          `a/${filePath}`,
          `b/${filePath}`,
          oldContent,
          content,
          '',
          '',
          { context: 2 },
        );

        // Cap diff output
        if (diff.length > MAX_DIFF_DISPLAY_CHARS) {
          diff = diff.slice(0, MAX_DIFF_DISPLAY_CHARS) + '\n[diff truncated]';
        }

        // Store pending write
        cleanExpiredWrites();
        const id = crypto.randomUUID();

        // FIFO eviction if map is full
        if (pendingWrites.size >= MAX_PENDING_WRITES) {
          const oldestKey = pendingWrites.keys().next().value;
          if (oldestKey) pendingWrites.delete(oldestKey);
        }

        const pw: PendingWrite = { id, path: filePath, content, diff, isNewFile, createdAt: Date.now() };
        pendingWrites.set(id, pw);
        responsePendingWrites.push(pw);

        console.log(`\x1b[36m[DevAssistant]\x1b[0m Pending write: ${filePath} (${content.length} chars, ${isNewFile ? 'new file' : 'update'})`);
        return { result: `Changes prepared for ${filePath}. Awaiting user approval before writing.` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { result: `Error: ${msg}` };
      }
    },
  });
}

function createListDirectoryTool() {
  return tool({
    description: 'List files and directories with metadata (type, size). Non-recursive by default.',
    inputSchema: listDirSchema,
    execute: async ({ path: dirPath, recursive }: { path: string; recursive?: boolean }) => {
      try {
        const resolved = validatePath(dirPath);

        if (recursive) {
          const entries: string[] = [];
          async function walk(dir: string) {
            const items = await readdir(dir, { withFileTypes: true });
            for (const item of items) {
              const full = join(dir, item.name);
              const rel = relative(process.cwd(), full);
              if (item.isDirectory()) {
                entries.push(`[dir]  ${rel}/`);
                await walk(full);
              } else {
                const s = await stat(full);
                entries.push(`[file] ${rel} (${s.size} bytes)`);
              }
            }
          }
          await walk(resolved);
          return { entries: entries.join('\n') || 'Empty directory' };
        }

        const items = await readdir(resolved, { withFileTypes: true });
        const lines: string[] = [];
        for (const item of items) {
          const full = join(resolved, item.name);
          if (item.isDirectory()) {
            lines.push(`[dir]  ${item.name}/`);
          } else {
            const s = await stat(full);
            lines.push(`[file] ${item.name} (${s.size} bytes)`);
          }
        }
        return { entries: lines.join('\n') || 'Empty directory' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT')) return { entries: `Error: directory not found — ${dirPath}` };
        return { entries: `Error: ${msg}` };
      }
    },
  });
}

function createSearchFilesTool() {
  return tool({
    description: 'Search project files for a regex pattern using grep. Returns file:line:content matches, capped at 50 results. Optional glob filter (e.g. "*.tsx").',
    inputSchema: searchFilesSchema,
    execute: async ({ pattern, glob }: { pattern: string; glob?: string }) => {
      try {
        const args = ['-rn', '--color=never', '-I'];
        if (glob) {
          args.push(`--include=${glob}`);
        }
        args.push('--', pattern, '.');

        const { stdout } = await execFileAsync('grep', args, {
          cwd: process.cwd(),
          timeout: GIT_TIMEOUT,
          maxBuffer: 1024 * 1024,
        });

        const lines = stdout.trim().split('\n').filter(Boolean);
        const capped = lines.slice(0, MAX_SEARCH_RESULTS);
        let output = capped.join('\n');
        if (lines.length > MAX_SEARCH_RESULTS) {
          output += `\n[truncated — ${lines.length - MAX_SEARCH_RESULTS} more matches]`;
        }
        return { matches: output, count: lines.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // grep exits with code 1 when no matches found — not an error
        if (msg.includes('exit code 1') || msg.includes('status 1')) {
          return { matches: 'No matches found', count: 0 };
        }
        if (msg.includes('ENOENT')) return { matches: 'Error: grep is not installed', count: 0 };
        if (msg.includes('TIMEOUT')) return { matches: 'Error: search timed out', count: 0 };
        return { matches: `Error: ${msg}`, count: 0 };
      }
    },
  });
}

const editFileSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  old_string: z.string().describe('The exact text to find and replace (must match exactly)'),
  new_string: z.string().describe('The replacement text'),
});

function createEditFileTool() {
  return tool({
    description: 'Edit a file by replacing an exact string match with new content. More efficient than write_file for small changes to large files. The old_string must match exactly (including whitespace and indentation). Use read_file first to see the exact content.',
    inputSchema: editFileSchema,
    execute: async ({ path: filePath, old_string, new_string }: { path: string; old_string: string; new_string: string }) => {
      try {
        const resolved = validatePath(filePath);
        const content = await readFile(resolved, 'utf-8');

        const index = content.indexOf(old_string);
        if (index === -1) {
          return { result: `Error: old_string not found in ${filePath}. Make sure it matches exactly (including whitespace).` };
        }

        // Check for multiple matches
        const secondIndex = content.indexOf(old_string, index + 1);
        if (secondIndex !== -1) {
          return { result: `Error: old_string found multiple times in ${filePath}. Provide more surrounding context to make it unique.` };
        }

        const updated = content.slice(0, index) + new_string + content.slice(index + old_string.length);

        // Compute diff for pending write
        let diff = createTwoFilesPatch(
          `a/${filePath}`,
          `b/${filePath}`,
          content,
          updated,
          '',
          '',
          { context: 2 },
        );

        if (diff.length > MAX_DIFF_DISPLAY_CHARS) {
          diff = diff.slice(0, MAX_DIFF_DISPLAY_CHARS) + '\n[diff truncated]';
        }

        // Store as pending write
        cleanExpiredWrites();
        const id = crypto.randomUUID();
        if (pendingWrites.size >= MAX_PENDING_WRITES) {
          const oldestKey = pendingWrites.keys().next().value;
          if (oldestKey) pendingWrites.delete(oldestKey);
        }

        const pw: PendingWrite = { id, path: filePath, content: updated, diff, isNewFile: false, createdAt: Date.now() };
        pendingWrites.set(id, pw);
        responsePendingWrites.push(pw);

        console.log(`\x1b[36m[DevAssistant]\x1b[0m Pending edit: ${filePath} (replaced ${old_string.length} chars)`);
        return { result: `Edit prepared for ${filePath}. Awaiting user approval before applying.` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT')) return { result: `Error: file not found — ${filePath}` };
        return { result: `Error: ${msg}` };
      }
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDevAssistantTools(): Record<string, ReturnType<typeof tool<any, any>>> {
  return {
    git_current_branch: createGitBranchTool(),
    git_recent_commits: createGitRecentCommitsTool(),
    git_file_list: createGitFileListTool(),
    git_diff: createGitDiffTool(),
    read_file: createReadFileTool(),
    write_file: createWriteFileTool(),
    edit_file: createEditFileTool(),
    list_directory: createListDirectoryTool(),
    search_files: createSearchFilesTool(),
  };
}

// --- Project doc indexing ---

let projectIndexed = false;
let indexedProjectSources: string[] = [];

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return results;
}

export async function indexProjectDocs(): Promise<void> {
  if (projectIndexed) return;

  const root = process.cwd();
  const filesToIndex: { path: string; name: string }[] = [];

  // README.md — skip auto-indexing (user-indexed docs only via /api/index)
  // try {
  //   statSync(join(root, 'README.md'));
  //   filesToIndex.push({ path: join(root, 'README.md'), name: 'README.md' });
  // } catch { /* doesn't exist */ }

  // docs/*.md — skip auto-indexing (user-indexed docs only via /api/index)
  // const docsDir = join(root, 'docs');
  // try {
  //   const entries = readdirSync(docsDir, { withFileTypes: true });
  //   for (const entry of entries) {
  //     if (!entry.isDirectory() && entry.name.endsWith('.md')) {
  //       const fullPath = join(docsDir, entry.name);
  //       filesToIndex.push({ path: fullPath, name: relative(root, fullPath) });
  //     }
  //   }
  // } catch { /* docs/ doesn't exist */ }

  if (filesToIndex.length === 0) {
    console.log('\x1b[36m[DevAssistant]\x1b[0m No project docs found to index');
    projectIndexed = true;
    return;
  }

  // Check which files are already indexed
  const alreadyIndexed = new Set(await getIndexedFiles());
  const newFiles = filesToIndex.filter(f => !alreadyIndexed.has(f.name));

  if (newFiles.length === 0) {
    console.log(`\x1b[36m[DevAssistant]\x1b[0m All ${filesToIndex.length} project docs already indexed`);
    indexedProjectSources = filesToIndex.map(f => f.name);
    projectIndexed = true;
    return;
  }

  console.log(`\x1b[36m[DevAssistant]\x1b[0m Indexing ${newFiles.length} project doc(s)...`);

  for (const file of newFiles) {
    try {
      const text = readFileSync(file.path, 'utf-8');
      if (!text.trim()) continue;

      const chunks = chunkDocument(text, file.name, 'text/markdown');
      if (chunks.length === 0) continue;

      const chunkTexts = chunks.map(c => c.text);
      const embeddings = await embedTexts(chunkTexts);
      await insertChunks(chunks, embeddings);

      console.log(`\x1b[36m[DevAssistant]\x1b[0m Indexed "${file.name}": ${chunks.length} chunks`);
    } catch (err) {
      console.error(`\x1b[31m[DevAssistant]\x1b[0m Failed to index "${file.name}":`, err instanceof Error ? err.message : err);
    }
  }

  indexedProjectSources = filesToIndex.map(f => f.name);
  projectIndexed = true;
}

export function getProjectDocSources(): string[] {
  return indexedProjectSources;
}

export function resetProjectIndex(): void {
  projectIndexed = false;
  indexedProjectSources = [];
}

// --- Diff review ---

const MAX_DIFF_REVIEW_CHARS = 30000;

export async function getDiff(hash1?: string, hash2?: string): Promise<string> {
  if (!hash1) {
    return runGit(['diff'], MAX_DIFF_REVIEW_CHARS);
  }
  if (!hash2) {
    return runGit(['diff', hash1, 'HEAD'], MAX_DIFF_REVIEW_CHARS);
  }
  return runGit(['diff', hash1, hash2], MAX_DIFF_REVIEW_CHARS);
}

export const DIFF_REVIEW_PROMPT = `You are a senior code reviewer. Analyze the git diff and provide a structured review.

Focus on:
1. Potential bugs — logic errors, edge cases, null/undefined risks, race conditions
2. Architectural issues — coupling, separation of concerns, naming, patterns
3. Recommendations — improvements, simplifications, missing error handling

Rules:
- Be specific: reference file names and line numbers from the diff
- Be concise: no more than 10 bullet points total across all sections
- Skip praise — focus only on issues and improvements
- If the diff looks clean, say so briefly
- If the diff is truncated, note which areas you could not review

Format your response as:

## Code Review

### Potential Bugs
- ...

### Architectural Issues
- ...

### Recommendations
- ...`;

// --- System prompt ---

export const DEV_ASSISTANT_PROMPT = `You are a developer assistant with FULL filesystem access to this project. You can read, search, create, and modify any file.

CRITICAL: You HAVE direct access to the project filesystem through your tools. NEVER say you cannot access files, the filesystem, or the codebase. NEVER say "I don't have access" or "I cannot find". You have full read/write access — USE YOUR TOOLS.

Your tools:
- search_files(pattern, glob?) — Grep the codebase for a regex pattern. Use this FIRST to find code.
- read_file(path, start_line?, end_line?) — Read a file's contents with line numbers. Use start_line/end_line to read specific sections of large files.
- edit_file(path, old_string, new_string) — Replace an exact string in a file. PREFERRED for modifying existing files.
- write_file(path, content) — Create a NEW file or fully overwrite a small file. For existing files, use edit_file instead.
- list_directory(path, recursive?) — List files and directories
- search_documents — Search project documentation (RAG)
- git_current_branch, git_recent_commits, git_file_list, git_diff — Git operations

Task patterns — follow these workflows:

FIND something: search_files with a regex → read_file the matches
CHANGE something: search_files to locate → read_file to see context → edit_file(path, old_string, new_string)
CREATE a new file: list_directory + read_file (gather context) → write_file
EXPLAIN code: search_files + read_file → answer directly

Rules:
1. Be autonomous — chain tool calls without asking the user for intermediate steps.
2. ALWAYS use tools to answer questions about code. Never guess from memory.
3. Read files before modifying them — never write blind.
4. For modifying existing files, ALWAYS use edit_file — never rewrite entire files with write_file.
5. The old_string in edit_file must match exactly. Copy it from read_file output (without line numbers).
6. Present results as structured summaries with file paths and line numbers.
7. Do NOT narrate your process. Never say "Let me search..." — just call tools and present results.`;
