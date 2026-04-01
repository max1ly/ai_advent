// .github/scripts/github.ts

import { Octokit } from '@octokit/rest';

// --- Types ---

export interface PrFile {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
}

export interface InlineComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

// --- Client setup ---

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  return new Octokit({ auth: token });
}

function getRepoInfo(): { owner: string; repo: string } {
  const repoStr = process.env.REPO;
  if (!repoStr) throw new Error('REPO env var not set (expected "owner/repo")');
  const [owner, repo] = repoStr.split('/');
  if (!owner || !repo) throw new Error(`Invalid REPO format: "${repoStr}" (expected "owner/repo")`);
  return { owner, repo };
}

function getPrNumber(): number {
  const num = process.env.PR_NUMBER;
  if (!num) throw new Error('PR_NUMBER env var not set');
  const parsed = parseInt(num, 10);
  if (isNaN(parsed)) throw new Error(`Invalid PR_NUMBER: "${num}"`);
  return parsed;
}

// --- Public API ---

const MAX_PATCH_CHARS = 5000;
const MAX_FILES = 50;

/**
 * Fetch changed files for the PR. Skips removed files, binary files,
 * and files with patches exceeding MAX_PATCH_CHARS.
 */
export async function fetchPrFiles(): Promise<PrFile[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();
  const pull_number = getPrNumber();

  console.log(`\x1b[36m[GitHub]\x1b[0m Fetching files for PR #${pull_number}...`);

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
    per_page: 100,
  });

  // Filter and limit
  const reviewable = files.filter((f) => {
    if (f.status === 'removed') return false;
    if (!f.patch) return false; // Binary files have no patch
    if (f.patch.length > MAX_PATCH_CHARS) {
      console.log(`\x1b[33m[GitHub]\x1b[0m Skipping ${f.filename} (patch too large: ${f.patch.length} chars)`);
      return false;
    }
    return true;
  });

  if (files.length > MAX_FILES) {
    console.log(`\x1b[33m[GitHub]\x1b[0m PR has ${files.length} files — reviewing first ${MAX_FILES} only`);
  }

  const result = reviewable.slice(0, MAX_FILES).map((f) => ({
    filename: f.filename,
    status: f.status,
    patch: f.patch,
    additions: f.additions,
    deletions: f.deletions,
  }));

  console.log(`\x1b[36m[GitHub]\x1b[0m ${result.length} files to review (${files.length} total changed)`);
  return result;
}

/**
 * Post a review with inline comments to the PR.
 * Uses event: 'COMMENT' for non-blocking review (no approve/request-changes).
 */
export async function postReview(comments: InlineComment[]): Promise<void> {
  if (comments.length === 0) {
    console.log('\x1b[36m[GitHub]\x1b[0m No comments to post — skipping review');
    return;
  }

  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();
  const pull_number = getPrNumber();

  console.log(`\x1b[36m[GitHub]\x1b[0m Posting review with ${comments.length} inline comments...`);

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    event: 'COMMENT',
    body: `🤖 **AI Code Review** — ${comments.length} finding${comments.length === 1 ? '' : 's'}`,
    comments,
  });

  console.log(`\x1b[32m[GitHub]\x1b[0m Review posted successfully`);
}

/**
 * Post a simple comment on the PR (for errors or summary when no inline comments).
 */
export async function postErrorComment(message: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();
  const pull_number = getPrNumber();

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body: `🤖 **AI Code Review**\n\n${message}`,
  });
}
