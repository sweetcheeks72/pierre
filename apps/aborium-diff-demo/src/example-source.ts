import type { FileContents } from '@pierre/diffs';

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
