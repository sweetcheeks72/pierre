import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { createHighlighterCoreSync } from 'shiki/core';

import { DEFAULT_THEMES } from '../constants';
import { attachResolvedLanguages } from '../highlighter/languages/attachResolvedLanguages';
import { attachResolvedThemes } from '../highlighter/themes/attachResolvedThemes';
import type {
  DiffsHighlighter,
  FileContents,
  FileDiffMetadata,
  RenderDiffOptions,
  RenderFileOptions,
  ThemedDiffResult,
  ThemedFileResult,
} from '../types';
import { renderDiffWithHighlighter } from '../utils/renderDiffWithHighlighter';
import { renderFileWithHighlighter } from '../utils/renderFileWithHighlighter';
import type {
  InitializeSuccessResponse,
  InitializeWorkerRequest,
  RenderDiffRequest,
  RenderDiffSuccessResponse,
  RenderErrorResponse,
  RenderFileRequest,
  RenderFileSuccessResponse,
  SetRenderOptionsWorkerRequest,
  ShikiWorkerTokenizerBootstrapData,
  ShikiWorkerTokenizerRenderPayload,
  WorkerRenderingOptions,
  WorkerRequest,
  WorkerRequestId,
  WorkerTokenizerType,
} from './types';

interface WorkerTokenizerRuntime {
  readonly type: WorkerTokenizerType;
  initialize(props: {
    renderOptions: WorkerRenderingOptions;
    bootstrap?: unknown;
  }): void;
  setRenderOptions(props: {
    renderOptions: WorkerRenderingOptions;
    bootstrap?: unknown;
  }): void;
  renderFile(props: { file: FileContents; payload?: unknown }): {
    result: ThemedFileResult;
    options: RenderFileOptions;
  };
  renderDiff(props: { diff: FileDiffMetadata; payload?: unknown }): {
    result: ThemedDiffResult;
    options: RenderDiffOptions;
  };
  dispose?(): void;
}

class ShikiWorkerTokenizerRuntime implements WorkerTokenizerRuntime {
  readonly type: WorkerTokenizerType = 'shiki';

  private highlighter: DiffsHighlighter | undefined;
  private renderOptions: WorkerRenderingOptions = {
    theme: DEFAULT_THEMES,
    tokenizeMaxLineLength: 1000,
    lineDiffType: 'word-alt',
    tokenizer: 'shiki',
  };

  initialize({
    renderOptions,
    bootstrap,
  }: {
    renderOptions: WorkerRenderingOptions;
    bootstrap?: unknown;
  }): void {
    const highlighter = this.getHighlighter();
    const data = getShikiBootstrapData(bootstrap);
    attachResolvedThemes(data.resolvedThemes, highlighter);
    if (data.resolvedLanguages != null) {
      attachResolvedLanguages(data.resolvedLanguages, highlighter);
    }
    this.renderOptions = renderOptions;
  }

  setRenderOptions({
    renderOptions,
    bootstrap,
  }: {
    renderOptions: WorkerRenderingOptions;
    bootstrap?: unknown;
  }): void {
    const highlighter = this.getHighlighter();
    const data = getShikiBootstrapData(bootstrap);
    attachResolvedThemes(data.resolvedThemes, highlighter);
    this.renderOptions = renderOptions;
  }

  renderFile({ file, payload }: { file: FileContents; payload?: unknown }): {
    result: ThemedFileResult;
    options: RenderFileOptions;
  } {
    const highlighter = this.getHighlighter();
    const resolvedLanguages = getShikiRenderPayload(payload).resolvedLanguages;
    if (resolvedLanguages != null) {
      attachResolvedLanguages(resolvedLanguages, highlighter);
    }
    const options: RenderFileOptions = {
      theme: this.renderOptions.theme,
      tokenizeMaxLineLength: this.renderOptions.tokenizeMaxLineLength,
    };
    const result = renderFileWithHighlighter(file, highlighter, options);
    return { result, options };
  }

  renderDiff({
    diff,
    payload,
  }: {
    diff: FileDiffMetadata;
    payload?: unknown;
  }): { result: ThemedDiffResult; options: RenderDiffOptions } {
    const highlighter = this.getHighlighter();
    const resolvedLanguages = getShikiRenderPayload(payload).resolvedLanguages;
    if (resolvedLanguages != null) {
      attachResolvedLanguages(resolvedLanguages, highlighter);
    }
    const options: RenderDiffOptions = {
      theme: this.renderOptions.theme,
      tokenizeMaxLineLength: this.renderOptions.tokenizeMaxLineLength,
      lineDiffType: this.renderOptions.lineDiffType,
    };
    const result = renderDiffWithHighlighter(diff, highlighter, options);
    return { result, options };
  }

