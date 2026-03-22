// Model
export type { SemanticEntity } from './model/entity';
export type { SemanticChange, ChangeType } from './model/change';
export { buildEntityId } from './model/entity';
export {
  matchEntities,
  defaultSimilarity,
  bodySimilarity,
} from './model/identity';
export { contentHash, shortHash } from './utils/hash';

// Parser
export type { SemanticParserPlugin } from './parser/plugin';
export { ParserRegistry } from './parser/registry';
export { computeSemanticDiff } from './parser/differ';
export type {
  DiffResult,
  FileChange as ParserFileChange,
} from './parser/differ';
export { createDefaultRegistry } from './parser/plugins/index';

// Pierre adapter
export type { SemanticAnnotation } from './adapter/pierre-adapter';
export {
  changesToAnnotations,
  semanticDiffToAnnotations,
} from './adapter/pierre-adapter';
export { renderSemanticAnnotation } from './adapter/render';

// Graph
export type { EntityGraph, EntityRef, RefType } from './graph/types';
export { buildEntityGraph } from './graph/builder';
export { computeImpact } from './graph/impact';

// Git
export type { EntityBlame } from './git/blame';
export { blameEntities } from './git/blame';
export type { CommitInfo, FileChange, DiffScope } from './git/types';
