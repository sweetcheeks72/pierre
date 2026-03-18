import { describe, expect, test } from 'bun:test';

import {
  computeEntriesAfterCreatingFile,
  computeEntriesAfterCreatingFolder,
  computeEntriesAfterRename,
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

  test('preserves explicit empty directories when renaming a folder', () => {
    expect(
      computeEntriesAfterRename(
        [
          { path: 'src/components', type: 'directory' },
          { path: 'src/components/empty', type: 'directory' },
          { path: 'src/components/Button.tsx', type: 'file' },
        ],
        'src/components',
        'ui'
      )
    ).toEqual([
      { path: 'src/ui', type: 'directory' },
      { path: 'src/ui/empty', type: 'directory' },
      { path: 'src/ui/Button.tsx', type: 'file' },
    ]);
  });

  test('rejects creating a file when an empty directory already uses the path', () => {
    expect(
      computeEntriesAfterCreatingFile(
        [{ path: 'src/index', type: 'directory' }],
        'src',
        'index'
      )
    ).toBeNull();
  });

  test('creates an explicit empty directory', () => {
    expect(
      computeEntriesAfterCreatingFolder(
        [{ path: 'src/index.ts', type: 'file' }],
        'src',
        'components'
      )
    ).toEqual([
      { path: 'src/index.ts', type: 'file' },
      { path: 'src/components', type: 'directory' },
    ]);
  });
});
