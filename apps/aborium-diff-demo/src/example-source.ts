import type { FileContents } from '@pierre/diffs';

import composerNewSource from './composerNEW.tsx?raw';
import composerOldSource from './composerOLD.tsx?raw';

export const streamExampleSource = `import { ArboriumTokenizer, FileStream } from '@pierre/diffs';

const tokenizer = new ArboriumTokenizer();
const stream = new FileStream({
  tokenizer,
  lang: 'typescript',
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
});

async function start(wrapper: HTMLElement) {
  await stream.setup(
    new ReadableStream({
      start(controller) {
        controller.enqueue("const message = 'streaming with Arborium'\\n");
        controller.enqueue('console.log(message)\\n');
        controller.close();
      },
    }),
    wrapper
  );
}
`;

export const streamExampleFile: FileContents = {
  name: 'stream-example.ts',
  lang: 'typescript',
  contents: streamExampleSource,
};
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
