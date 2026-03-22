import type { SemanticChange } from '../model/change';
import { computeSemanticDiff } from '../parser/differ';
import { createDefaultRegistry } from '../parser/plugins/index';

/** Mirrors @pierre/diffs DiffLineAnnotation — avoids hard TS project reference */
export type DiffLineAnnotation<T = undefined> = {
  side: 'deletions' | 'additions';
  lineNumber: number;
} & (T extends undefined ? {} : { metadata: T });

export interface SemanticAnnotation {
  changeType: 'added' | 'modified' | 'deleted' | 'moved' | 'renamed';
  entityType: string;
  entityName: string;
  oldName?: string;
  similarity?: number;
  startLine?: number;
  endLine?: number;
}

/**
 * Convert SemanticChange[] from the differ into DiffLineAnnotation[] for Pierre's rendering.
 * Maps change type to annotation side: added->additions, deleted->deletions,
 * modified->both sides, renamed/moved->additions.
 * Uses actual entity start lines from the semantic differ.
 */
export function changesToAnnotations(
  changes: SemanticChange[]
): DiffLineAnnotation<SemanticAnnotation>[] {
  const result: DiffLineAnnotation<SemanticAnnotation>[] = [];
  for (const change of changes) {
    const baseMetadata: SemanticAnnotation = {
      changeType: change.changeType,
      entityType: change.entityType,
      entityName: change.entityName,
      oldName: change.oldEntityName,
    };

    switch (change.changeType) {
      case 'added':
        result.push({
          side: 'additions',
          lineNumber: change.startLine ?? 1,
          metadata: {
            ...baseMetadata,
            startLine: change.startLine,
            endLine: change.endLine,
          },
        });
        break;
      case 'deleted':
        result.push({
          side: 'deletions',
          lineNumber: change.oldStartLine ?? 1,
          metadata: {
            ...baseMetadata,
            startLine: change.oldStartLine,
            endLine: change.oldEndLine,
          },
        });
        break;
      case 'modified':
        result.push({
          side: 'deletions',
          lineNumber: change.oldStartLine ?? 1,
          metadata: {
            ...baseMetadata,
            startLine: change.oldStartLine,
            endLine: change.oldEndLine,
          },
        });
        result.push({
          side: 'additions',
          lineNumber: change.startLine ?? 1,
          metadata: {
            ...baseMetadata,
            startLine: change.startLine,
            endLine: change.endLine,
          },
        });
        break;
      case 'renamed':
      case 'moved':
        result.push({
          side: 'additions',
          lineNumber: change.startLine ?? 1,
          metadata: {
            ...baseMetadata,
            startLine: change.startLine,
            endLine: change.endLine,
          },
        });
        break;
    }
  }
  return result;
}

/**
 * High-level: given before/after content for a file path, run the semantic differ
 * and return DiffLineAnnotation[] for Pierre's rendering pipeline.
 */
export function semanticDiffToAnnotations(
  beforeContent: string,
  afterContent: string,
  filePath: string
): DiffLineAnnotation<SemanticAnnotation>[] {
  const registry = createDefaultRegistry();
  const diffResult = computeSemanticDiff(
    [{ filePath, beforeContent, afterContent }],
    registry
  );
  return changesToAnnotations(diffResult.changes);
}
