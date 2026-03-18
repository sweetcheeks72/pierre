import { useCallback, useEffect, useRef } from 'react';

import {
  FileTree,
  type FileTreeEditSession,
  type FileTreeEntriesInput,
  type FileTreeOptions,
  type FileTreeSelectionItem,
  type FileTreeStateConfig,
  type GitStatusEntry,
} from '../../FileTree';
import type { ContextMenuItem, ContextMenuOpenContext } from '../../types';
import { getGitStatusSignature } from '../../utils/getGitStatusSignature';
import {
  detectEntriesInputMode,
  type FileTreeInputMode,
  formatEntriesForInputMode,
} from '../../utils/normalizeEntries';

interface UseFileTreeInstanceProps<TFiles extends FileTreeEntriesInput> {
  options: FileTreeOptions;

  // Default (uncontrolled) files
  initialFiles?: TFiles;

  // Controlled files
  files?: TFiles;
  onFilesChange?: (files: TFiles) => void;

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

function emitTypedFilesChange<TFiles extends FileTreeEntriesInput>(
  onFilesChange: ((files: TFiles) => void) | undefined,
  nextFiles: FileTreeEntriesInput
): void {
  onFilesChange?.(nextFiles as TFiles);
}

type StateProps<TFiles extends FileTreeEntriesInput> = Omit<
  FileTreeStateConfig,
  'files' | 'onFilesChange'
> & {
  files?: TFiles;
  initialFiles?: TFiles;
  onFilesChange?: (files: TFiles) => void;
  filesInputMode: FileTreeInputMode;
  gitStatus?: GitStatusEntry[];
  onContextMenuOpen?: (
    item: ContextMenuItem,
    context: ContextMenuOpenContext
  ) => void;
  onContextMenuClose?: () => void;
};

export function useFileTreeInstance<
  TFiles extends FileTreeEntriesInput = string[],
>({
  options,
  initialFiles,
  files,
  onFilesChange,
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
}: UseFileTreeInstanceProps<TFiles>): UseFileTreeInstanceReturn {
  const containerRef = useRef<HTMLElement | null>(null);
  const instanceRef = useRef<FileTree | null>(null);
  const syncedGitStatusSignatureRef = useRef(getGitStatusSignature(gitStatus));
  const initialFilesInput =
    initialFiles ?? (options.initialFiles as TFiles | undefined);
  const filesInputModeRef = useRef(
    detectEntriesInputMode(files ?? initialFilesInput)
  );

  filesInputModeRef.current = detectEntriesInputMode(
    files ?? initialFilesInput,
    filesInputModeRef.current
  );

  const statePropsRef = useRef<StateProps<TFiles>>({
    files,
    initialFiles: initialFilesInput,
    onFilesChange,
    filesInputMode: filesInputModeRef.current,
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
    initialFiles: initialFilesInput,
    onFilesChange,
    filesInputMode: filesInputModeRef.current,
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
        syncedGitStatusSignatureRef.current = getGitStatusSignature(
          sp.gitStatus
        );

        return new FileTree(
          {
            ...options,
            initialFiles:
              sp.initialFiles ?? sp.files ?? options.initialFiles ?? [],
            id: existingId,
            ...(sp.gitStatus != null && { gitStatus: sp.gitStatus }),
          },
          {
            initialExpandedItems: sp.initialExpandedItems ?? sp.expandedItems,
            initialSelectedItems: sp.initialSelectedItems ?? sp.selectedItems,
            initialSearchQuery: sp.initialSearchQuery,
            editSession: sp.editSession,
            onExpandedItemsChange: sp.onExpandedItemsChange,
            onSelectedItemsChange: sp.onSelectedItemsChange,
            onSelection: sp.onSelection,
            onFilesChange:
              sp.onFilesChange == null
                ? undefined
                : (nextFiles) => {
                    emitTypedFilesChange(sp.onFilesChange, nextFiles);
                  },
            onEditSessionChange: sp.onEditSessionChange,
            onContextMenuOpen: sp.onContextMenuOpen,
            onContextMenuClose: sp.onContextMenuClose,
          }
        );
      };

      const setupControlledDnD = (instance: FileTree): void => {
        const sp = statePropsRef.current;

        if (sp.files !== undefined) {
          instance.setCallbacks({
            _onEntriesMutate: (newEntries) => {
              sp.onFilesChange?.(
                formatEntriesForInputMode<TFiles>(newEntries, sp.filesInputMode)
              );
            },
          });
        }

        if (sp.editSession !== undefined) {
          instance.setCallbacks({
            _onEditSessionChange: (session) => {
              sp.onEditSessionChange?.(session);
            },
          });
        }
      };

      const existingFileTreeId = getExistingFileTreeId();
      const isOptionsChange =
        containerRef.current === fileTreeContainer &&
        instanceRef.current != null;

      if (isOptionsChange) {
        instanceRef.current?.cleanUp();
        clearExistingFileTree();
        instanceRef.current = createInstance(existingFileTreeId);
        setupControlledDnD(instanceRef.current);
        void instanceRef.current.render({ fileTreeContainer });
      } else {
        containerRef.current = fileTreeContainer;
        const hasPrerenderedContent = existingFileTreeId != null;

        instanceRef.current = createInstance(existingFileTreeId);
        setupControlledDnD(instanceRef.current);

        if (hasPrerenderedContent) {
          void instanceRef.current.hydrate({ fileTreeContainer });
        } else {
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

  useEffect(() => {
    if (files !== undefined && instanceRef.current != null) {
      instanceRef.current.setFiles(files);
    }
  }, [files]);

  useEffect(() => {
    if (expandedItems !== undefined && instanceRef.current != null) {
      instanceRef.current.setExpandedItems(expandedItems);
    }
  }, [expandedItems]);

  useEffect(() => {
    if (selectedItems !== undefined && instanceRef.current != null) {
      instanceRef.current.setSelectedItems(selectedItems);
    }
  }, [selectedItems]);

  useEffect(() => {
    if (editSession !== undefined && instanceRef.current != null) {
      instanceRef.current.setEditSession(editSession);
    }
  }, [editSession]);

  const gitStatusSignature = getGitStatusSignature(gitStatus);

  useEffect(() => {
    const instance = instanceRef.current;
    if (instance == null) return;
    if (syncedGitStatusSignatureRef.current === gitStatusSignature) {
      return;
    }
    syncedGitStatusSignatureRef.current = gitStatusSignature;
    instance.setGitStatus(gitStatus);
  }, [gitStatus, gitStatusSignature]);

  useEffect(() => {
    instanceRef.current?.setCallbacks({
      onExpandedItemsChange,
      onSelectedItemsChange,
      onSelection,
      onFilesChange:
        onFilesChange == null
          ? undefined
          : (nextFiles) => {
              emitTypedFilesChange(onFilesChange, nextFiles);
            },
      onEditSessionChange,
      onContextMenuOpen,
      onContextMenuClose,
      ...(files !== undefined && {
        _onEntriesMutate: (newEntries) => {
          onFilesChange?.(
            formatEntriesForInputMode<TFiles>(
              newEntries,
              filesInputModeRef.current
            )
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
    onEditSessionChange,
    onContextMenuOpen,
    onContextMenuClose,
    files,
    editSession,
  ]);

  return { ref };
}
