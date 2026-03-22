import type { EntityGraph } from './types';

/**
 * Compute impact analysis: which entities are affected by changes to the given entities.
 * Returns a map of entityId -> distance (hops from the changed entities).
 * Distance 0 = the changed entities themselves.
 */
export function computeImpact(
  graph: EntityGraph,
  changedEntityIds: string[]
): Map<string, number> {
  const impactMap = new Map<string, number>();
  const queue: Array<{ id: string; distance: number }> = [];

  // Initialize with changed entities at distance 0
  for (const id of changedEntityIds) {
    impactMap.set(id, 0);
    queue.push({ id, distance: 0 });
  }

  // BFS traversal through dependents
  while (queue.length > 0) {
    const { id, distance } = queue.shift()!;
    const dependents = graph.getDependents(id);

    for (const edge of dependents) {
      const dependentId = edge.fromEntityId;

      // If we haven't visited this entity, or we found a shorter path
      if (
        !impactMap.has(dependentId) ||
        impactMap.get(dependentId)! > distance + 1
      ) {
        impactMap.set(dependentId, distance + 1);
        queue.push({ id: dependentId, distance: distance + 1 });
      }
    }
  }

  return impactMap;
}
