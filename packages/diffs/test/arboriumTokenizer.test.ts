import { describe, expect, test } from 'bun:test';
import type { Element as HASTElement } from 'hast';

import { type ArboriumModule, ArboriumTokenizer } from '../src/tokenizers';
import { parseDiffFromFile } from '../src/utils/parseDiffFromFile';

function createMockArboriumModule(
  highlight: (source: string) => string | Promise<string>
): ArboriumModule {
  return {
    loadGrammar() {
      return Promise.resolve({ highlight });
    },
  };
}

describe('ArboriumTokenizer', () => {
  test('exposes tokenizer style config', () => {
    const tokenizer = new ArboriumTokenizer({
      tokenizerStyles: 'a-k{color:red;}',
      themeStyles: '--diffs-dark:#000;',
      baseThemeType: 'dark',
    });

    expect(tokenizer.getStyleConfig()).toEqual({
      tokenizerStyles: 'a-k{color:red;}',
      themeStyles: '--diffs-dark:#000;',
      baseThemeType: 'dark',
    });
  });

  test('renders file content with highlighted inline tags', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () =>
        Promise.resolve(
          createMockArboriumModule((source) => `<a-k>${source}</a-k>`)
        ),
    });

    const result = await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    const firstLine = result.code[0] as HASTElement;
    expect(firstLine.tagName).toBe('div');
    expect(firstLine.properties['data-line-type']).toBe('context');
    expect(result.tokenizerStyles).toBe('');

    const highlightedNode = firstLine.children[0] as HASTElement;
    expect(highlightedNode.tagName).toBe('a-k');
  });

  test('preserves parsed wrapper attributes and class/style', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () =>
        Promise.resolve(
          createMockArboriumModule(
            () =>
              '<a-k class="kw one" style="font-weight:600" data-token="outer" disabled>const</a-k>'
          )
        ),
    });

    const result = await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    const firstLine = result.code[0] as HASTElement;
    const highlightedNode = firstLine.children[0] as HASTElement;
    expect(highlightedNode.properties.className).toEqual(['kw', 'one']);
    expect(highlightedNode.properties.style).toBe('font-weight:600');
    expect(highlightedNode.properties['data-token']).toBe('outer');
    expect(highlightedNode.properties.disabled).toBe(true);
  });

  test('passes configured tokenizer styles through themed results', async () => {
    const tokenizer = new ArboriumTokenizer({
      tokenizerStyles: 'a-k{color:red;}',
      loadModule: () =>
        Promise.resolve(
          createMockArboriumModule((source) => `<a-k>${source}</a-k>`)
        ),
    });

    const result = await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    expect(result.tokenizerStyles).toBe('a-k{color:red;}');
  });

  test('renders diff additions/deletions using Arborium output', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () =>
        Promise.resolve(
          createMockArboriumModule((source) => `<span>${source}</span>`)
        ),
    });
    const diff = parseDiffFromFile(
      { name: 'a.ts', contents: 'const a = 1;\n' },
      { name: 'a.ts', contents: 'const a = 2;\n' }
    );

    const result = await tokenizer.renderDiff({
      diff,
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
        lineDiffType: 'word-alt',
      },
    });

    const deletionLine = result.code.deletionLines[0] as HASTElement;
    const additionLine = result.code.additionLines[0] as HASTElement;

    expect(deletionLine.properties['data-line-type']).toBe('change-deletion');
    expect(additionLine.properties['data-line-type']).toBe('change-addition');
  });

  test('falls back to plain text when arborium loading fails', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () => Promise.reject(new Error('missing arborium')),
      fallbackToPlainText: true,
    });

    const result = await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    const firstLine = result.code[0] as HASTElement;
    const textNode = firstLine.children[0];
    expect(textNode.type).toBe('text');
    expect('value' in textNode ? textNode.value : '').toContain('const value');
  });

  test('reuses cached grammar across preload and render', async () => {
    let loadGrammarCalls = 0;
    const tokenizer = new ArboriumTokenizer({
      loadModule: () =>
        Promise.resolve({
          loadGrammar() {
            loadGrammarCalls++;
            return Promise.resolve({
              highlight(source: string) {
                return source;
              },
            });
          },
        }),
    });

    await tokenizer.preload({ langs: ['typescript'] });
    await tokenizer.preload({ langs: ['typescript'] });
    await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    expect(loadGrammarCalls).toBe(1);
  });

  test('throws when fallbackToPlainText is disabled and arborium loading fails', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () => Promise.reject(new Error('missing arborium')),
      fallbackToPlainText: false,
    });

    let thrown: unknown;
    try {
      await tokenizer.renderFile({
        file: {
          name: 'example.ts',
          contents: 'const value = 1;\n',
        },
        options: {
          theme: 'pierre-dark',
          tokenizeMaxLineLength: 1000,
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('missing arborium');
  });

  test('throws on diff rendering when fallbackToPlainText is disabled', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () => Promise.reject(new Error('missing arborium')),
      fallbackToPlainText: false,
    });
    const diff = parseDiffFromFile(
      { name: 'a.ts', contents: 'const a = 1;\n' },
      { name: 'a.ts', contents: 'const a = 2;\n' }
    );

    let thrown: unknown;
    try {
      await tokenizer.renderDiff({
        diff,
        options: {
          theme: 'pierre-dark',
          tokenizeMaxLineLength: 1000,
          lineDiffType: 'word-alt',
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('missing arborium');
  });

  test('decodes html entities from Arborium output', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: () =>
        Promise.resolve(
          createMockArboriumModule(
            () => '<a-s>&amp;&lt;&gt;&quot;&#39;&#x27;</a-s>'
          )
        ),
    });

    const result = await tokenizer.renderFile({
      file: {
        name: 'example.ts',
        contents: 'const value = 1;\n',
      },
      options: {
        theme: 'pierre-dark',
        tokenizeMaxLineLength: 1000,
      },
    });

    const firstLine = result.code[0] as HASTElement;
    const highlightedNode = firstLine.children[0] as HASTElement;
    const textNode = highlightedNode.children[0];
    expect(textNode.type).toBe('text');
    expect('value' in textNode ? textNode.value : '').toBe(`&<>"''`);
  });

  test('normalizes window global before loading arborium module', async () => {
    const scope = globalThis as Record<string, unknown>;
    const hadWindow = 'window' in scope;
    const previousWindow = scope.window;
    scope.window = undefined;

    let sawWindowAlias = false;
    const tokenizer = new ArboriumTokenizer({
      loadModule: () => {
        sawWindowAlias = scope.window === globalThis;
        return Promise.resolve(
          createMockArboriumModule((source) => `<a-k>${source}</a-k>`)
        );
      },
    });

    try {
      await tokenizer.renderFile({
        file: {
          name: 'example.ts',
          contents: 'const value = 1;\n',
        },
        options: {
          theme: 'pierre-dark',
          tokenizeMaxLineLength: 1000,
        },
      });
      expect(sawWindowAlias).toBe(true);
    } finally {
      if (hadWindow) {
        scope.window = previousWindow;
      } else {
        delete scope.window;
      }
    }
  });
});
