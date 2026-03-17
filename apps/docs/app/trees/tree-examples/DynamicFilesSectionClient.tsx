'use client';

import { IconRefresh } from '@pierre/icons';
import type {
  ContextMenuItem,
  FileTreeEditSession,
  FileTreeSelectionItem,
} from '@pierre/trees';
import { FileTree } from '@pierre/trees/react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { FeatureHeader } from '../../diff-examples/FeatureHeader';
import {
  baseTreeOptions,
  DEFAULT_FILE_TREE_PANEL_CLASS,
  DEFAULT_FILE_TREE_PANEL_STYLE,
} from './demo-data';
import { TreeExampleSection } from './TreeExampleSection';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const INITIAL_FILES = baseTreeOptions.initialFiles ?? [];

function getParentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function removeItemFromFiles(
  currentFiles: string[],
  item: ContextMenuItem
): string[] {
  if (!item.isFolder) {
    return currentFiles.filter((path) => path !== item.path);
  }
  return currentFiles.filter(
    (path) => path !== item.path && !path.startsWith(`${item.path}/`)
  );
}

function TreeEditingContextMenu({
  item,
  onClose,
  onDelete,
  onRename,
}: {
  item: ContextMenuItem;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const itemType = item.isFolder ? 'Folder' : 'File';

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => !open && onClose()}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
            border: 0,
            padding: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={8}
        className="min-w-[220px]"
      >
        <DropdownMenuLabel className="max-w-[280px] truncate">
          {itemType}: {item.path}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onRename();
            onClose();
          }}
        >
          Rename
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onDelete();
            onClose();
          }}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DynamicFilesSectionClient({
  initialExpandedItems,
  prerenderedHTML,
}: {
  initialExpandedItems: string[];
  prerenderedHTML: string;
}) {
  const [files, setFiles] = useState(INITIAL_FILES);
  const [selection, setSelection] = useState<FileTreeSelectionItem[]>([]);
  const [editSession, setEditSession] = useState<FileTreeEditSession | null>(
    null
  );

  const fileSet = useMemo(() => new Set(files), [files]);
  const isPristine = useMemo(
    () =>
      files.length === INITIAL_FILES.length &&
      INITIAL_FILES.every((path) => fileSet.has(path)),
    [fileSet, files.length]
  );
  const primarySelection = selection[0] ?? null;
  const newFileParentPath = useMemo(() => {
    if (primarySelection == null) {
      return '';
    }
    return primarySelection.isFolder
      ? primarySelection.path
      : getParentPath(primarySelection.path);
  }, [primarySelection]);

  const handleNewFile = useCallback(() => {
    setEditSession({
      kind: 'new-file',
      ...(newFileParentPath.length > 0 && { parentPath: newFileParentPath }),
    });
  }, [newFileParentPath]);

  const handleFilesChange = useCallback((nextFiles: string[]) => {
    setFiles(nextFiles);
    setSelection([]);
    setEditSession(null);
  }, []);

  const handleReset = useCallback(() => {
    setFiles(INITIAL_FILES);
    setSelection([]);
    setEditSession(null);
  }, []);

  const handleDeleteFromContextMenu = useCallback((item: ContextMenuItem) => {
    setFiles((currentFiles) => removeItemFromFiles(currentFiles, item));
    setSelection([]);
    setEditSession(null);
  }, []);

  const handleRenameFromContextMenu = useCallback((item: ContextMenuItem) => {
    setSelection([{ path: item.path, isFolder: item.isFolder }]);
    setEditSession({
      kind: 'rename',
      targetPath: item.path,
    });
  }, []);

  return (
    <TreeExampleSection id="dynamic-files">
      <FeatureHeader
        title="Create and rename files inline"
        description={
          <>
            Control the <code>files</code> prop to update the tree whenever your
            app creates, removes, or renames files. Click <code>New file</code>{' '}
            to insert a temporary row directly in the tree, type a path, and
            press Enter to commit it. Select any item and press <code>F2</code>{' '}
            to rename it inline. Right-click any row to open a context menu with
            rename and delete actions. See the{' '}
            <Link href="/preview/trees/docs#react-api" className="inline-link">
              React API docs
            </Link>{' '}
            for the controlled props surface.
          </>
        }
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleNewFile}>
            New file
          </Button>
          <Button variant="outline" disabled={isPristine} onClick={handleReset}>
            <IconRefresh />
            Reset
          </Button>
          <div className="font-mono text-xs text-zinc-400">
            {primarySelection != null
              ? `${primarySelection.isFolder ? 'Folder' : 'File'}: ${primarySelection.path}`
              : `${files.length} file${files.length === 1 ? '' : 's'}`}
          </div>
        </div>

        <FileTree
          className={DEFAULT_FILE_TREE_PANEL_CLASS}
          editSession={editSession}
          files={files}
          initialExpandedItems={initialExpandedItems}
          onEditSessionChange={setEditSession}
          onFilesChange={handleFilesChange}
          onSelection={setSelection}
          renderContextMenu={(item, context) => (
            <TreeEditingContextMenu
              item={item}
              onClose={context.close}
              onDelete={() => handleDeleteFromContextMenu(item)}
              onRename={() => handleRenameFromContextMenu(item)}
            />
          )}
          options={{
            ...baseTreeOptions,
            id: 'dynamic-files-demo',
          }}
          prerenderedHTML={prerenderedHTML}
          style={DEFAULT_FILE_TREE_PANEL_STYLE}
        />
      </div>
    </TreeExampleSection>
  );
}
