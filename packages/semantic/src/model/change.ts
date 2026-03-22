export type ChangeType = 'added' | 'modified' | 'deleted' | 'moved' | 'renamed';

export interface SemanticChange {
  id: string;
  entityId: string;
  changeType: ChangeType;
  entityType: string;
  entityName: string;
  oldEntityName?: string;
  filePath: string;
  oldFilePath?: string;
  beforeContent?: string;
  afterContent?: string;
  startLine?: number;
  endLine?: number;
  oldStartLine?: number;
  oldEndLine?: number;
  commitSha?: string;
  author?: string;
  timestamp?: string;
}
