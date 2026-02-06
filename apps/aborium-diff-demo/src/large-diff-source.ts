import type { FileContents } from '@pierre/diffs';

import composerNewSource from './composerNEW.tsx?raw';
import composerOldSource from './composerOLD.tsx?raw';

export const largeTypescriptOldSource = composerOldSource;
export const largeTypescriptNewSource = composerNewSource;

export const largeTypescriptOldFile: FileContents = {
  name: 'composer.tsx',
  lang: 'tsx',
  contents: largeTypescriptOldSource,
};

export const largeTypescriptNewFile: FileContents = {
  name: 'composer.tsx',
  lang: 'tsx',
  contents: largeTypescriptNewSource,
};
