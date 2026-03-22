import { describe, expect, test } from 'bun:test';

import { buildEntityGraph, computeImpact } from '../src/graph';
import type { SemanticEntity } from '../src/model/entity';

describe('EntityGraph', () => {
  test('builds graph from entities', () => {
    const entityA: SemanticEntity = {
      id: 'file.ts::function::processData',
      name: 'processData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 1,
      endLine: 5,
      content: 'function processData() { return fetchData(); }',
      contentHash: 'abc',
      bodyContent: '() { return fetchData(); }',
    };
    const entityB: SemanticEntity = {
      id: 'file.ts::function::fetchData',
      name: 'fetchData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 7,
      endLine: 10,
      content: 'function fetchData() { return []; }',
      contentHash: 'def',
      bodyContent: '() { return []; }',
    };

    const graph = buildEntityGraph([
      { path: 'file.ts', entities: [entityA, entityB] },
    ]);

    expect(graph.entities.size).toBe(2);
    expect(graph.entities.get(entityA.id)).toBe(entityA);
    expect(graph.entities.get(entityB.id)).toBe(entityB);
  });

  test('detects function calls as dependencies', () => {
    const entityA: SemanticEntity = {
      id: 'file.ts::function::processData',
      name: 'processData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 1,
      endLine: 5,
      content: 'function processData() { return fetchData(); }',
      contentHash: 'abc',
      bodyContent: '() { return fetchData(); }',
    };
    const entityB: SemanticEntity = {
      id: 'file.ts::function::fetchData',
      name: 'fetchData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 7,
      endLine: 10,
      content: 'function fetchData() { return []; }',
      contentHash: 'def',
      bodyContent: '() { return []; }',
    };

    const graph = buildEntityGraph([
      { path: 'file.ts', entities: [entityA, entityB] },
    ]);
    const deps = graph.getDependencies(entityA.id);

    expect(deps.length).toBeGreaterThan(0);
    expect(
      deps.some((d) => d.toEntityId === entityB.id && d.refType === 'calls')
    ).toBe(true);
  });

  test('getDependents returns reverse edges', () => {
    const entityA: SemanticEntity = {
      id: 'file.ts::function::processData',
      name: 'processData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 1,
      endLine: 5,
      content: 'function processData() { return fetchData(); }',
      contentHash: 'abc',
      bodyContent: '() { return fetchData(); }',
    };
    const entityB: SemanticEntity = {
      id: 'file.ts::function::fetchData',
      name: 'fetchData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 7,
      endLine: 10,
      content: 'function fetchData() { return []; }',
      contentHash: 'def',
      bodyContent: '() { return []; }',
    };

    const graph = buildEntityGraph([
      { path: 'file.ts', entities: [entityA, entityB] },
    ]);
    const dependents = graph.getDependents(entityB.id);

    expect(dependents.some((d) => d.fromEntityId === entityA.id)).toBe(true);
  });

  test('impact analysis: changing B shows A as impacted when A calls B', () => {
    const entityA: SemanticEntity = {
      id: 'file.ts::function::processData',
      name: 'processData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 1,
      endLine: 5,
      content: 'function processData() { return fetchData(); }',
      contentHash: 'abc',
      bodyContent: '() { return fetchData(); }',
    };
    const entityB: SemanticEntity = {
      id: 'file.ts::function::fetchData',
      name: 'fetchData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 7,
      endLine: 10,
      content: 'function fetchData() { return []; }',
      contentHash: 'def',
      bodyContent: '() { return []; }',
    };

    const graph = buildEntityGraph([
      { path: 'file.ts', entities: [entityA, entityB] },
    ]);
    const impact = computeImpact(graph, [entityB.id]);

    expect(impact.has(entityB.id)).toBe(true);
    expect(impact.get(entityB.id)).toBe(0); // Distance 0 for changed entity
    expect(impact.has(entityA.id)).toBe(true);
    expect(impact.get(entityA.id)).toBe(1); // Distance 1 for dependent
  });

  test('impact analysis: transitive dependencies', () => {
    const entityA: SemanticEntity = {
      id: 'file.ts::function::main',
      name: 'main',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 1,
      endLine: 3,
      content: 'function main() { return processData(); }',
      contentHash: 'aaa',
      bodyContent: '() { return processData(); }',
    };
    const entityB: SemanticEntity = {
      id: 'file.ts::function::processData',
      name: 'processData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 5,
      endLine: 7,
      content: 'function processData() { return fetchData(); }',
      contentHash: 'bbb',
      bodyContent: '() { return fetchData(); }',
    };
    const entityC: SemanticEntity = {
      id: 'file.ts::function::fetchData',
      name: 'fetchData',
      entityType: 'function',
      filePath: 'file.ts',
      startLine: 9,
      endLine: 11,
      content: 'function fetchData() { return []; }',
      contentHash: 'ccc',
      bodyContent: '() { return []; }',
    };

    const graph = buildEntityGraph([
      { path: 'file.ts', entities: [entityA, entityB, entityC] },
    ]);
    const impact = computeImpact(graph, [entityC.id]);

    // Changing C should impact B (distance 1) and A (distance 2)
    expect(impact.has(entityC.id)).toBe(true);
    expect(impact.get(entityC.id)).toBe(0);
    expect(impact.has(entityB.id)).toBe(true);
    expect(impact.get(entityB.id)).toBe(1);
    expect(impact.has(entityA.id)).toBe(true);
    expect(impact.get(entityA.id)).toBe(2);
  });
});
