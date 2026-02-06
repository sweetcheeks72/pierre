import { describe, expect, test } from 'bun:test';

import { DiffHunksRenderer } from '../src/renderers/DiffHunksRenderer';
import { FileRenderer } from '../src/renderers/FileRenderer';
import type { DiffsTokenizer } from '../src/types';
import {
  createHastElement,
  createTextNodeElement,
} from '../src/utils/hast_utils';
import { parseDiffFromFile } from '../src/utils/parseDiffFromFile';
import { splitFileContents } from '../src/utils/splitFileContents';

function createLineNode(content: string, index: number) {
  return createHastElement({
    tagName: 'div',
    properties: {
      'data-line': index + 1,
      'data-line-type': 'context',
      'data-line-index': `${index}`,
    },
    children: [createTextNodeElement(content)],
  });
}

describe('custom tokenizer support', () => {
  test('FileRenderer should use a custom tokenizer in async render', async () => {
    let calls = 0;
    const tokenizer: DiffsTokenizer = {
      id: 'test-tokenizer',
      capabilities: {
        supportsWorkers: false,
        supportsStreaming: false,
        supportsDecorations: false,
        supportsDualTheme: true,
      },
      async renderFile({ file }) {
        calls++;
        const lines = splitFileContents(file.contents);
        return {
          code: lines.map((line, index) => createLineNode(line, index)),
          themeStyles: '',
          baseThemeType: undefined,
        };
      },
      async renderDiff() {
        throw new Error('not implemented');
      },
    };

    const renderer = new FileRenderer({
      tokenizer,
    });
    await renderer.asyncRender({
      name: 'test.ts',
      contents: 'const x = 1;\n',
    });
    expect(calls).toBe(1);
  });

  test('DiffHunksRenderer should use a custom tokenizer in async render', async () => {
    let calls = 0;
    const tokenizer: DiffsTokenizer = {
      id: 'test-tokenizer',
      capabilities: {
        supportsWorkers: false,
        supportsStreaming: false,
        supportsDecorations: false,
        supportsDualTheme: true,
      },
      async renderFile() {
        throw new Error('not implemented');
      },
      async renderDiff({ diff }) {
        calls++;
        return {
          code: {
            additionLines: diff.additionLines.map((line, index) =>
              createLineNode(line, index)
            ),
            deletionLines: diff.deletionLines.map((line, index) =>
              createLineNode(line, index)
            ),
          },
          themeStyles: '',
          baseThemeType: undefined,
        };
      },
    };

    const renderer = new DiffHunksRenderer({
      tokenizer,
    });
    const diff = parseDiffFromFile(
      { name: 'a.ts', contents: 'const a = 1;\n' },
      { name: 'a.ts', contents: 'const a = 2;\n' }
    );
    await renderer.asyncRender(diff);
    expect(calls).toBe(1);
  });
});
