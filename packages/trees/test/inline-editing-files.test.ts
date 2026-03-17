import { describe, expect, test } from 'bun:test';

import {
  computeFilesAfterCreatingFile,
  computeFilesAfterRename,
} from '../src/utils/computeEditedFiles';

describe('inline editing file transforms', () => {
  test('creates a new file at the root', () => {
    expect(
      computeFilesAfterCreatingFile(['README.md'], '', 'package.json')
    ).toEqual(['README.md', 'package.json']);
  });

  test('creates a new file inside a folder', () => {
    expect(
      computeFilesAfterCreatingFile(
        ['src/index.ts'],
        'src/components',
        'Button.tsx'
      )
    ).toEqual(['src/index.ts', 'src/components/Button.tsx']);
  });

  test('rejects creating a duplicate file', () => {
    expect(
      computeFilesAfterCreatingFile(['src/index.ts'], 'src', 'index.ts')
    ).toBeNull();
  });

  test('renames a single file without touching unrelated paths', () => {
    expect(
      computeFilesAfterRename(
        ['README.md', 'src/index.ts', 'src/components/Button.tsx'],
        'src/index.ts',
        'main.ts'
      )
    ).toEqual(['README.md', 'src/main.ts', 'src/components/Button.tsx']);
  });

  test('renames a folder and remaps all descendants', () => {
    expect(
      computeFilesAfterRename(
        [
          'README.md',
          'src/components/Button.tsx',
          'src/components/Card.tsx',
          'src/index.ts',
        ],
        'src/components',
        'ui'
      )
    ).toEqual([
      'README.md',
      'src/ui/Button.tsx',
      'src/ui/Card.tsx',
      'src/index.ts',
    ]);
  });

  test('rejects folder renames that collide with an existing subtree', () => {
    expect(
      computeFilesAfterRename(
        ['src/components/Button.tsx', 'src/ui/Card.tsx'],
        'src/components',
        'ui'
      )
    ).toBeNull();
  });
});
