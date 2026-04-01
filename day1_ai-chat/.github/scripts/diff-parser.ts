// .github/scripts/diff-parser.ts

export interface AddedLine {
  line: number;   // Absolute line number in the new file
  content: string; // Line content (without the '+' prefix)
}

/**
 * Extract added line numbers and content from a unified diff patch string.
 * Works with patches returned by GitHub's pulls.listFiles() API.
 */
export function getAddedLines(patch: string): AddedLine[] {
  const lines = patch.split('\n');
  const added: AddedLine[] = [];
  let newLine = 0;

  for (const line of lines) {
    // Match hunk header: @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      // Added line — record and advance
      added.push({ line: newLine, content: line.slice(1) });
      newLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Deleted line — does NOT advance newLine counter
    } else if (!line.startsWith('\\')) {
      // Context line or empty — advances newLine
      newLine++;
    }
  }

  return added;
}

/**
 * Check if a patch represents a binary file change.
 */
export function isBinaryPatch(patch: string | undefined): boolean {
  if (!patch) return true;
  return patch.includes('Binary files') || !patch.includes('@@');
}
