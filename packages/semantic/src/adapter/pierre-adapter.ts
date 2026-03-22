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
}

/**
 * Convert SemanticChange[] from the differ into DiffLineAnnotation[] for Pierre's rendering.
 * Maps change type to annotation side: added->additions, deleted->deletions,
 * modified->both sides, renamed/moved->additions.
 */
export function changesToAnnotations(
  changes: SemanticChange[]
): DiffLineAnnotation<SemanticAnnotation>[] {
  const result: DiffLineAnnotation<SemanticAnnotation>[] = [];
  for (const change of changes) {
    const metadata: SemanticAnnotation = {
      changeType: change.changeType,
      entityType: change.entityType,
      entityName: change.entityName,
    };
    const push = (side: 'deletions' | 'additions') =>
      result.push({ side, lineNumber: 1, metadata });
    switch (change.changeType) {
      case 'added':
        push('additions');
        break;
      case 'deleted':
        push('deletions');
        break;
      case 'modified':
        push('deletions');
        push('additions');
        break;
      case 'renamed':
      case 'moved':
        push('additions');
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
