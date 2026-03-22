import { describe, expect, test } from 'bun:test';

import {
  changesToAnnotations,
  semanticDiffToAnnotations,
} from '../src/adapter/pierre-adapter';
import type { SemanticChange } from '../src/model/change';

describe('Pierre adapter', () => {
  test('changesToAnnotations maps line numbers from SemanticChange', () => {
    const changes: SemanticChange[] = [
      {
        id: 'change::test.ts::function::greet',
        entityId: 'test.ts::function::greet',
        changeType: 'modified',
        entityType: 'function',
        entityName: 'greet',
        filePath: 'test.ts',
        startLine: 5,
        endLine: 10,
        oldStartLine: 3,
        oldEndLine: 8,
      },
      {
        id: 'change::added::test.ts::function::farewell',
        entityId: 'test.ts::function::farewell',
        changeType: 'added',
        entityType: 'function',
        entityName: 'farewell',
        filePath: 'test.ts',
        startLine: 12,
        endLine: 15,
      },
      {
        id: 'change::deleted::test.ts::function::old',
        entityId: 'test.ts::function::old',
        changeType: 'deleted',
        entityType: 'function',
        entityName: 'old',
        filePath: 'test.ts',
        oldStartLine: 20,
        oldEndLine: 25,
      },
    ];

    const annotations = changesToAnnotations(changes);

    // Modified produces 2 annotations (deletions + additions)
    expect(annotations).toHaveLength(4);

    // Modified - deletions side uses oldStartLine
    expect(annotations[0].side).toBe('deletions');
    expect(annotations[0].lineNumber).toBe(3);

    // Modified - additions side uses startLine
    expect(annotations[1].side).toBe('additions');
    expect(annotations[1].lineNumber).toBe(5);

    // Added uses startLine
    expect(annotations[2].side).toBe('additions');
    expect(annotations[2].lineNumber).toBe(12);

    // Deleted uses oldStartLine
    expect(annotations[3].side).toBe('deletions');
    expect(annotations[3].lineNumber).toBe(20);
  });

  test('semanticDiffToAnnotations returns real line numbers for multi-entity files', () => {
    const before = `function greet(name: string) {
  return "Hello " + name;
}

function farewell(name: string) {
  return "Goodbye " + name;
}`;

    const after = `function greet(name: string) {
  return "Hello, " + name + "!";
}

function farewell(name: string) {
  return "Goodbye " + name;
}

function welcome() {
  return "Welcome!";
}`;

    const annotations = semanticDiffToAnnotations(before, after, 'test.ts');

    // greet is modified (line 1 in both), welcome is added (line 9 in after)
    const additionAnnotations = annotations.filter(
      (a) => a.side === 'additions'
    );
    const lineNumbers = additionAnnotations.map((a) => a.lineNumber);

    // At least one annotation should NOT be on line 1
    // (welcome starts on line 9)
    expect(lineNumbers.some((n) => n > 1)).toBe(true);

    // Check metadata has entity names
    const names = additionAnnotations.map(
      (a) => (a as { metadata: { entityName: string } }).metadata.entityName
    );
    expect(names).toContain('welcome');
  });

  test('renamed changes produce additions-side annotation', () => {
    const changes: SemanticChange[] = [
      {
        id: 'change::test.ts::function::newName',
        entityId: 'test.ts::function::newName',
        changeType: 'renamed',
        entityType: 'function',
        entityName: 'newName',
        filePath: 'test.ts',
        startLine: 7,
        endLine: 10,
        oldStartLine: 3,
        oldEndLine: 6,
      },
    ];

    const annotations = changesToAnnotations(changes);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].side).toBe('additions');
    expect(annotations[0].lineNumber).toBe(7);
  });
});
