import type { FileTreeEntry, FileTreeEntryType, FileTreeFiles } from '../types';

export type FileTreeFilesMode = 'paths' | 'entries' | 'empty';

export const FILE_TREE_FILES_MIXED_ARRAY_ERROR =
  'FileTree files arrays must contain only strings or only FileTreeEntry objects.';

export const FILE_TREE_PATH_KIND_CONFLICT_ERROR = (path: string): string =>
  `FileTree path cannot be both a file and a folder: ${path}`;

export function forEachFileTreeEntry(
  files: FileTreeFiles,
  visit: (path: string, type: FileTreeEntryType, index: number) => void
): FileTreeFilesMode {
  let mode: FileTreeFilesMode = 'empty';

  for (let i = 0; i < files.length; i += 1) {
    const item = files[i];

    if (typeof item === 'string') {
      if (mode === 'entries') {
        throw new Error(FILE_TREE_FILES_MIXED_ARRAY_ERROR);
      }
      mode = 'paths';
      visit(item, 'file', i);
      continue;
    }

    if (mode === 'paths') {
      throw new Error(FILE_TREE_FILES_MIXED_ARRAY_ERROR);
    }

    mode = 'entries';
    visit(item.path, item.type, i);
  }

  return mode;
}

export const isFileTreeEntry = (
  value: string | FileTreeEntry
): value is FileTreeEntry => typeof value !== 'string';

export const getFileTreeFilesSignature = (files: FileTreeFiles): string => {
  let signature = `${files.length}`;

  forEachFileTreeEntry(files, (path, type) => {
    signature += `\0${type}\0${path}`;
  });

  return signature;
};
