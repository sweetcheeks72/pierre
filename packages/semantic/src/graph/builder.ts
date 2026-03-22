import type { SemanticEntity } from '../model/entity';
import type { EntityGraph, EntityRef, RefType } from './types';

/**
 * Build entity dependency graph from parsed files.
 * Scans entity content for references to other entities and creates edges.
 */
export function buildEntityGraph(
  files: Array<{ path: string; entities: SemanticEntity[] }>
): EntityGraph {
  const entities = new Map<string, SemanticEntity>();
  const symbolTable = new Map<string, string[]>();
  const edges: EntityRef[] = [];

  // Phase 1: Collect all entities and build symbol table
  for (const file of files) {
    for (const entity of file.entities) {
      entities.set(entity.id, entity);

      // Build symbol table: name -> entityId[]
      const ids = symbolTable.get(entity.name) ?? [];
      ids.push(entity.id);
      symbolTable.set(entity.name, ids);
    }
  }

  // Phase 2: Scan each entity for references to other entities
  for (const entity of entities.values()) {
    const content = entity.content ?? '';
    const bodyContent = entity.bodyContent ?? '';
    const searchContent = bodyContent.length > 0 ? bodyContent : content;

    // For each potential symbol, check if it's referenced
    for (const [symbolName, targetIds] of symbolTable) {
      // Skip self-references
      if (symbolName === entity.name) {
        continue;
      }

      // Check if symbol appears in this entity's content
      if (!searchContent.includes(symbolName)) {
        continue;
      }

      // For each matching entity ID, create edges with classified RefType
      for (const targetId of targetIds) {
        // Skip if target is self
        if (targetId === entity.id) {
          continue;
        }

        // Classify the reference type
        const refTypes = classifyReference(searchContent, symbolName);

        for (const refType of refTypes) {
          // Find approximate line number by counting newlines before the reference
          const index = searchContent.indexOf(symbolName);
          const line =
            entity.startLine +
            (searchContent.substring(0, index).split('\n').length - 1);

          edges.push({
            fromEntityId: entity.id,
            toEntityId: targetId,
            refType,
            filePath: entity.filePath,
            line,
          });
        }
      }
    }
  }

  // Phase 3: Create graph object with query methods
  return {
    entities,
    edges,
    getDependencies(entityId: string): EntityRef[] {
      return edges.filter((e) => e.fromEntityId === entityId);
    },
    getDependents(entityId: string): EntityRef[] {
      return edges.filter((e) => e.toEntityId === entityId);
    },
    getImpact(changedEntityIds: string[]): Set<string> {
      const impacted = new Set<string>(changedEntityIds);
      const queue = [...changedEntityIds];
      const visited = new Set<string>(changedEntityIds);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const dependents = edges.filter((e) => e.toEntityId === current);

        for (const dep of dependents) {
          if (!visited.has(dep.fromEntityId)) {
            visited.add(dep.fromEntityId);
            impacted.add(dep.fromEntityId);
            queue.push(dep.fromEntityId);
          }
        }
      }

      return impacted;
    },
  };
}

/**
 * Classify reference type based on context.
 * Returns array since a symbol can appear in multiple contexts.
 */
function classifyReference(content: string, symbolName: string): RefType[] {
  const refTypes = new Set<RefType>();

  // Pattern: import ... from '...' or import { symbolName } from '...'
  const importPattern = new RegExp(
    `import\\s+(?:{[^}]*\\b${escapeRegex(symbolName)}\\b[^}]*}|\\b${escapeRegex(symbolName)}\\b)\\s+from`,
    'g'
  );
  if (importPattern.test(content)) {
    refTypes.add('imports');
  }

  // Pattern: symbolName( -> function call
  const callPattern = new RegExp(`\\b${escapeRegex(symbolName)}\\s*\\(`, 'g');
  if (callPattern.test(content)) {
    refTypes.add('calls');
  }

  // Pattern: : symbolName or <symbolName> or implements symbolName -> type reference
  const typePattern = new RegExp(
    `(?::|<|implements\\s+|extends\\s+|as\\s+)\\s*${escapeRegex(symbolName)}\\b`,
    'g'
  );
  if (typePattern.test(content)) {
    refTypes.add('type-ref');
  }

  // If no specific pattern matched but symbol is present, assume type-ref as default
  if (refTypes.size === 0 && content.includes(symbolName)) {
    refTypes.add('type-ref');
  }

  return Array.from(refTypes);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
