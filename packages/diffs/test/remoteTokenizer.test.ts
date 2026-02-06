import { describe, expect, test } from 'bun:test';
import type { Element as HASTElement } from 'hast';

import {
  REMOTE_TOKEN_PROTOCOL_VERSION,
  type RemoteTokenTransport,
} from '../src/remoteTokens';
import { RemoteTokenizer } from '../src/tokenizers';
import type { DiffsTokenizer } from '../src/types';
import {
  createHastElement,
  createTextNodeElement,
} from '../src/utils/hast_utils';
import { parseDiffFromFile } from '../src/utils/parseDiffFromFile';
import { splitFileContents } from '../src/utils/splitFileContents';

function createFallbackTokenizer(themeStyles = 'fallback'): {
  tokenizer: DiffsTokenizer;
  calls: { file: number; diff: number };
} {
  const calls = { file: 0, diff: 0 };
  const tokenizer: DiffsTokenizer = {
    id: 'fallback-tokenizer',
    capabilities: {
      supportsWorkers: false,
      supportsStreaming: false,
      supportsDecorations: false,
      supportsDualTheme: true,
    },
    renderFile({ file }) {
      calls.file++;
      return {
        code: splitFileContents(file.contents).map((line, lineIndex) =>
          createLineNode(line, lineIndex, 'context')
        ),
        themeStyles,
        baseThemeType: undefined,
      };
    },
    renderDiff({ diff }) {
      calls.diff++;
      return {
        code: {
          additionLines: diff.additionLines.map((line, lineIndex) =>
            createLineNode(line, lineIndex, 'change-addition')
          ),
          deletionLines: diff.deletionLines.map((line, lineIndex) =>
            createLineNode(line, lineIndex, 'change-deletion')
          ),
        },
        themeStyles,
        baseThemeType: undefined,
      };
    },
  };
  return { tokenizer, calls };
}

