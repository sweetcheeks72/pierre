import { FLATTENED_PREFIX } from '../constants';
import type { FileTreeEntry } from '../types';

export type FileTreeEditSession =
  | {
      kind: 'rename';
      targetPath: string;
      draftName?: string;
    }
  | {
      kind: 'new-file';
      parentPath?: string;
      draftName?: string;
    }
  | {
      kind: 'new-folder';
      parentPath?: string;
      draftName?: string;
    };

const normalizeTreePath = (path: string): string =>
  path.startsWith(FLATTENED_PREFIX)
    ? path.slice(FLATTENED_PREFIX.length)
    : path;

const trimSlashes = (value: string): string =>
  value.replace(/^\/+/, '').replace(/\/+$/, '');

export const normalizeDraftName = (value: string): string =>
  trimSlashes(value.trim().replaceAll('\\', '/'));

const getParentPath = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
};

const resolveChildPath = (parentPath: string, name: string): string => {
  const normalizedName = normalizeDraftName(name);
  if (normalizedName.length === 0) {
    return '';
  }
  return parentPath.length > 0
    ? `${parentPath}/${normalizedName}`
    : normalizedName;
};

const buildEntryFolderSet = (entries: FileTreeEntry[]): Set<string> => {
  const folders = new Set<string>();
  for (const entry of entries) {
    if (entry.type === 'directory') {
      folders.add(entry.path);
    }
    let slash = entry.path.lastIndexOf('/');
    while (slash !== -1) {
      folders.add(entry.path.slice(0, slash));
      slash = entry.path.lastIndexOf('/', slash - 1);
    }
  }
  return folders;
};

const buildEntryPathSet = (entries: FileTreeEntry[]): Set<string> =>
  new Set(entries.map((entry) => entry.path));

export function computeEntriesAfterCreatingFile(
  currentEntries: FileTreeEntry[],
  parentPath: string,
  draftName: string
): FileTreeEntry[] | null {
  const nextPath = resolveChildPath(normalizeTreePath(parentPath), draftName);
  if (nextPath.length === 0) {
    return null;
  }

  const existingPaths = buildEntryPathSet(currentEntries);
  const folderSet = buildEntryFolderSet(currentEntries);
  if (existingPaths.has(nextPath) || folderSet.has(nextPath)) {
    return null;
  }

  return [...currentEntries, { path: nextPath, type: 'file' }];
}

export function computeEntriesAfterCreatingFolder(
  currentEntries: FileTreeEntry[],
  parentPath: string,
  draftName: string
): FileTreeEntry[] | null {
  const nextPath = resolveChildPath(normalizeTreePath(parentPath), draftName);
  if (nextPath.length === 0) {
    return null;
  }

  const existingPaths = buildEntryPathSet(currentEntries);
  const folderSet = buildEntryFolderSet(currentEntries);
  if (existingPaths.has(nextPath) || folderSet.has(nextPath)) {
    return null;
  }

  return [...currentEntries, { path: nextPath, type: 'directory' }];
}

export function computeEntriesAfterRename(
  currentEntries: FileTreeEntry[],
  targetPath: string,
  draftName: string
): FileTreeEntry[] | null {
  const normalizedTargetPath = normalizeTreePath(targetPath);
  const normalizedDraftName = normalizeDraftName(draftName);
  if (normalizedDraftName.length === 0) {
    return null;
  }

  const folderSet = buildEntryFolderSet(currentEntries);
  const isFolder = folderSet.has(normalizedTargetPath);
  const nextPath = resolveChildPath(
    getParentPath(normalizedTargetPath),
    normalizedDraftName
  );

  if (nextPath.length === 0) {
    return null;
  }
  if (nextPath === normalizedTargetPath) {
    return currentEntries;
  }

  if (!isFolder) {
    if (
      currentEntries.some(
        (entry) =>
          entry.path !== normalizedTargetPath && entry.path === nextPath
      ) ||
      folderSet.has(nextPath)
    ) {
      return null;
    }

    let changed = false;
    const nextEntries = currentEntries.map((entry) => {
      if (entry.path !== normalizedTargetPath) {
        return entry;
      }
      changed = true;
      return { ...entry, path: nextPath };
    });
    return changed ? nextEntries : null;
  }

  const targetPrefix = `${normalizedTargetPath}/`;
  const nextPrefix = `${nextPath}/`;
  for (const entry of currentEntries) {
    if (
      entry.path === normalizedTargetPath ||
      entry.path.startsWith(targetPrefix)
    ) {
      continue;
    }
    if (entry.path === nextPath || entry.path.startsWith(nextPrefix)) {
      return null;
    }
  }

  let changed = false;
  const nextEntries = currentEntries.map((entry) => {
    if (entry.path === normalizedTargetPath) {
      changed = true;
      return { ...entry, path: nextPath };
    }
    if (!entry.path.startsWith(targetPrefix)) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      path: `${nextPath}${entry.path.slice(normalizedTargetPath.length)}`,
    };
  });

  return changed ? nextEntries : null;
}

export function computeFilesAfterCreatingFile(
  currentFiles: string[],
  parentPath: string,
  draftName: string
): string[] | null {
  const nextEntries = computeEntriesAfterCreatingFile(
    currentFiles.map((path) => ({ path, type: 'file' })),
    parentPath,
    draftName
  );
  if (nextEntries == null) {
    return null;
  }
  return nextEntries.flatMap((entry) =>
    entry.type === 'file' ? [entry.path] : []
  );
}

export function computeFilesAfterRename(
  currentFiles: string[],
  targetPath: string,
  draftName: string
): string[] | null {
  const nextEntries = computeEntriesAfterRename(
    currentFiles.map((path) => ({ path, type: 'file' })),
    targetPath,
    draftName
  );
  if (nextEntries == null) {
    return null;
  }
  return nextEntries.flatMap((entry) =>
    entry.type === 'file' ? [entry.path] : []
  );
}
