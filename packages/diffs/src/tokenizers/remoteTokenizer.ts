import type { ElementContent, Element as HASTElement, Properties } from 'hast';

import {
  REMOTE_TOKEN_PROTOCOL_VERSION,
  type RemoteDiffTokenFrame,
  type RemoteDiffTokenRequest,
  type RemoteFileTokenFrame,
  type RemoteFileTokenRequest,
  type RemoteRenderedToken,
  type RemoteTokenFrameBase,
  type RemoteTokenTransport,
} from '../remoteTokens';
import type {
  Awaitable,
  DiffsTokenizer,
  DiffsTokenizerCapabilities,
  DiffsTokenizerRenderDiffInput,
  DiffsTokenizerRenderFileInput,
  LineTypes,
  ThemedDiffResult,
  ThemedFileResult,
} from '../types';
import { createHastElement, createTextNodeElement } from '../utils/hast_utils';
import { splitFileContents } from '../utils/splitFileContents';
import { getShikiTokenizer } from './shiki/shikiTokenizer';

const REMOTE_TOKENIZER_CAPABILITIES: DiffsTokenizerCapabilities = Object.freeze(
  {
    supportsWorkers: false,
    supportsStreaming: true,
    supportsDecorations: true,
    supportsDualTheme: true,
  }
);

interface RemoteCollectResult<TFrame> {
  frames: TFrame[];
  themeStyles: string;
  tokenizerStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
}

export interface RemoteTokenizerOptions {
  transport: RemoteTokenTransport;
  fallbackTokenizer?: DiffsTokenizer;
  frameTimeoutMs?: number;
  maxPendingFrames?: number;
  onRemoteError?(error: unknown): unknown;
}

export class RemoteTokenizer implements DiffsTokenizer {
  readonly id = 'remote';
  readonly capabilities: DiffsTokenizerCapabilities =
    REMOTE_TOKENIZER_CAPABILITIES;

  private readonly transport: RemoteTokenTransport;
  private readonly fallbackTokenizer: DiffsTokenizer;
  private readonly frameTimeoutMs: number;
  private readonly maxPendingFrames: number;
  private readonly onRemoteError: ((error: unknown) => unknown) | undefined;

  constructor({
    transport,
    fallbackTokenizer = getShikiTokenizer(),
    frameTimeoutMs = 5000,
    maxPendingFrames = 1024,
    onRemoteError,
  }: RemoteTokenizerOptions) {
    this.transport = transport;
    this.fallbackTokenizer = fallbackTokenizer;
    this.frameTimeoutMs = frameTimeoutMs;
    this.maxPendingFrames = maxPendingFrames;
    this.onRemoteError = onRemoteError;
  }

  async renderFile({
    file,
    options,
    renderOptions,
  }: DiffsTokenizerRenderFileInput): Promise<ThemedFileResult> {
    return this.withFallback(
      async () => {
        const request: RemoteFileTokenRequest = {
          file,
          options,
          renderOptions,
        };
        const stream = await this.transport.streamFileTokens(request);
        const { frames, themeStyles, tokenizerStyles, baseThemeType } =
          await this.collectOrderedFrames(stream, 'file');
        const expectedLines = splitFileContents(file.contents).length;
        const code = this.buildFileLines(frames, expectedLines);
        return { code, themeStyles, tokenizerStyles, baseThemeType };
      },
      () => this.fallbackTokenizer.renderFile({ file, options, renderOptions })
    );
  }

  async renderDiff({
    diff,
    options,
    renderOptions,
  }: DiffsTokenizerRenderDiffInput): Promise<ThemedDiffResult> {
    return this.withFallback(
      async () => {
        const request: RemoteDiffTokenRequest = {
          diff,
          options,
          renderOptions,
        };
        const stream = await this.transport.streamDiffTokens(request);
        const { frames, themeStyles, tokenizerStyles, baseThemeType } =
          await this.collectOrderedFrames(stream, 'diff');
        const code = this.buildDiffLines(frames, {
          additions: diff.additionLines.length,
          deletions: diff.deletionLines.length,
        });
        return { code, themeStyles, tokenizerStyles, baseThemeType };
      },
      () => this.fallbackTokenizer.renderDiff({ diff, options, renderOptions })
    );
  }

  private async withFallback<T>(
    remoteRender: () => Promise<T>,
    fallbackRender: () => Awaitable<T>
  ): Promise<T> {
    if (this.fallbackTokenizer === this) {
      throw new Error(
        'RemoteTokenizer: fallbackTokenizer must not reference the same RemoteTokenizer instance.'
      );
    }
    try {
      return await remoteRender();
    } catch (error) {
      this.onRemoteError?.(error);
      return fallbackRender();
    }
  }

