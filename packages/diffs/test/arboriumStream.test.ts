import { describe, expect, test } from 'bun:test';

import { ArboriumCodeToTokenTransformStream } from '../src/tokenizers/arborium';
import type { ArboriumStreamModule } from '../src/tokenizers/arborium/types';

function createMockModule(
  highlight: (source: string) => string | Promise<string>
): ArboriumStreamModule {
  return {
    loadGrammar() {
      return Promise.resolve({ highlight });
    },
  };
}

async function collectStreamTokens({
  chunks,
  highlight,
}: {
  chunks: string[];
  highlight: (source: string) => string | Promise<string>;
}) {
  const source = new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const transformed = source.pipeThrough(
    new ArboriumCodeToTokenTransformStream({
      lang: 'typescript',
      loadModule: () => Promise.resolve(createMockModule(highlight)),
    })
  );
  const reader = transformed.getReader();
  const tokens: Array<{
    content: string;
    wrappers?: Array<{
      tagName: string;
      className?: string[];
      style?: string;
      attributes?: Record<string, string | boolean>;
    }>;
  }> = [];
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    tokens.push(next.value);
  }
  return tokens;
}

describe('ArboriumCodeToTokenTransformStream', () => {
  test('preserves custom wrapper tags for streamed tokens', async () => {
    const tokens = await collectStreamTokens({
      chunks: ['const value = 1;\n'],
      highlight: (source) => `<a-b>${source}</a-b>`,
    });

    expect(tokens).toHaveLength(2);
    expect(tokens[0].content).toBe('const value = 1;');
    expect(tokens[0].wrappers?.map((wrapper) => wrapper.tagName)).toEqual([
      'a-b',
    ]);
    expect(tokens[1].content).toBe('\n');
  });

  test('preserves nested wrappers and wrapper attributes', async () => {
    const tokens = await collectStreamTokens({
      chunks: ['const value\n'],
      highlight: () =>
        '<a-b data-token="outer"><a-k class="kw" style="font-weight:600;">const</a-k> value</a-b>',
    });

    expect(tokens).toHaveLength(3);
    expect(tokens[0].content).toBe('const');
    expect(tokens[0].wrappers?.map((wrapper) => wrapper.tagName)).toEqual([
      'a-b',
      'a-k',
    ]);
    expect(tokens[0].wrappers?.[0]?.attributes).toEqual({
      'data-token': 'outer',
    });
    expect(tokens[0].wrappers?.[1]?.className).toEqual(['kw']);
    expect(tokens[0].wrappers?.[1]?.style).toBe('font-weight:600;');
    expect(tokens[1].content).toBe(' value');
    expect(tokens[1].wrappers?.map((wrapper) => wrapper.tagName)).toEqual([
      'a-b',
    ]);
    expect(tokens[2].content).toBe('\n');
  });

  test('decodes html entities in streamed tokens', async () => {
    const tokens = await collectStreamTokens({
      chunks: ['const value\n'],
      highlight: () => '<a-b>&amp;&lt;&gt;&quot;&#39;</a-b>',
    });

    expect(tokens[0].content).toBe(`&<>"'`);
    expect(tokens[0].wrappers?.map((wrapper) => wrapper.tagName)).toEqual([
      'a-b',
    ]);
    expect(tokens[1].content).toBe('\n');
  });

  test('does not load grammar for text language streams', async () => {
    let loadModuleCalls = 0;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('plain text\n');
        controller.close();
      },
    });

    const transformed = source.pipeThrough(
      new ArboriumCodeToTokenTransformStream({
        lang: 'text',
        loadModule: () => {
          loadModuleCalls++;
          return Promise.resolve(
            createMockModule((text) => `<a-b>${text}</a-b>`)
          );
        },
      })
    );
    const reader = transformed.getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(loadModuleCalls).toBe(0);
    expect(first.value?.content).toBe('plain text');
    expect(second.value?.content).toBe('\n');
  });

  test('normalizes window global before loading arborium stream module', async () => {
    const scope = globalThis as Record<string, unknown>;
    const hadWindow = 'window' in scope;
    const previousWindow = scope.window;
    scope.window = undefined;

    let sawWindowAlias = false;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('const value = 1;\n');
        controller.close();
      },
    });

    const transformed = source.pipeThrough(
      new ArboriumCodeToTokenTransformStream({
        lang: 'typescript',
        loadModule: () => {
          sawWindowAlias = scope.window === globalThis;
          return Promise.resolve(
            createMockModule((text) => `<a-b>${text}</a-b>`)
          );
        },
      })
    );

    try {
      await transformed.getReader().read();
      expect(sawWindowAlias).toBe(true);
    } finally {
      if (hadWindow) {
        scope.window = previousWindow;
      } else {
        delete scope.window;
      }
    }
  });

  test('throws when fallbackToPlainText is disabled and module loading fails', async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('const value = 1;\n');
        controller.close();
      },
    });

    const transformed = source.pipeThrough(
      new ArboriumCodeToTokenTransformStream({
        lang: 'typescript',
        fallbackToPlainText: false,
        loadModule: () => Promise.reject(new Error('missing arborium')),
      })
    );

    let thrown: unknown;
    try {
      await transformed.getReader().read();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('missing arborium');
  });

  test('throws when fallbackToPlainText is disabled and highlighting fails', async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('const value = 1;\n');
        controller.close();
      },
    });

    const transformed = source.pipeThrough(
      new ArboriumCodeToTokenTransformStream({
        lang: 'typescript',
        fallbackToPlainText: false,
        loadModule: () =>
          Promise.resolve(
            createMockModule(() => {
              throw new Error('highlight failure');
            })
          ),
      })
    );

    let thrown: unknown;
    try {
      await transformed.getReader().read();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('highlight failure');
  });
});
