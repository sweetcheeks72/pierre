import { describe, expect, test } from 'bun:test';
import type { Element as HASTElement } from 'hast';

import { type ArboriumModule, ArboriumTokenizer } from '../src/tokenizers';
import { parseDiffFromFile } from '../src/utils/parseDiffFromFile';

function createMockArboriumModule(
  highlight: (source: string) => string | Promise<string>
): ArboriumModule {
  return {
    async loadGrammar() {
      return { highlight };
    },
  };
}

describe('ArboriumTokenizer', () => {
  test('renders file content with highlighted inline tags', async () => {
    const tokenizer = new ArboriumTokenizer({
      loadModule: async () =>
        createMockArboriumModule((source) => `<a-k>${source}</a-k>`),
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

  test('passes configured tokenizer styles through themed results', async () => {
    const tokenizer = new ArboriumTokenizer({
      tokenizerStyles: 'a-k{color:red;}',
      loadModule: async () =>
        createMockArboriumModule((source) => `<a-k>${source}</a-k>`),
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
      loadModule: async () =>
        createMockArboriumModule((source) => `<span>${source}</span>`),
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
      loadModule: async () => {
        throw new Error('missing arborium');
      },
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
});