function createLineNode(
  content: string,
  lineIndex: number,
  lineType: 'context' | 'change-addition' | 'change-deletion'
): HASTElement {
  return createHastElement({
    tagName: 'div',
    properties: {
      'data-line': lineIndex + 1,
      'data-line-type': lineType,
      'data-line-index': `${lineIndex}`,
    },
    children: [createTextNodeElement(content)],
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createAsyncFrameStream<T>(
  frames: T[],
  delayBeforeFirstFrameMs = 0
): AsyncIterable<T> {
  return (async function* () {
    await sleep(delayBeforeFirstFrameMs);
    for (const frame of frames) {
      yield frame;
    }
  })();
}

describe('RemoteTokenizer', () => {
  test('renders file output from ordered/duplicate remote frames', async () => {
    const { tokenizer: fallbackTokenizer, calls } = createFallbackTokenizer();
    const transport: RemoteTokenTransport = {
      streamFileTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'file-1',
            sequence: 1,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [{ lineIndex: 1, tokens: [{ content: 'const y = 2;\n' }] }],
          },
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'file-1',
            sequence: 0,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            theme: { themeStyles: '--mock:1;', baseThemeType: 'dark' as const },
            lines: [{ lineIndex: 0, tokens: [{ content: 'const x = 1;\n' }] }],
          },
          // Duplicate sequence should be ignored.
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'file-1',
            sequence: 0,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [{ lineIndex: 0, tokens: [{ content: 'SHOULD-NOT-WIN' }] }],
          },
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'file-1',
            sequence: 2,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [],
            done: true,
          },
        ]);
      },
      streamDiffTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'unused',
            sequence: 0,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'unused' },
            lines: [],
            done: true,
          },
        ]);
      },
    };
    const tokenizer = new RemoteTokenizer({
      transport,
      fallbackTokenizer,
    });

    const result = await tokenizer.renderFile({
      file: { name: 'a.ts', contents: 'const x = 1;\nconst y = 2;\n' },
      options: { theme: 'pierre-dark', tokenizeMaxLineLength: 1000 },
    });

    expect(calls.file).toBe(0);
    expect(result.themeStyles).toBe('--mock:1;');
    expect(result.baseThemeType).toBe('dark');
    expect(result.code.length).toBe(2);

    const line0 = result.code[0] as HASTElement;
    const token0 = line0.children[0] as HASTElement;
    expect(token0.children[0]).toEqual({
      type: 'text',
      value: 'const x = 1;\n',
    });
  });

  test('falls back when remote stream is incomplete', async () => {
    const { tokenizer: fallbackTokenizer, calls } =
      createFallbackTokenizer('fallback-theme');
    const transport: RemoteTokenTransport = {
      streamFileTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'file-2',
            sequence: 0,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [{ lineIndex: 0, tokens: [{ content: 'const x = 1;\n' }] }],
            // No done marker
          },
        ]);
      },
      streamDiffTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'unused',
            sequence: 0,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'unused' },
            lines: [],
            done: true,
          },
        ]);
      },
    };
    const tokenizer = new RemoteTokenizer({
      transport,
      fallbackTokenizer,
    });

    const result = await tokenizer.renderFile({
      file: { name: 'a.ts', contents: 'const x = 1;\n' },
      options: { theme: 'pierre-dark', tokenizeMaxLineLength: 1000 },
    });

    expect(calls.file).toBe(1);
    expect(result.themeStyles).toBe('fallback-theme');
  });

  test('renders diff output from remote frames', async () => {
    const { tokenizer: fallbackTokenizer, calls } = createFallbackTokenizer();
    const transport: RemoteTokenTransport = {
      streamFileTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'unused',
            sequence: 0,
            kind: 'file' as const,
            source: { provider: 'mock', resourceId: 'unused' },
            lines: [],
            done: true,
          },
        ]);
      },
      streamDiffTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'diff-1',
            sequence: 1,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [
              {
                side: 'additions' as const,
                lineIndex: 0,
                tokens: [{ content: 'const a = 2;\n' }],
              },
            ],
          },
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'diff-1',
            sequence: 0,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [
              {
                side: 'deletions' as const,
                lineIndex: 0,
                tokens: [{ content: 'const a = 1;\n' }],
              },
            ],
          },
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'diff-1',
            sequence: 2,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'a.ts' },
            lines: [],
            done: true,
          },
        ]);
      },
    };
    const tokenizer = new RemoteTokenizer({
      transport,
      fallbackTokenizer,
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

    expect(calls.diff).toBe(0);
    const deletion = result.code.deletionLines[0] as HASTElement;
    const addition = result.code.additionLines[0] as HASTElement;
    expect(deletion.properties['data-line-type']).toBe('change-deletion');
    expect(addition.properties['data-line-type']).toBe('change-addition');
  });

  test('falls back when remote frame times out', async () => {
    const { tokenizer: fallbackTokenizer, calls } = createFallbackTokenizer();
    const transport: RemoteTokenTransport = {
      streamFileTokens() {
        return createAsyncFrameStream(
          [
            {
              protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
              streamId: 'file-timeout',
              sequence: 0,
              kind: 'file' as const,
              source: { provider: 'mock', resourceId: 'a.ts' },
              lines: [{ lineIndex: 0, tokens: [{ content: 'late frame' }] }],
              done: true,
            },
          ],
          25
        );
      },
      streamDiffTokens() {
        return createAsyncFrameStream([
          {
            protocolVersion: REMOTE_TOKEN_PROTOCOL_VERSION,
            streamId: 'unused',
            sequence: 0,
            kind: 'diff' as const,
            source: { provider: 'mock', resourceId: 'unused' },
            lines: [],
            done: true,
          },
        ]);
      },
    };
    const tokenizer = new RemoteTokenizer({
      transport,
      fallbackTokenizer,
      frameTimeoutMs: 5,
    });

    await tokenizer.renderFile({
      file: { name: 'a.ts', contents: 'const x = 1;\n' },
      options: { theme: 'pierre-dark', tokenizeMaxLineLength: 1000 },
    });

    expect(calls.file).toBe(1);
  });
});