  private getHighlighter(): DiffsHighlighter {
    this.highlighter ??= createHighlighterCoreSync({
      themes: [],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    }) as DiffsHighlighter;
    return this.highlighter;
  }
}

function getShikiBootstrapData(
  bootstrap: unknown
): ShikiWorkerTokenizerBootstrapData {
  const data = bootstrap as ShikiWorkerTokenizerBootstrapData | undefined;
  if (data?.resolvedThemes == null) {
    throw new Error(
      'WorkerTokenizer(shiki): tokenizer bootstrap missing resolvedThemes'
    );
  }
  return data;
}

function getShikiRenderPayload(
  payload: unknown
): ShikiWorkerTokenizerRenderPayload {
  return (payload ?? {}) as ShikiWorkerTokenizerRenderPayload;
}

function createTokenizerRuntime(
  type: WorkerTokenizerType
): WorkerTokenizerRuntime {
  switch (type) {
    case 'shiki':
      return new ShikiWorkerTokenizerRuntime();
    default:
      throw new Error(
        `WorkerTokenizer: unknown tokenizer runtime "${String(type)}"`
      );
  }
}

let tokenizerRuntime: WorkerTokenizerRuntime | undefined;

self.addEventListener('error', (event) => {
  console.error('[Diffs Worker] Unhandled error:', event.error);
});

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case 'initialize':
        handleInitialize(request);
        break;
      case 'set-render-options':
        handleSetRenderOptions(request);
        break;
      case 'file':
        handleRenderFile(request);
        break;
      case 'diff':
        handleRenderDiff(request);
        break;
      default:
        throw new Error(
          `Unknown request type: ${(request as WorkerRequest).type}`
        );
    }
  } catch (error) {
    console.error('Worker error:', error);
    sendError(request.id, error);
  }
});

function handleInitialize({
  id,
  renderOptions,
  tokenizerBootstrap,
}: InitializeWorkerRequest): void {
  if (
    tokenizerRuntime == null ||
    tokenizerRuntime.type !== tokenizerBootstrap.type
  ) {
    tokenizerRuntime?.dispose?.();
    tokenizerRuntime = createTokenizerRuntime(tokenizerBootstrap.type);
  }
  tokenizerRuntime.initialize({
    renderOptions,
    bootstrap: tokenizerBootstrap.data,
  });
  postMessage({
    type: 'success',
    id,
    requestType: 'initialize',
    sentAt: Date.now(),
  } satisfies InitializeSuccessResponse);
}

function handleSetRenderOptions({
  id,
  renderOptions,
  tokenizerBootstrap,
}: SetRenderOptionsWorkerRequest): void {
  if (
    tokenizerRuntime == null ||
    tokenizerRuntime.type !== tokenizerBootstrap.type
  ) {
    tokenizerRuntime?.dispose?.();
    tokenizerRuntime = createTokenizerRuntime(tokenizerBootstrap.type);
  }
  tokenizerRuntime.setRenderOptions({
    renderOptions,
    bootstrap: tokenizerBootstrap.data,
  });
  postMessage({
    type: 'success',
    id,
    requestType: 'set-render-options',
    sentAt: Date.now(),
  });
}

function handleRenderFile({
  id,
  file,
  tokenizerPayload,
}: RenderFileRequest): void {
  if (tokenizerRuntime == null) {
    throw new Error('WorkerTokenizer: received file request before initialize');
  }
  const { result, options } = tokenizerRuntime.renderFile({
    file,
    payload: tokenizerPayload,
  });
  sendFileSuccess(id, result, options);
}

function handleRenderDiff({
  id,
  diff,
  tokenizerPayload,
}: RenderDiffRequest): void {
  if (tokenizerRuntime == null) {
    throw new Error('WorkerTokenizer: received diff request before initialize');
  }
  const { result, options } = tokenizerRuntime.renderDiff({
    diff,
    payload: tokenizerPayload,
  });
  sendDiffSuccess(id, result, options);
}

function sendFileSuccess(
  id: WorkerRequestId,
  result: ThemedFileResult,
  options: RenderFileOptions
): void {
  postMessage({
    type: 'success',
    requestType: 'file',
    id,
    result,
    options,
    sentAt: Date.now(),
  } satisfies RenderFileSuccessResponse);
}

function sendDiffSuccess(
  id: WorkerRequestId,
  result: ThemedDiffResult,
  options: RenderDiffOptions
): void {
  postMessage({
    type: 'success',
    requestType: 'diff',
    id,
    result,
    options,
    sentAt: Date.now(),
  } satisfies RenderDiffSuccessResponse);
}

function sendError(id: WorkerRequestId, error: unknown): void {
  const response: RenderErrorResponse = {
    type: 'error',
    id,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  postMessage(response);
}
