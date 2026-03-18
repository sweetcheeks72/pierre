import { useCallback, useEffect, useRef } from 'react';

import {
  FileTree,
  type FileTreeEditSession,
  type FileTreeEntriesInput,
  type FileTreeEntry,
  type FileTreeOptions,
  type FileTreeSelectionItem,
  type FileTreeStateConfig,
  type GitStatusEntry,
} from '../../FileTree';
import type { ContextMenuItem, ContextMenuOpenContext } from '../../types';
import { getGitStatusSignature } from '../../utils/getGitStatusSignature';

interface UseFileTreeInstanceProps {
  options: Omit<FileTreeOptions, 'initialFiles' | 'initialEntries'>;

  // Default (uncontrolled) files
  initialFiles?: string[];
  initialEntries?: FileTreeEntriesInput;

  // Controlled files
  files?: string[];
  entries?: FileTreeEntriesInput;
  onFilesChange?: (files: string[]) => void;
  onEntriesChange?: (entries: FileTreeEntry[]) => void;

  // Default (uncontrolled) state
  initialExpandedItems?: string[];
  initialSelectedItems?: string[];
  initialSearchQuery?: string | null;

  // Controlled state
  expandedItems?: string[];
  selectedItems?: string[];
  editSession?: FileTreeEditSession | null;
  onExpandedItemsChange?: (items: string[]) => void;
  onSelectedItemsChange?: (items: string[]) => void;
  onSelection?: (items: FileTreeSelectionItem[]) => void;
  onEditSessionChange?: (session: FileTreeEditSession | null) => void;

  // Context menu
  onContextMenuOpen?: (
    item: ContextMenuItem,
    context: ContextMenuOpenContext
  ) => void;
  onContextMenuClose?: () => void;

  // Git status
  gitStatus?: GitStatusEntry[];
}

interface UseFileTreeInstanceReturn {
  ref(node: HTMLElement | null): void | (() => void);
}

