import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import { chunkDocument } from '@/lib/rag/chunker';
import { embedTexts } from '@/lib/rag/embedder';
import { insertChunks, getIndexedFiles } from '@/lib/rag/store';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 5000;
const MAX_DIFF_CHARS = 8000;
const MAX_FILE_LIST_LINES = 500;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDevAssistantTools(): Record<string, ReturnType<typeof tool<any, any>>> {
  return {
    git_current_branch: createGitBranchTool(),
    git_recent_commits: createGitRecentCommitsTool(),
    git_file_list: createGitFileListTool(),
    git_diff: createGitDiffTool(),
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

  // README.md
  try {
    statSync(join(root, 'README.md'));
    filesToIndex.push({ path: join(root, 'README.md'), name: 'README.md' });
  } catch { /* doesn't exist */ }

  // docs/*.md (top-level only — skip nested plans/specs/research)
  const docsDir = join(root, 'docs');
  try {
    const entries = readdirSync(docsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && entry.name.endsWith('.md')) {
        const fullPath = join(docsDir, entry.name);
        filesToIndex.push({ path: fullPath, name: relative(root, fullPath) });
      }
    }
  } catch { /* docs/ doesn't exist */ }

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

// --- System prompt ---

export const DEV_ASSISTANT_PROMPT = `You are a developer assistant for the Chat MAX project. Your job is to answer questions about the project's architecture, code, APIs, and current state.

Rules:
1. Use the search_documents tool to find relevant information from project documentation.
2. Use git tools (git_current_branch, git_recent_commits, git_file_list, git_diff) to check live project state when relevant.
3. Answer based on documentation and project context. Be specific — reference file paths, function names, and API endpoints.
4. If you cannot find the answer in the docs or git state, say so clearly.
5. Keep answers concise and developer-focused — no more than 3 paragraphs.
6. Do NOT narrate your search process. Never say "Let me search...", "I'll look...", "Let me check...". Just call the tools silently and then present your answer directly.
7. Use ONLY information from the retrieved documents and git state. Do NOT use your training knowledge.`;