  private async collectOrderedFrames(
    stream: AsyncIterable<RemoteFileTokenFrame>,
    expectedKind: 'file'
  ): Promise<RemoteCollectResult<RemoteFileTokenFrame>>;
  private async collectOrderedFrames(
    stream: AsyncIterable<RemoteDiffTokenFrame>,
    expectedKind: 'diff'
  ): Promise<RemoteCollectResult<RemoteDiffTokenFrame>>;
  private async collectOrderedFrames(
    stream: AsyncIterable<RemoteFileTokenFrame | RemoteDiffTokenFrame>,
    expectedKind: 'file' | 'diff'
  ): Promise<RemoteCollectResult<RemoteFileTokenFrame | RemoteDiffTokenFrame>> {
    const iterator = stream[Symbol.asyncIterator]();
    const frames: Array<RemoteFileTokenFrame | RemoteDiffTokenFrame> = [];
    const pendingFrames = new Map<
      number,
      RemoteFileTokenFrame | RemoteDiffTokenFrame
    >();
    let expectedSequence = 0;
    let done = false;
    let streamId: string | undefined;
    let themeStyles = '';
    let tokenizerStyles = '';
    let baseThemeType: 'light' | 'dark' | undefined;

    while (!done) {
      const next = await this.withTimeout(iterator.next());
      if (next.done === true) {
        break;
      }
      const frame = next.value;
      this.assertFrame(frame, expectedKind, streamId);
      streamId ??= frame.streamId;

      if (frame.sequence < expectedSequence) {
        continue;
      }
      if (frame.sequence > expectedSequence) {
        if (!pendingFrames.has(frame.sequence)) {
          pendingFrames.set(frame.sequence, frame);
          if (pendingFrames.size > this.maxPendingFrames) {
            throw new Error(
              `RemoteTokenizer: exceeded maxPendingFrames (${this.maxPendingFrames}) while reordering remote frames.`
            );
          }
        }
        continue;
      }

      const processed = processRemoteFrame(
        frame,
        frames,
        themeStyles,
        tokenizerStyles,
        baseThemeType
      );
      themeStyles = processed.themeStyles;
      tokenizerStyles = processed.tokenizerStyles;
      baseThemeType = processed.baseThemeType;
      done = processed.done;
      expectedSequence++;

      while (!done && pendingFrames.has(expectedSequence)) {
        const pending = pendingFrames.get(expectedSequence);
        if (pending == null) {
          break;
        }
        pendingFrames.delete(expectedSequence);
        const pendingProcessed = processRemoteFrame(
          pending,
          frames,
          themeStyles,
          tokenizerStyles,
          baseThemeType
        );
        themeStyles = pendingProcessed.themeStyles;
        tokenizerStyles = pendingProcessed.tokenizerStyles;
        baseThemeType = pendingProcessed.baseThemeType;
        done = pendingProcessed.done;
        expectedSequence++;
      }
    }

    if (!done) {
      throw new Error(
        'RemoteTokenizer: remote stream ended before receiving a done frame.'
      );
    }
    return { frames, themeStyles, tokenizerStyles, baseThemeType };
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `RemoteTokenizer: timed out waiting for remote frame after ${this.frameTimeoutMs}ms.`
              )
            );
          }, this.frameTimeoutMs);
        }),
      ]);
    } finally {
      if (timer != null) {
        clearTimeout(timer);
      }
    }
  }

  private assertFrame<TKind extends 'file' | 'diff'>(
    frame: RemoteFileTokenFrame | RemoteDiffTokenFrame,
    expectedKind: TKind,
    expectedStreamId: string | undefined
  ): asserts frame is TKind extends 'file'
    ? RemoteFileTokenFrame
    : RemoteDiffTokenFrame {
    if (frame.protocolVersion !== REMOTE_TOKEN_PROTOCOL_VERSION) {
      const expectedProtocolVersion = String(REMOTE_TOKEN_PROTOCOL_VERSION);
      throw new Error(
        `RemoteTokenizer: unsupported protocolVersion ${String(
          frame.protocolVersion
        )}. Expected ${expectedProtocolVersion}.`
      );
    }
    if (frame.kind !== expectedKind) {
      throw new Error(
        `RemoteTokenizer: expected "${expectedKind}" frame but received "${frame.kind}".`
      );
    }
    if (!Number.isInteger(frame.sequence) || frame.sequence < 0) {
      throw new Error(
        `RemoteTokenizer: invalid sequence number "${String(frame.sequence)}".`
      );
    }
    if (expectedStreamId != null && frame.streamId !== expectedStreamId) {
      throw new Error(
        `RemoteTokenizer: streamId changed from "${expectedStreamId}" to "${frame.streamId}".`
      );
    }
  }

  private buildFileLines(
    frames: RemoteFileTokenFrame[],
    expectedLineCount: number
  ): ElementContent[] {
    const lines = new Map<number, HASTElement>();
    for (const frame of frames) {
      for (const line of frame.lines) {
        lines.set(
          line.lineIndex,
          createLineNode(
            line.lineIndex,
            line.lineType ?? 'context',
            createTokenNodes(line.tokens)
          )
        );
      }
    }
    return createContiguousLines(lines, expectedLineCount, 'file');
  }

  private buildDiffLines(
    frames: RemoteDiffTokenFrame[],
    expectedLineCounts: { additions: number; deletions: number }
  ): { additionLines: ElementContent[]; deletionLines: ElementContent[] } {
    const additions = new Map<number, HASTElement>();
    const deletions = new Map<number, HASTElement>();
    for (const frame of frames) {
      for (const line of frame.lines) {
        const bucket = line.side === 'additions' ? additions : deletions;
        const fallbackLineType: LineTypes =
          line.side === 'additions' ? 'change-addition' : 'change-deletion';
        bucket.set(
          line.lineIndex,
          createLineNode(
            line.lineIndex,
            line.lineType ?? fallbackLineType,
            createTokenNodes(line.tokens)
          )
        );
      }
    }
    return {
      additionLines: createContiguousLines(
        additions,
        expectedLineCounts.additions,
        'diff additions'
      ),
      deletionLines: createContiguousLines(
        deletions,
        expectedLineCounts.deletions,
        'diff deletions'
      ),
    };
  }
}

