import { execSync } from 'child_process';

import type { SemanticEntity } from '../model/entity';

export interface EntityBlame {
  entityId: string;
  lastAuthor: string;
  lastCommitSha: string;
  lastCommitDate: string;
  lastCommitMessage: string;
}

interface BlameInfo {
  sha: string;
  author: string;
  authorTime: number;
  summary: string;
}

/**
 * Run git blame --porcelain on a file and map blame line data to semantic entities.
 * For each entity, find the most recent commit that touched its line range.
 */
export function blameEntities(
  filePath: string,
  entities: SemanticEntity[],
  cwd?: string
): EntityBlame[] {
  try {
    // Run git blame --porcelain on the file
    const cmd = `git blame --porcelain "${filePath}"`;
    const output = execSync(cmd, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse blame output into a map of line number -> blame info
    const lineBlame = parsePorcelainBlame(output);

    // For each entity, find the most recent commit in its line range
    const results: EntityBlame[] = [];

    for (const entity of entities) {
      let mostRecentBlame: BlameInfo | null = null;

      // Scan all lines in the entity's range
      for (let line = entity.startLine; line <= entity.endLine; line++) {
        const blame = lineBlame.get(line);
        if (blame != null) {
          // Keep the most recent (highest authorTime)
          if (
            mostRecentBlame == null ||
            blame.authorTime > mostRecentBlame.authorTime
          ) {
            mostRecentBlame = blame;
          }
        }
      }

      if (mostRecentBlame != null) {
        results.push({
          entityId: entity.id,
          lastAuthor: mostRecentBlame.author,
          lastCommitSha: mostRecentBlame.sha,
          lastCommitDate: new Date(
            mostRecentBlame.authorTime * 1000
          ).toISOString(),
          lastCommitMessage: mostRecentBlame.summary,
        });
      }
    }

    return results;
  } catch {
    // If git blame fails (e.g., not in a git repo, file not tracked), return empty array
    return [];
  }
}

/**
 * Parse git blame --porcelain output.
 * Format: each blame block starts with:
 *   <sha> <orig-line> <final-line> <num-lines>
 * Followed by metadata lines like:
 *   author <name>
 *   author-time <timestamp>
 *   summary <message>
 *   filename <path>
 * Then the actual line content prefixed with a tab.
 */
function parsePorcelainBlame(output: string): Map<number, BlameInfo> {
  const lines = output.split('\n');
  const blameMap = new Map<number, BlameInfo>();

  let currentSha: string | null = null;
  let currentLine: number | null = null;
  let currentAuthor: string | null = null;
  let currentAuthorTime: number | null = null;
  let currentSummary: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start of a new blame block: <sha> <orig-line> <final-line> <num-lines>
    if (/^[0-9a-f]{40}\s+\d+\s+\d+/.test(line)) {
      const parts = line.split(/\s+/);
      currentSha = parts[0];
      currentLine = parseInt(parts[2], 10); // final-line (1-indexed)

      // Reset metadata for new block
      currentAuthor = null;
      currentAuthorTime = null;
      currentSummary = null;
    } else if (line.startsWith('author ')) {
      currentAuthor = line.substring('author '.length);
    } else if (line.startsWith('author-time ')) {
      currentAuthorTime = parseInt(line.substring('author-time '.length), 10);
    } else if (line.startsWith('summary ')) {
      currentSummary = line.substring('summary '.length);
    } else if (line.startsWith('\t')) {
      // This is the actual line content - we now have all metadata
      if (
        currentSha != null &&
        currentLine != null &&
        currentLine !== 0 &&
        currentAuthor != null &&
        currentAuthorTime !== null &&
        currentSummary != null
      ) {
        blameMap.set(currentLine, {
          sha: currentSha,
          author: currentAuthor,
          authorTime: currentAuthorTime,
          summary: currentSummary,
        });
      }
    }
  }

  return blameMap;
}
