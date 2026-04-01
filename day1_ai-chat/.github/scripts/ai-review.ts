// .github/scripts/ai-review.ts
//
// GitHub Action AI Code Review
// Triggered on PR open/synchronize. Reviews changed files using
// an LLM (OpenRouter) with RAG context from project docs.

import * as fs from 'fs';
import * as path from 'path';
import { fetchPrFiles, postReview, postErrorComment, type InlineComment } from './github.js';
import { getAddedLines, isBinaryPatch } from './diff-parser.js';
import { indexDocs, searchDocs } from './rag.js';
import { reviewFile } from './llm.js';

// --- Phase 1: Read project docs from disk ---

function readProjectDocs(): Array<{ content: string; source: string }> {
  const docs: Array<{ content: string; source: string }> = [];
  const projectRoot = process.cwd();

  // README.md
  const readmePath = path.join(projectRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    docs.push({ content: fs.readFileSync(readmePath, 'utf-8'), source: 'README.md' });
  }

  // docs/ directory (*.md files, non-recursive)
  const docsDir = path.join(projectRoot, 'docs');
  if (fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory()) {
    const entries = fs.readdirSync(docsDir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const filePath = path.join(docsDir, entry);
        if (fs.statSync(filePath).isFile()) {
          docs.push({ content: fs.readFileSync(filePath, 'utf-8'), source: `docs/${entry}` });
        }
      }
    }
  }

  return docs;
}

// --- Severity badge ---

function severityBadge(severity: string): string {
  switch (severity) {
    case 'bug': return '🐛 **Bug**';
    case 'architecture': return '🏗️ **Architecture**';
    case 'recommendation': return '💡 **Recommendation**';
    default: return `**${severity}**`;
  }
}

// --- Main ---

async function main(): Promise<void> {
  console.log('\x1b[36m[AI Review]\x1b[0m Starting AI code review...');
  const startTime = Date.now();

  try {
    // Phase 1: Gather inputs
    console.log('\x1b[36m[AI Review]\x1b[0m Phase 1: Gathering inputs...');
    const prFiles = await fetchPrFiles();

    if (prFiles.length === 0) {
      console.log('\x1b[36m[AI Review]\x1b[0m No reviewable files — skipping');
      return;
    }

    // Phase 2: Build ephemeral RAG index
    console.log('\x1b[36m[AI Review]\x1b[0m Phase 2: Building RAG index...');
    const docs = readProjectDocs();
    let ragAvailable = false;
    if (docs.length > 0) {
      const chunkCount = await indexDocs(docs);
      ragAvailable = chunkCount > 0;
      console.log(`\x1b[35m[RAG]\x1b[0m Indexed ${chunkCount} chunks from ${docs.length} docs`);
    } else {
      console.log('\x1b[33m[AI Review]\x1b[0m No docs found — reviewing without RAG context');
    }

    // Phase 3: Review each file with LLM
    console.log('\x1b[36m[AI Review]\x1b[0m Phase 3: Reviewing files...');
    const allComments: InlineComment[] = [];

    for (const file of prFiles) {
      if (isBinaryPatch(file.patch)) continue;

      // Get RAG context for this file
      let ragContext = '';
      if (ragAvailable) {
        const query = `reviewing changes in ${file.filename}: ${file.patch!.slice(0, 200)}`;
        const results = await searchDocs(query, 3);
        if (results.length > 0) {
          ragContext = results
            .map((r) => `[${r.source}] ${r.text}`)
            .join('\n\n---\n\n');
        }
      }

      // Call LLM
      const comments = await reviewFile(file.filename, file.patch!, ragContext);

      // Map LLM comments to GitHub inline comments
      // Only include comments on lines that are actually added in the diff
      const addedLines = getAddedLines(file.patch!);
      const addedLineNumbers = new Set(addedLines.map((l) => l.line));

      for (const c of comments) {
        if (addedLineNumbers.has(c.line)) {
          allComments.push({
            path: file.filename,
            line: c.line,
            side: 'RIGHT',
            body: `${severityBadge(c.severity)}: ${c.comment}`,
          });
        } else {
          // LLM referenced a line that isn't an added line — post on nearest added line
          // or skip if no added lines nearby
          console.log(`\x1b[33m[AI Review]\x1b[0m Skipping comment on ${file.filename}:${c.line} (not an added line)`);
        }
      }
    }

    // Phase 4: Post review
    console.log('\x1b[36m[AI Review]\x1b[0m Phase 4: Posting review...');
    await postReview(allComments);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\x1b[32m[AI Review]\x1b[0m Done in ${elapsed}s — ${allComments.length} comments posted`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[AI Review]\x1b[0m Fatal error: ${msg}`);
    try {
      await postErrorComment(`AI review failed: ${msg}`);
    } catch {
      console.error('\x1b[31m[AI Review]\x1b[0m Could not post error comment');
    }
    process.exit(1);
  }
}

main();
