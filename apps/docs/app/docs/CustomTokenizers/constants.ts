import type { PreloadFileOptions } from '@pierre/diffs/ssr';

import { CustomScrollbarCSS } from '@/components/CustomScrollbarCSS';

const options = {
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
  disableFileHeader: true,
  unsafeCSS: CustomScrollbarCSS,
} as const;

export const CUSTOM_TOKENIZER_REACT: PreloadFileOptions<undefined> = {
  file: {
    name: 'react_arborium_tokenizer.tsx',
    contents: `import { ArboriumTokenizer } from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import { useMemo } from 'react';

function Example({ oldFile, newFile }) {
  // Keep a stable tokenizer instance across renders.
  const tokenizer = useMemo(() => new ArboriumTokenizer(), []);

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{
        tokenizer,
        diffStyle: 'split',
        theme: { dark: 'pierre-dark', light: 'pierre-light' },
      }}
    />
  );
}`,
  },
  options,
};

export const CUSTOM_TOKENIZER_VANILLA: PreloadFileOptions<undefined> = {
  file: {
    name: 'vanilla_arborium_renderer.ts',
    contents: `import {
  ArboriumTokenizer,
  DiffHunksRenderer,
  parseDiffFromFile,
  type FileContents,
} from '@pierre/diffs';

const oldFile: FileContents = {
  name: 'main.rs',
  contents: 'fn add(a: i32, b: i32) -> i32 { a + b }\\n',
};
const newFile: FileContents = {
  name: 'main.rs',
  contents: 'fn add(x: i32, y: i32) -> i32 { x + y }\\n',
};

const tokenizer = new ArboriumTokenizer();
const diff = parseDiffFromFile(oldFile, newFile);
const renderer = new DiffHunksRenderer({
  tokenizer,
  diffStyle: 'split',
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
});

const result = await renderer.asyncRender(diff);
const wrapper = document.getElementById('diff-root');
if (wrapper != null) {
  wrapper.innerHTML = renderer.renderFullHTML(result);
}`,
  },
  options,
};

export const CUSTOM_TOKENIZER_WORKER_POOL: PreloadFileOptions<undefined> = {
  file: {
    name: 'worker_pool_arborium.tsx',
    contents: `import { MultiFileDiff, WorkerPoolContextProvider } from '@pierre/diffs/react';
import { workerFactory } from './utils/workerFactory';

function Example({ oldFile, newFile }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{ workerFactory, poolSize: 3 }}
      highlighterOptions={{
        tokenizer: 'arborium',
        theme: { dark: 'pierre-dark', light: 'pierre-light' },
        langs: ['rust', 'typescript'],
      }}
    >
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{ diffStyle: 'split' }}
      />
    </WorkerPoolContextProvider>
  );
}`,
  },
  options,
};
