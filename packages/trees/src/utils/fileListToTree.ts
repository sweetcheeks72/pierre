import { FLATTENED_PREFIX } from '../constants';
import type { FileTreeFiles, FileTreeNode } from '../types';
import { createIdMaps } from './createIdMaps';
import { createLoaderUtils } from './createLoaderUtils';
import {
  FILE_TREE_PATH_KIND_CONFLICT_ERROR,
  forEachFileTreeEntry,
} from './fileTreeFiles';
import type { ChildrenSortOption } from './sortChildren';
import { defaultChildrenComparator, sortChildren } from './sortChildren';

export interface FileListToTreeOptions {
  rootId?: string;
  rootName?: string;
  sortComparator?: ChildrenSortOption;
}

const ROOT_ID = 'root';

/**
 * Converts a list of file paths into a tree structure suitable for use with FileTree.
 * Generates both direct children and flattened children (single-child folder chains).
 *
 * Time complexity: O(n * d) where n = number of files, d = average path depth
 * Space complexity: O(n * d) for storing all nodes and folder relationships
 *
 * @param filePaths - Array of file path strings (e.g., ['src/index.ts', 'src/utils/helper.ts'])
 * @param options - Optional configuration for root node
 * @returns A record mapping node IDs (hashed) to FileTreeNode objects
 *   with the original path stored on each node's `path` field
 */
export function fileListToTree(
  files: FileTreeFiles,
  options: FileListToTreeOptions = {}
): Record<string, FileTreeNode> {
  const {
    rootId = ROOT_ID,
    rootName = ROOT_ID,
    sortComparator = defaultChildrenComparator,
  } = options;

  const tree: Record<string, FileTreeNode> = {};
  const folderChildren: Map<string, Set<string>> = new Map();

  // Initialize root's children set
  folderChildren.set(rootId, new Set());

  // Build the folder structure from file paths
  forEachFileTreeEntry(files, (inputPath, type) => {
    const parts = inputPath.split('/');
    let currentPath: string | undefined;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isTerminal = i === parts.length - 1;
      const isFolder = !isTerminal || type === 'folder';
      const parentPath = currentPath ?? rootId;
      currentPath = currentPath != null ? `${currentPath}/${part}` : part;

      let parentChildren = folderChildren.get(parentPath);
      if (parentChildren == null) {
        parentChildren = new Set();
        folderChildren.set(parentPath, parentChildren);
      }
      parentChildren.add(currentPath);

      if (isFolder) {
        if (tree[currentPath] != null) {
          throw new Error(FILE_TREE_PATH_KIND_CONFLICT_ERROR(currentPath));
        }
        if (!folderChildren.has(currentPath)) {
          folderChildren.set(currentPath, new Set());
        }
        continue;
      }

      if (folderChildren.has(currentPath)) {
        throw new Error(FILE_TREE_PATH_KIND_CONFLICT_ERROR(currentPath));
      }

      tree[currentPath] ??= { name: part, path: currentPath };
    }
  });

  // Helper to check if a path is a folder
  const isFolder = (path: string): boolean => folderChildren.has(path);

  // Helper to sort children using the configured comparator
  const sortChildrenArray = (children: string[]): string[] =>
    sortChildren(children, isFolder, sortComparator);

  // Adapter to make folderChildren work with the shared helper
  const getChildrenArray = (path: string): string[] => {
    const children = folderChildren.get(path);
    return children != null ? [...children] : [];
  };

  // Create flattening utilities with memoization
  const utils = createLoaderUtils(isFolder, getChildrenArray);

  // Track intermediate folders (those that are part of a flattened chain)
  const intermediateFolders = new Set<string>();

  // First pass: identify all intermediate folders and create flattened nodes
  for (const children of folderChildren.values()) {
    for (const child of children) {
      if (!isFolder(child)) continue;

      const flattenedEndpoint = utils.getFlattenedEndpoint(child);
      if (flattenedEndpoint == null) continue;

      // Mark all folders in the chain as intermediate (except the endpoint)
      const flattenedFolders = utils.collectFlattenedFolders(
        child,
        flattenedEndpoint
      );
      for (let i = 0; i < flattenedFolders.length - 1; i++) {
        intermediateFolders.add(flattenedFolders[i]);
      }

      // Create the flattened node if it doesn't exist
      const flattenedKey = `${FLATTENED_PREFIX}${flattenedEndpoint}`;
      if (tree[flattenedKey] != null) continue;

      const flattenedName = utils.buildFlattenedName(child, flattenedEndpoint);
      const endpointChildren = folderChildren.get(flattenedEndpoint);
      const endpointDirectChildren =
        endpointChildren != null
          ? sortChildrenArray([...endpointChildren])
          : [];
      const endpointFlattenedChildren = utils.buildFlattenedChildren(
        endpointDirectChildren
      );

      tree[flattenedKey] = {
        name: flattenedName,
        path: flattenedKey,
        flattens: flattenedFolders,
        children: {
          direct: endpointDirectChildren,
          ...(endpointFlattenedChildren != null && {
            flattened: endpointFlattenedChildren,
          }),
        },
      };
    }
  }

  // Second pass: create regular folder nodes
  for (const [path, children] of folderChildren) {
    const directChildren = sortChildrenArray([...children]);
    const isIntermediate = intermediateFolders.has(path);

    // Only compute flattened children for non-intermediate folders
    const flattenedChildren = isIntermediate
      ? undefined
      : utils.buildFlattenedChildren(directChildren);

    if (path === rootId) {
      tree[rootId] = {
        name: rootName,
        path: rootId,
        children: {
          direct: directChildren,
          ...(flattenedChildren != null && { flattened: flattenedChildren }),
        },
      };
    } else if (tree[path] == null) {
      const lastSlashIndex = path.lastIndexOf('/');
      const name = lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path;
      tree[path] = {
        name,
        path,
        children: {
          direct: directChildren,
          ...(flattenedChildren != null && { flattened: flattenedChildren }),
        },
      };
    }
  }

  const { getIdForKey } = createIdMaps(rootId);
  const mapKey = (key: string) => getIdForKey(key);
  const hashedTree: Record<string, FileTreeNode> = {};

  // Use a deterministic key order so collision resolution in createIdMaps
  // stays stable across different loaders and runtimes.
  const keys = Object.keys(tree).sort();
  for (const key of keys) {
    const node = tree[key];
    const mappedKey = mapKey(key);
    const nextNode: FileTreeNode = {
      ...node,
      ...(node.children != null && {
        children: {
          direct: node.children.direct.map(mapKey),
          ...(node.children.flattened != null && {
            flattened: node.children.flattened.map(mapKey),
          }),
        },
      }),
      ...(node.flattens != null && { flattens: node.flattens.map(mapKey) }),
    };

    hashedTree[mappedKey] = nextNode;
  }

  return hashedTree;
}
