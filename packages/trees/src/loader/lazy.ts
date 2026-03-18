import type { TreeDataLoader } from '@headless-tree/core';

import { FLATTENED_PREFIX } from '../constants';
import type { FileTreeEntriesInput, FileTreeNode } from '../types';
import { createIdMaps } from '../utils/createIdMaps';
import { createLoaderUtils } from '../utils/createLoaderUtils';
import { normalizeEntries } from '../utils/normalizeEntries';
import { defaultChildrenComparator, sortChildren } from '../utils/sortChildren';
import type { DataLoaderOptions } from './index';

/**
 * Creates a lazy data loader that computes nodes on-demand.
 * Best for large trees where most folders remain collapsed.
 * Tradeoff: deeper navigation may trigger incremental work and caching.
 *
 * @param input - Homogeneous path input, either `string[]` files or explicit entries
 * @param options - Configuration options
 */
export function generateLazyDataLoader(
  input: FileTreeEntriesInput,
  options: DataLoaderOptions = {}
): TreeDataLoader<FileTreeNode> {
  const {
    flattenEmptyDirectories = false,
    rootId = 'root',
    rootName = 'root',
    sortComparator = defaultChildrenComparator,
  } = options;

  const entries = normalizeEntries(input);
  const filePaths = entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => entry.path);
  const directoryPaths = entries
    .filter((entry) => entry.type === 'directory')
    .map((entry) => entry.path);

  // Pre-compute folder and child relationships from explicit entries.
  const folderSet = new Set<string>();
  const directChildrenSets = new Map<string, Set<string>>();
  directChildrenSets.set(rootId, new Set());

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      const parentPath = current === '' ? rootId : current;
      current = current !== '' ? `${current}/${part}` : part;

      let parentChildren = directChildrenSets.get(parentPath);
      if (parentChildren == null) {
        parentChildren = new Set();
        directChildrenSets.set(parentPath, parentChildren);
      }
      parentChildren.add(current);

      if (!isLeaf || entry.type === 'directory') {
        folderSet.add(current);
        if (!directChildrenSets.has(current)) {
          directChildrenSets.set(current, new Set());
        }
      }
    }
  }

  // Lazy caches - populated as nodes are accessed
  const nodeCache = new Map<string, FileTreeNode>();
  const directChildrenCache = new Map<string, string[]>();

  const isFolder = (path: string): boolean => {
    return path === rootId || folderSet.has(path);
  };

  const getNameFromPath = (path: string): string => {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  };

  const findDirectChildren = (parentPath: string): string[] => {
    const cached = directChildrenCache.get(parentPath);
    if (cached != null) return cached;

    // Sort children using the configured comparator
    const result = sortChildren(
      [...(directChildrenSets.get(parentPath) ?? new Set<string>())],
      isFolder,
      sortComparator
    );
    directChildrenCache.set(parentPath, result);
    return result;
  };

  // Create flattening utilities with memoization
  const utils = createLoaderUtils(isFolder, findDirectChildren);

  // Track intermediate folders (those that are part of a flattened chain)
  const intermediateFolders = new Set<string>();
  const flattenedKeys = new Set<string>();

  for (const folder of folderSet) {
    const flattenedEndpoint = utils.getFlattenedEndpoint(folder);
    if (flattenedEndpoint == null) continue;

    const flattenedFolders = utils.collectFlattenedFolders(
      folder,
      flattenedEndpoint
    );
    for (let i = 0; i < flattenedFolders.length - 1; i++) {
      intermediateFolders.add(flattenedFolders[i]);
    }

    flattenedKeys.add(`${FLATTENED_PREFIX}${flattenedEndpoint}`);
  }

  const { getIdForKey, getKeyForId } = createIdMaps(rootId);
  const allKeys = new Set<string>([rootId]);
  for (const path of filePaths) {
    allKeys.add(path);
  }
  for (const path of directoryPaths) {
    allKeys.add(path);
  }
  for (const folder of folderSet) {
    allKeys.add(folder);
  }
  for (const flattenedKey of flattenedKeys) {
    allKeys.add(flattenedKey);
  }
  for (const key of Array.from(allKeys).sort()) {
    getIdForKey(key);
  }

  const mapKey = (key: string) => getIdForKey(key);

  // Find the start of the flattened chain that ends at endPath
  const findFlattenedChainStart = (endPath: string): string => {
    const parts = endPath.split('/');
    // Check from the shallowest ancestor to find where the chain starts
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/');
      if (utils.getFlattenedEndpoint(ancestorPath) === endPath) {
        return ancestorPath;
      }
    }
    return endPath;
  };

  // === Main TreeDataLoader Implementation ===
  const getItem = (id: string): FileTreeNode => {
    const cached = nodeCache.get(id);
    if (cached != null) return cached;

    const key = getKeyForId(id);
    if (key == null) {
      throw new Error(`generateLazyDataLoader: unknown id ${id}`);
    }

    let node: FileTreeNode;

    if (key === rootId) {
      // Root node
      const directChildren = findDirectChildren(rootId);
      const flattenedChildren = utils.buildFlattenedChildren(directChildren);
      node = {
        name: rootName,
        path: rootId,
        children: {
          direct: directChildren.map(mapKey),
          ...(flattenedChildren != null && {
            flattened: flattenedChildren.map(mapKey),
          }),
        },
      };
    } else if (key.startsWith(FLATTENED_PREFIX)) {
      const endPath = key.slice(FLATTENED_PREFIX.length);
      const startPath = findFlattenedChainStart(endPath);

      const flattenedFolders = utils.collectFlattenedFolders(
        startPath,
        endPath
      );
      const directChildren = findDirectChildren(endPath);
      const flattenedChildren = utils.buildFlattenedChildren(directChildren);

      node = {
        name: utils.buildFlattenedName(startPath, endPath),
        path: key,
        flattens: flattenedFolders.map(mapKey),
        children: {
          direct: directChildren.map(mapKey),
          ...(flattenedChildren != null && {
            flattened: flattenedChildren.map(mapKey),
          }),
        },
      };
    } else if (isFolder(key)) {
      // Regular folder
      const directChildren = findDirectChildren(key);
      const flattenedChildren = intermediateFolders.has(key)
        ? undefined
        : utils.buildFlattenedChildren(directChildren);
      node = {
        name: getNameFromPath(key),
        path: key,
        children: {
          direct: directChildren.map(mapKey),
          ...(flattenedChildren != null && {
            flattened: flattenedChildren.map(mapKey),
          }),
        },
      };
    } else {
      // File
      node = { name: getNameFromPath(key), path: key };
    }

    nodeCache.set(id, node);
    return node;
  };

  const getChildren = (id: string): string[] => {
    const item = getItem(id);
    if (item.children == null) return [];
    if (flattenEmptyDirectories && item.children.flattened != null) {
      return item.children.flattened;
    }
    return item.children.direct;
  };

  return { getItem, getChildren };
}
