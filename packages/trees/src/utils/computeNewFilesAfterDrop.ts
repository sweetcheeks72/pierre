import { FLATTENED_PREFIX } from '../constants';
import type { FileTreeEntry } from '../types';

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

const getSelectedFolderForFile = (
  file: string,
  selectedFolders: Set<string>
): string | undefined => {
  let slash = file.lastIndexOf('/');
  while (slash !== -1) {
    const folder = file.slice(0, slash);
    if (selectedFolders.has(folder)) {
      return folder;
    }
    slash = folder.lastIndexOf('/');
  }
  return undefined;
};

const getSelectedFolderForPath = (
  path: string,
  selectedFolders: Set<string>
): string | undefined => {
  if (selectedFolders.has(path)) {
    return path;
  }
  return getSelectedFolderForFile(path, selectedFolders);
};

export function computeNewEntriesAfterDrop(
  currentEntries: FileTreeEntry[],
  draggedPaths: string[],
  targetFolderPath: string,
  options: ComputeDropOptions = {}
): FileTreeEntry[] {
  const normalizedTarget = normalizePath(targetFolderPath);
  const targetPrefix =
    normalizedTarget === 'root' ? '' : `${normalizedTarget}/`;

  const folderSet = buildEntryFolderSet(currentEntries);
  const currentPathSet = new Set(currentEntries.map((entry) => entry.path));

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
    if (currentPathSet.has(item.path)) {
      selectedFiles.add(item.path);
    }
  }

  const proposedDestinationByOrigin = new Map<string, string>();
  for (const entry of currentEntries) {
    if (selectedFiles.has(entry.path)) {
      const destination = `${targetPrefix}${getBasename(entry.path)}`;
      if (destination !== entry.path) {
        proposedDestinationByOrigin.set(entry.path, destination);
      }
      continue;
    }

    const selectedFolder = getSelectedFolderForPath(
      entry.path,
      selectedFolders
    );
    if (selectedFolder == null) {
      continue;
    }

    if (
      normalizedTarget === selectedFolder ||
      isDescendantOf(normalizedTarget, selectedFolder)
    ) {
      continue;
    }

    const destination = `${targetPrefix}${getBasename(selectedFolder)}${entry.path.slice(selectedFolder.length)}`;
    if (destination !== entry.path) {
      proposedDestinationByOrigin.set(entry.path, destination);
    }
  }

  const unmovedEntries = currentEntries.filter(
    (entry) => !proposedDestinationByOrigin.has(entry.path)
  );
  const unmovedFolderSet = buildEntryFolderSet(unmovedEntries);

  const originEntryMap = new Map(
    currentEntries.map((entry) => [entry.path, entry] as const)
  );
  const finalPathByOrigin = new Map<string, string | null>();
  const occupantByDestination = new Map<string, string>();
  for (const entry of currentEntries) {
    finalPathByOrigin.set(entry.path, entry.path);
    occupantByDestination.set(entry.path, entry.path);
  }

  for (const entry of currentEntries) {
    const destination = proposedDestinationByOrigin.get(entry.path);
    if (destination == null) {
      continue;
    }

    const currentPath = finalPathByOrigin.get(entry.path);
    if (currentPath == null || currentPath === destination) {
      continue;
    }

    if (entry.type === 'file' && unmovedFolderSet.has(destination)) {
      continue;
    }

    const existingOccupant = occupantByDestination.get(destination);
    if (existingOccupant != null && existingOccupant !== entry.path) {
      const existingEntry = originEntryMap.get(existingOccupant);
      if (existingEntry == null) {
        continue;
      }

      if (entry.type === 'directory' && existingEntry.type === 'directory') {
        occupantByDestination.delete(currentPath);
        finalPathByOrigin.set(entry.path, null);
        continue;
      }

      if (entry.type !== 'file' || existingEntry.type !== 'file') {
        continue;
      }

      const allowOverwrite =
        options.onCollision?.({ origin: entry.path, destination }) === true;
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
    occupantByDestination.set(destination, entry.path);
    finalPathByOrigin.set(entry.path, destination);
  }

  const result: FileTreeEntry[] = [];
  for (const entry of currentEntries) {
    const nextPath = finalPathByOrigin.get(entry.path);
    if (nextPath != null) {
      result.push(
        nextPath === entry.path ? entry : { ...entry, path: nextPath }
      );
    }
  }

  return result;
}

/**
 * Computes the new file list after dragging items to a target folder.
 *
 * @param currentFiles - The current flat list of file paths
 * @param draggedPaths - Paths being dragged (may include `f::` prefix)
 * @param targetFolderPath - Destination folder path, or `'root'` for top level
 * @param options - Optional move behavior, including collision handling
 * @returns A new file list with the dragged items moved
 */
export function computeNewFilesAfterDrop(
  currentFiles: string[],
  draggedPaths: string[],
  targetFolderPath: string,
  options: ComputeDropOptions = {}
): string[] {
  const nextEntries = computeNewEntriesAfterDrop(
    currentFiles.map((path) => ({ path, type: 'file' })),
    draggedPaths,
    targetFolderPath,
    options
  );
  return nextEntries.flatMap((entry) =>
    entry.type === 'file' ? [entry.path] : []
  );
}
