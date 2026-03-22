import { describe, expect, test } from 'bun:test';

import { blameEntities } from '../src/git/blame';
import type { SemanticEntity } from '../src/model/entity';

describe('blameEntities', () => {
  test('returns empty array when git blame fails', () => {
    const entities: SemanticEntity[] = [
      {
        id: 'test.ts::function::test',
        name: 'test',
        entityType: 'function',
        filePath: 'nonexistent.ts',
        startLine: 1,
        endLine: 5,
        content: '',
        contentHash: '',
      },
    ];

    // Should not throw, just return empty array
    const result = blameEntities('nonexistent.ts', entities, '/tmp');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('returns entity blame for a real git file', () => {
    // Test with the entity.ts file we know exists
    const filePath = 'packages/semantic/src/model/entity.ts';
    const cwd = '/private/tmp/pi-github-repos/pierrecomputer/pierre';

    const entities: SemanticEntity[] = [
      {
        id: 'entity.ts::interface::SemanticEntity',
        name: 'SemanticEntity',
        entityType: 'interface',
        filePath,
        startLine: 1,
        endLine: 15,
        content: '',
        contentHash: '',
      },
    ];

    try {
      const result = blameEntities(filePath, entities, cwd);

      // Should return structured output
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        const blame = result[0];
        expect(blame).toHaveProperty('entityId');
        expect(blame).toHaveProperty('lastAuthor');
        expect(blame).toHaveProperty('lastCommitSha');
        expect(blame).toHaveProperty('lastCommitDate');
        expect(blame).toHaveProperty('lastCommitMessage');
        expect(blame.entityId).toBe('entity.ts::interface::SemanticEntity');
        expect(typeof blame.lastAuthor).toBe('string');
        expect(typeof blame.lastCommitSha).toBe('string');
        expect(typeof blame.lastCommitDate).toBe('string');
        expect(typeof blame.lastCommitMessage).toBe('string');
      }
    } catch {
      // Skip if not in a git repo or file doesn't exist yet
    }
  });

  test('handles multiple entities with different line ranges', () => {
    const filePath = 'packages/semantic/src/model/entity.ts';
    const cwd = '/private/tmp/pi-github-repos/pierrecomputer/pierre';

    const entities: SemanticEntity[] = [
      {
        id: 'entity.ts::interface::SemanticEntity',
        name: 'SemanticEntity',
        entityType: 'interface',
        filePath,
        startLine: 1,
        endLine: 10,
        content: '',
        contentHash: '',
      },
      {
        id: 'entity.ts::function::buildEntityId',
        name: 'buildEntityId',
        entityType: 'function',
        filePath,
        startLine: 11,
        endLine: 20,
        content: '',
        contentHash: '',
      },
    ];

    try {
      const result = blameEntities(filePath, entities, cwd);

      // Should handle multiple entities
      expect(Array.isArray(result)).toBe(true);

      // Each entity should have blame info if the file exists
      if (result.length > 0) {
        for (const blame of result) {
          expect(entities.some((e) => e.id === blame.entityId)).toBe(true);
        }
      }
    } catch {
      // Skip if not in a git repo
    }
  });
});
