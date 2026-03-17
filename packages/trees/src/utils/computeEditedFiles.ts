import { FLATTENED_PREFIX } from '../constants';

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

const buildFolderSet = (files: string[]): Set<string> => {
  const folders = new Set<string>();
  for (const file of files) {
    let slash = file.lastIndexOf('/');
    while (slash !== -1) {
      folders.add(file.slice(0, slash));
      slash = file.lastIndexOf('/', slash - 1);
    }
  }
  return folders;
};

export function computeFilesAfterCreatingFile(
  currentFiles: string[],
  parentPath: string,
  draftName: string
): string[] | null {
  const nextPath = resolveChildPath(normalizeTreePath(parentPath), draftName);
  if (nextPath.length === 0) {
    return null;
  }
  if (currentFiles.includes(nextPath)) {
    return null;
  }
  return [...currentFiles, nextPath];
}

export function computeFilesAfterRename(
  currentFiles: string[],
  targetPath: string,
  draftName: string
): string[] | null {
  const normalizedTargetPath = normalizeTreePath(targetPath);
  const normalizedDraftName = normalizeDraftName(draftName);
  if (normalizedDraftName.length === 0) {
    return null;
  }

  const folderSet = buildFolderSet(currentFiles);
  const isFolder = folderSet.has(normalizedTargetPath);
  const nextPath = resolveChildPath(
    getParentPath(normalizedTargetPath),
    normalizedDraftName
  );

  if (nextPath.length === 0) {
    return null;
  }
  if (nextPath === normalizedTargetPath) {
    return currentFiles;
  }

  if (!isFolder) {
    if (
      currentFiles.some(
        (path) => path !== normalizedTargetPath && path === nextPath
      )
    ) {
      return null;
    }
    return currentFiles.map((path) =>
      path === normalizedTargetPath ? nextPath : path
    );
  }

  const targetPrefix = `${normalizedTargetPath}/`;
  if (
    currentFiles.some(
      (path) =>
        !path.startsWith(targetPrefix) &&
        path !== normalizedTargetPath &&
        (path === nextPath || path.startsWith(`${nextPath}/`))
    )
  ) {
    return null;
  }

  let changed = false;
  const nextFiles = currentFiles.map((path) => {
    if (!path.startsWith(targetPrefix)) {
      return path;
    }
    changed = true;
    return `${nextPath}${path.slice(normalizedTargetPath.length)}`;
  });

  return changed ? nextFiles : null;
}