function processRemoteFrame<TFrame extends RemoteTokenFrameBase>(
  frame: TFrame,
  orderedFrames: TFrame[],
  themeStyles: string,
  tokenizerStyles: string,
  baseThemeType: 'light' | 'dark' | undefined
): {
  done: boolean;
  themeStyles: string;
  tokenizerStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
} {
  orderedFrames.push(frame);
  return {
    done: frame.done === true,
    themeStyles: frame.theme?.themeStyles ?? themeStyles,
    tokenizerStyles: frame.theme?.tokenizerStyles ?? tokenizerStyles,
    baseThemeType: frame.theme?.baseThemeType ?? baseThemeType,
  };
}

function createContiguousLines(
  lines: Map<number, HASTElement>,
  expectedLineCount: number,
  label: string
): ElementContent[] {
  if (expectedLineCount === 0) {
    return [];
  }
  if (lines.size !== expectedLineCount) {
    throw new Error(
      `RemoteTokenizer: ${label} frame output line count mismatch. Expected ${expectedLineCount}, got ${lines.size}.`
    );
  }
  const output: ElementContent[] = new Array(expectedLineCount);
  for (let index = 0; index < expectedLineCount; index++) {
    const line = lines.get(index);
    if (line == null) {
      throw new Error(
        `RemoteTokenizer: missing ${label} line for index ${index}.`
      );
    }
    output[index] = line;
  }
  return output;
}

function createTokenNodes(tokens: RemoteRenderedToken[]): ElementContent[] {
  if (tokens.length === 0) {
    return [createTextNodeElement('')];
  }
  const output = new Array<ElementContent>(tokens.length);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const properties: Properties = {};
    const className = normalizeClassName(token.className);
    if (className != null) {
      properties.className = className;
    }
    const style = mergeTokenStyles(token.style, token.color);
    if (style != null) {
      properties.style = style;
    }
    output[index] = createHastElement({
      tagName: 'span',
      properties,
      children: [createTextNodeElement(token.content)],
    });
  }
  return output;
}

function createLineNode(
  lineIndex: number,
  lineType: LineTypes,
  children: ElementContent[]
): HASTElement {
  return createHastElement({
    tagName: 'div',
    properties: {
      'data-line': lineIndex + 1,
      'data-line-type': lineType,
      'data-line-index': `${lineIndex}`,
    },
    children,
  });
}

function normalizeClassName(
  className: string | string[] | undefined
): string[] | undefined {
  if (className == null) {
    return undefined;
  }
  const list = Array.isArray(className)
    ? className
    : className.split(/\s+/).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function mergeTokenStyles(
  style: string | undefined,
  color: string | undefined
): string | undefined {
  if (color == null) {
    return style;
  }
  if (style == null || style.trim() === '') {
    return `color:${color};`;
  }
  const suffix = style.trimEnd().endsWith(';') ? '' : ';';
  return `${style}${suffix}color:${color};`;
}
