import type {
  FileTreeEntriesInput,
  FileTreeEntry,
  FileTreeEntryType,
} from '../types';

export type FileTreeInputMode = 'paths' | 'entries';

function resolveEntryType(
  currentType: FileTreeEntryType | undefined,
  nextType: FileTreeEntryType
): FileTreeEntryType {
  if (currentType == null) {
    return nextType;
  }
  if (currentType === nextType) {
    return currentType;
  }
  // Prefer directories so parent nodes remain representable when callers
  // accidentally provide conflicting duplicates.
  return 'directory';
}

export function normalizeEntries(
  input: FileTreeEntriesInput | undefined
): FileTreeEntry[] {
  if (input == null || input.length === 0) {
    return [];
  }

  const firstItem = input[0];
  const isStringMode = typeof firstItem === 'string';
  const typeByPath = new Map<string, FileTreeEntryType>();

  if (isStringMode) {
    for (const path of input as string[]) {
      typeByPath.set(path, resolveEntryType(typeByPath.get(path), 'file'));
    }
  } else {
    for (const entry of input as FileTreeEntry[]) {
      typeByPath.set(
        entry.path,
        resolveEntryType(typeByPath.get(entry.path), entry.type)
      );
    }
  }

  return Array.from(typeByPath.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, type]) => ({ path, type }));
}

export function detectEntriesInputMode(
  input: FileTreeEntriesInput | undefined,
  fallbackMode: FileTreeInputMode = 'paths'
): FileTreeInputMode {
  if (input == null || input.length === 0) {
    return fallbackMode;
  }
  return typeof input[0] === 'string' ? 'paths' : 'entries';
}

export function entriesToFiles(entries: FileTreeEntry[]): string[] {
  return entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => entry.path);
}

export function formatEntriesForInputMode(
  entries: FileTreeEntry[],
  mode: FileTreeInputMode
): FileTreeEntriesInput;
export function formatEntriesForInputMode<TFiles extends FileTreeEntriesInput>(
  entries: FileTreeEntry[],
  mode: FileTreeInputMode
): TFiles;
export function formatEntriesForInputMode<TFiles extends FileTreeEntriesInput>(
  entries: FileTreeEntry[],
  mode: FileTreeInputMode
): TFiles {
  return (mode === 'entries' ? entries : entriesToFiles(entries)) as TFiles;
}