export function useFileTreeInstance({
  options,
  initialFiles,
  initialEntries,
  files,
  entries,
  onFilesChange,
  onEntriesChange,
  initialExpandedItems,
  initialSelectedItems,
  initialSearchQuery,
  expandedItems,
  selectedItems,
  editSession,
  onExpandedItemsChange,
  onSelectedItemsChange,
  onSelection,
  onEditSessionChange,
  onContextMenuOpen,
  onContextMenuClose,
  gitStatus,
}: UseFileTreeInstanceProps): UseFileTreeInstanceReturn {
  const containerRef = useRef<HTMLElement | null>(null);
  const instanceRef = useRef<FileTree | null>(null);
  const syncedGitStatusSignatureRef = useRef(getGitStatusSignature(gitStatus));

  // Keep a ref to the latest state-related props so the ref callback can read
  // them at creation time without including them as useMemo deps.
  const statePropsRef = useRef<
    FileTreeStateConfig & {
      initialFiles?: string[];
      initialEntries?: FileTreeEntriesInput;
      gitStatus?: GitStatusEntry[];
      onContextMenuOpen?: (
        item: ContextMenuItem,
        context: ContextMenuOpenContext
      ) => void;
      onContextMenuClose?: () => void;
    }
  >({
    files,
    entries,
    initialFiles,
    initialEntries,
    onFilesChange,
    onEntriesChange,
    editSession,
    expandedItems,
    selectedItems,
    onExpandedItemsChange,
    onSelectedItemsChange,
    onSelection,
    onEditSessionChange,
    initialExpandedItems,
    initialSelectedItems,
    gitStatus,
    initialSearchQuery,
    onContextMenuOpen,
    onContextMenuClose,
  });
  statePropsRef.current = {
    files,
    entries,
    initialFiles,
    initialEntries,
    onFilesChange,
    onEntriesChange,
    editSession,
    expandedItems,
    selectedItems,
    onExpandedItemsChange,
    onSelectedItemsChange,
    onSelection,
    onEditSessionChange,
    initialExpandedItems,
    initialSelectedItems,
    gitStatus,
    initialSearchQuery,
    onContextMenuOpen,
    onContextMenuClose,
  };

  // Ref callback that handles mount/unmount and re-runs when options change.
  // By including options in the dependency array, the callback identity changes
  // when structural options change, causing React to call cleanup then re-invoke with the
  // same DOM node - allowing us to detect and handle options changes.
  //
  // React 19: Return cleanup function, called when ref changes or element unmounts.
  const ref = useCallback(
    (fileTreeContainer: HTMLElement | null) => {
      if (fileTreeContainer == null) {
        instanceRef.current?.cleanUp();
        instanceRef.current = null;
        containerRef.current = null;
        return;
      }

      const getExistingFileTreeId = (): string | undefined => {
        const children = Array.from(
          fileTreeContainer.shadowRoot?.children ?? []
        );
        const fileTreeElement = children.find(
          (child: Element): child is HTMLElement =>
            child instanceof HTMLElement &&
            child.dataset?.fileTreeId != null &&
            child.dataset.fileTreeId.length > 0
        );
        return fileTreeElement?.dataset?.fileTreeId;
      };

      const clearExistingFileTree = (): void => {
        const children = Array.from(
          fileTreeContainer.shadowRoot?.children ?? []
        );
        const fileTreeElement = children.find(
          (child: Element): child is HTMLElement =>
            child instanceof HTMLElement &&
            child.dataset?.fileTreeId != null &&
            child.dataset.fileTreeId.length > 0
        );
        if (fileTreeElement != null) {
          fileTreeElement.replaceChildren();
        }
      };

      const createInstance = (existingId?: string): FileTree => {
        const sp = statePropsRef.current;
        const optionsWithFiles = options as FileTreeOptions;
        syncedGitStatusSignatureRef.current = getGitStatusSignature(
          sp.gitStatus
        );
        return new FileTree(
          {
            ...options,
            initialEntries:
              sp.initialEntries ??
              sp.entries ??
              sp.initialFiles ??
              sp.files ??
              optionsWithFiles.initialEntries ??
              optionsWithFiles.initialFiles ??
              [],
            id: existingId,
            ...(sp.gitStatus != null && { gitStatus: sp.gitStatus }),
          },
          {
            // Use controlled values as initial state, but do NOT pass them as
            // controlled `expandedItems`/`selectedItems` — those bake into
            // config.state in the Preact Root and override imperative updates.
            // Subsequent controlled updates flow via the useEffect below calling
            // setExpandedItems/setSelectedItems imperatively.
            initialExpandedItems: sp.initialExpandedItems ?? sp.expandedItems,
            initialSelectedItems: sp.initialSelectedItems ?? sp.selectedItems,
            initialSearchQuery: sp.initialSearchQuery,
            editSession: sp.editSession,
            onExpandedItemsChange: sp.onExpandedItemsChange,
            onSelectedItemsChange: sp.onSelectedItemsChange,
            onSelection: sp.onSelection,
            onFilesChange: sp.onFilesChange,
            onEntriesChange: sp.onEntriesChange,
            onEditSessionChange: sp.onEditSessionChange,
            onContextMenuOpen: sp.onContextMenuOpen,
            onContextMenuClose: sp.onContextMenuClose,
          }
        );
      };

      const setupControlledDnD = (inst: FileTree): void => {
        const sp = statePropsRef.current;
        if (sp.entries !== undefined) {
          inst.setCallbacks({
            _onEntriesMutate: (newEntries) => {
              sp.onEntriesChange?.(newEntries);
              sp.onFilesChange?.(
                newEntries
                  .filter((entry) => entry.type === 'file')
                  .map((entry) => entry.path)
              );
            },
          });
        } else if (sp.files !== undefined) {
          inst.setCallbacks({
            _onEntriesMutate: (newEntries) => {
              sp.onFilesChange?.(
                newEntries
                  .filter((entry) => entry.type === 'file')
                  .map((entry) => entry.path)
              );
            },
          });
        }
        if (sp.editSession !== undefined) {
          inst.setCallbacks({
            _onEditSessionChange: (session) => {
              sp.onEditSessionChange?.(session);
            },
          });
        }
      };

      const existingFileTreeId = getExistingFileTreeId();

      // Check if this is a re-run due to options change (same container, but new callback identity)
      const isOptionsChange =
        containerRef.current === fileTreeContainer &&
        instanceRef.current != null;

      if (isOptionsChange) {
        // Options changed - clean up and re-create instance
        instanceRef.current?.cleanUp();
        clearExistingFileTree();
        instanceRef.current = createInstance(existingFileTreeId);
        setupControlledDnD(instanceRef.current);
        void instanceRef.current.render({ fileTreeContainer });
      } else {
        // Initial mount
        containerRef.current = fileTreeContainer;

        // If markup already exists in the shadow root (typically via SSR
        // declarative shadow DOM), hydrate it.
        const hasPrerenderedContent = existingFileTreeId != null;

        instanceRef.current = createInstance(existingFileTreeId);
        setupControlledDnD(instanceRef.current);

        if (hasPrerenderedContent) {
          // SSR: hydrate the prerendered HTML
          void instanceRef.current.hydrate({
            fileTreeContainer,
          });
        } else {
          // CSR: render from scratch
          void instanceRef.current.render({ fileTreeContainer });
        }
      }

      return () => {
        instanceRef.current?.cleanUp();
        instanceRef.current = null;
        containerRef.current = null;
      };
    },
    [options]
  );

  // Sync controlled files imperatively (no tree recreation)
  useEffect(() => {
    if (files !== undefined && instanceRef.current != null) {
      instanceRef.current.setFiles(files);
    }
  }, [files]);

  // Sync controlled entries imperatively (no tree recreation)
  useEffect(() => {
    if (entries !== undefined && instanceRef.current != null) {
      instanceRef.current.setEntries(entries);
    }
  }, [entries]);

  // Sync controlled expanded items imperatively (no tree recreation)
  useEffect(() => {
    if (expandedItems !== undefined && instanceRef.current != null) {
      instanceRef.current.setExpandedItems(expandedItems);
    }
  }, [expandedItems]);

  // Sync controlled selected items imperatively (no tree recreation)
  useEffect(() => {
    if (selectedItems !== undefined && instanceRef.current != null) {
      instanceRef.current.setSelectedItems(selectedItems);
    }
  }, [selectedItems]);

  // Sync controlled edit session imperatively (no tree recreation)
  useEffect(() => {
    if (editSession !== undefined && instanceRef.current != null) {
      instanceRef.current.setEditSession(editSession);
    }
  }, [editSession]);

  const gitStatusSignature = getGitStatusSignature(gitStatus);

  // Sync controlled git status
  useEffect(() => {
    const instance = instanceRef.current;
    if (instance == null) return;
    if (syncedGitStatusSignatureRef.current === gitStatusSignature) {
      return;
    }
    syncedGitStatusSignatureRef.current = gitStatusSignature;
    instance.setGitStatus(gitStatus);
  }, [gitStatus, gitStatusSignature]);

  // Update callbacks without re-rendering Preact
  useEffect(() => {
    instanceRef.current?.setCallbacks({
      onExpandedItemsChange,
      onSelectedItemsChange,
      onSelection,
      onFilesChange,
      onEntriesChange,
      onEditSessionChange,
      onContextMenuOpen,
      onContextMenuClose,
      ...(files !== undefined && {
        _onEntriesMutate: (newEntries) => {
          onFilesChange?.(
            newEntries
              .filter((entry) => entry.type === 'file')
              .map((entry) => entry.path)
          );
        },
      }),
      ...(entries !== undefined && {
        _onEntriesMutate: (newEntries) => {
          onEntriesChange?.(newEntries);
          onFilesChange?.(
            newEntries
              .filter((entry) => entry.type === 'file')
              .map((entry) => entry.path)
          );
        },
      }),
      ...(editSession !== undefined && {
        _onEditSessionChange: (session) => {
          onEditSessionChange?.(session);
        },
      }),
    });
  }, [
    onExpandedItemsChange,
    onSelectedItemsChange,
    onSelection,
    onFilesChange,
    onEntriesChange,
    onEditSessionChange,
    onContextMenuOpen,
    onContextMenuClose,
    files,
    entries,
    editSession,
    options.dragAndDrop,
  ]);

  return { ref };
}
