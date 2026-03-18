import { FLATTENED_PREFIX } from '../constants';
import type { FileTreeEntry, FileTreeEntryType, FileTreeFiles } from '../types';
import { forEachFileTreeEntry } from './fileTreeFiles';

export interface DropCollision {
  origin: string | null;
  destination: string;
}

export interface ComputeDropOptions {
  onCollision?: (collision: DropCollision) => boolean;
}

const normalizePath = (path: string): string =>
  path.startsWith(FLATTENED_PREFIX)
    ? path.slice(FLATTENED_PREFIX.length)
    : path;

const getBasename = (path: string): string => {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
};

const isDescendantOf = (path: string, ancestor: string): boolean =>
  path.startsWith(`${ancestor}/`);

const hasSelectedFolderAncestor = (
  path: string,
  selectedFolders: Set<string>
): boolean => {
  let slash = path.lastIndexOf('/');
  while (slash !== -1) {
    const parent = path.slice(0, slash);
    if (selectedFolders.has(parent)) {
      return true;
    }
    slash = parent.lastIndexOf('/');
  }
  return false;
};

const getSelectedFolderForPath = (
  path: string,
  selectedFolders: Set<string>
): string | undefined => {
  if (selectedFolders.has(path)) {
    return path;
  }

  let slash = path.lastIndexOf('/');
  while (slash !== -1) {
    const folder = path.slice(0, slash);
    if (selectedFolders.has(folder)) {
      return folder;
    }
    slash = folder.lastIndexOf('/');
  }
  return undefined;
};

/**
 * Computes the new file list after dragging items to a target folder.
 *
 * @param currentFiles - The current flat list of file paths
 * @param draggedPaths - Paths being dragged (may include `f::` prefix)
 * @param targetFolderPath - Destination folder path, or `'root'` for top level
 * @param options - Optional move behavior, including collision handling
 * @returns A new file list with the dragged items moved
 */
export function computeNewFilesAfterDrop<TFiles extends FileTreeFiles>(
  currentFiles: TFiles,
  draggedPaths: string[],
  targetFolderPath: string,
  options?: ComputeDropOptions
): TFiles;
export function computeNewFilesAfterDrop(
  currentFiles: FileTreeFiles,
  draggedPaths: string[],
  targetFolderPath: string,
  options: ComputeDropOptions = {}
): FileTreeFiles {
  const normalizedTarget = normalizePath(targetFolderPath);
  const targetPrefix =
    normalizedTarget === 'root' ? '' : `${normalizedTarget}/`;

  const normalizedItems: Array<{ path: string; type: FileTreeEntryType }> = [];
  const currentFileSet = new Set<string>();
  const folderSet = new Set<string>();

  const mode = forEachFileTreeEntry(currentFiles, (inputPath, type) => {
    normalizedItems.push({ path: inputPath, type });

    const parts = inputPath.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i += 1) {
      currentPath =
        currentPath !== '' ? `${currentPath}/${parts[i]}` : parts[i];
      const isTerminal = i === parts.length - 1;
      const isFolder = !isTerminal || type === 'folder';

      if (isFolder) {
        folderSet.add(currentPath);
      } else {
        currentFileSet.add(currentPath);
      }
    }
  });

  const normalizedDragged = [...new Set(draggedPaths.map(normalizePath))];
  const orderedDragged = normalizedDragged
    .map((path) => ({
      path,
      kind: folderSet.has(path) ? 'folder' : 'file',
      depth: path.split('/').length,
    }))
    .sort((a, b) => a.depth - b.depth);

  const selectedFolders = new Set<string>();
  const selectedFiles = new Set<string>();
  for (const item of orderedDragged) {
    if (hasSelectedFolderAncestor(item.path, selectedFolders)) {
      continue;
    }
    if (item.kind === 'folder') {
      selectedFolders.add(item.path);
      continue;
    }
    if (currentFileSet.has(item.path)) {
      selectedFiles.add(item.path);
    }
  }

  const proposedDestinationByOrigin = new Map<string, string>();
  for (const item of normalizedItems) {
    if (selectedFiles.has(item.path)) {
      const destination = `${targetPrefix}${getBasename(item.path)}`;
      if (destination !== item.path) {
        proposedDestinationByOrigin.set(item.path, destination);
      }
      continue;
    }

    const selectedFolder = getSelectedFolderForPath(item.path, selectedFolders);
    if (selectedFolder == null) {
      continue;
    }

    if (
      normalizedTarget === selectedFolder ||
      isDescendantOf(normalizedTarget, selectedFolder)
    ) {
      continue;
    }

    const destination = `${targetPrefix}${getBasename(selectedFolder)}${item.path.slice(selectedFolder.length)}`;
    if (destination !== item.path) {
      proposedDestinationByOrigin.set(item.path, destination);
    }
  }

  const finalPathByOrigin = new Map<string, string | null>();
  const occupantByDestination = new Map<string, string>();
  for (const item of normalizedItems) {
    finalPathByOrigin.set(item.path, item.path);
    occupantByDestination.set(item.path, item.path);
  }

  for (const item of normalizedItems) {
    const origin = item.path;
    const destination = proposedDestinationByOrigin.get(origin);
    if (destination == null) {
      continue;
    }

    const currentPath = finalPathByOrigin.get(origin);
    if (currentPath == null || currentPath === destination) {
      continue;
    }

    const existingOccupant = occupantByDestination.get(destination);
    if (existingOccupant != null && existingOccupant !== origin) {
      const allowOverwrite =
        options.onCollision?.({ origin, destination }) === true;
      if (!allowOverwrite) {
        continue;
      }

      const existingPath = finalPathByOrigin.get(existingOccupant);
      if (existingPath != null) {
        occupantByDestination.delete(existingPath);
      }
      finalPathByOrigin.set(existingOccupant, null);
    }

    occupantByDestination.delete(currentPath);
    occupantByDestination.set(destination, origin);
    finalPathByOrigin.set(origin, destination);
  }

  if (mode === 'entries') {
    const result: FileTreeEntry[] = [];
    for (const item of normalizedItems) {
      const next = finalPathByOrigin.get(item.path);
      if (next != null) {
        result.push({ path: next, type: item.type });
      }
    }
    return result;
  }

  const result: string[] = [];
  for (const item of normalizedItems) {
    const next = finalPathByOrigin.get(item.path);
    if (next != null) {
      result.push(next);
    }
  }

  return result;
}
