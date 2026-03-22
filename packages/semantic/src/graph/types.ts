import type { SemanticEntity } from '../model/entity';

export type RefType = 'calls' | 'type-ref' | 'imports';

export interface EntityRef {
  fromEntityId: string;
  toEntityId: string;
  refType: RefType;
  filePath: string;
  line: number;
}

export interface EntityGraph {
  entities: Map<string, SemanticEntity>;
  edges: EntityRef[];
  getDependencies(entityId: string): EntityRef[];
  getDependents(entityId: string): EntityRef[];
  getImpact(changedEntityIds: string[]): Set<string>;
}
