import { loadGrammar as loadArboriumGrammar } from '@arborium/arborium';
import {
  ArboriumTokenizer,
  type RenderDiffOptions,
  type RenderFileOptions,
  type SupportedLanguages,
} from '@pierre/diffs';
import type {
  ArboriumWorkerTokenizerBootstrapData,
  ArboriumWorkerTokenizerRenderPayload,
  InitializeSuccessResponse,
  InitializeWorkerRequest,
  RegisterThemeSuccessResponse,
  RenderDiffRequest,
  RenderDiffSuccessResponse,
  RenderErrorResponse,
  RenderFileRequest,
  RenderFileSuccessResponse,
  SetRenderOptionsWorkerRequest,
  WorkerRenderingOptions,
  WorkerRequest,
} from '@pierre/diffs/worker';

import { themeStyles, tokenizerStyles } from './arborium-mock';

const workerScope = globalThis as Record<string, unknown>;

// Arborium stores host bindings on `window`; map it to worker global scope.
workerScope.window ??= workerScope;

const tokenizer = new ArboriumTokenizer({
  tokenizerStyles,
  themeStyles,
  loadModule: () =>
    Promise.resolve({
      async loadGrammar(language: string) {
        const grammar = await loadArboriumGrammar(language);
        if (grammar == null) {
          throw new Error(
            `Arborium demo worker: grammar "${language}" could not be loaded.`
          );
        }
        return grammar;
      },
    }),
});

let renderOptions: WorkerRenderingOptions = {
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
  tokenizeMaxLineLength: 1000,
  lineDiffType: 'word-alt',
  tokenizer: 'arborium',
};

function getBootstrapData(
  bootstrap: unknown
): ArboriumWorkerTokenizerBootstrapData {
  return (bootstrap ?? {}) as ArboriumWorkerTokenizerBootstrapData;
}

function getRenderPayload(
  payload: unknown
): ArboriumWorkerTokenizerRenderPayload {
  return (payload ?? {}) as ArboriumWorkerTokenizerRenderPayload;
}

async function maybePreloadLanguages(
  langs?: Exclude<SupportedLanguages, 'text' | 'ansi'>[]
): Promise<void> {
  if (langs == null || langs.length === 0) {
    return;
  }
  await tokenizer.preload({ langs });
}

async function handleInitialize({
  id,
  renderOptions: nextRenderOptions,
  tokenizerBootstrap,
}: InitializeWorkerRequest): Promise<void> {
  renderOptions = nextRenderOptions;
  const bootstrapData = getBootstrapData(tokenizerBootstrap.data);
  await maybePreloadLanguages(bootstrapData.preloadLanguages);
  postMessage({
    type: 'success',
    id,
    requestType: 'initialize',
    sentAt: Date.now(),
  } satisfies InitializeSuccessResponse);
}

async function handleSetRenderOptions({
  id,
  renderOptions: nextRenderOptions,
  tokenizerBootstrap,
}: SetRenderOptionsWorkerRequest): Promise<void> {
  renderOptions = nextRenderOptions;
  const bootstrapData = getBootstrapData(tokenizerBootstrap.data);
  await maybePreloadLanguages(bootstrapData.preloadLanguages);
  postMessage({
    type: 'success',
    id,
    requestType: 'set-render-options',
    sentAt: Date.now(),
  } satisfies RegisterThemeSuccessResponse);
}

async function handleRenderFile({
  id,
  file,
  tokenizerPayload,
}: RenderFileRequest): Promise<void> {
  const payload = getRenderPayload(tokenizerPayload);
  await maybePreloadLanguages(payload.preloadLanguages);
  const options: RenderFileOptions = {
    theme: renderOptions.theme,
    tokenizeMaxLineLength: renderOptions.tokenizeMaxLineLength,
  };
  const result = await tokenizer.renderFile({ file, options });
  postMessage({
    type: 'success',
    id,
    requestType: 'file',
    result,
    options,
    sentAt: Date.now(),
  } satisfies RenderFileSuccessResponse);
}

async function handleRenderDiff({
  id,
  diff,
  tokenizerPayload,
}: RenderDiffRequest): Promise<void> {
  const payload = getRenderPayload(tokenizerPayload);
  await maybePreloadLanguages(payload.preloadLanguages);
  const options: RenderDiffOptions = {
    theme: renderOptions.theme,
    tokenizeMaxLineLength: renderOptions.tokenizeMaxLineLength,
    lineDiffType: renderOptions.lineDiffType,
  };
  const result = await tokenizer.renderDiff({ diff, options });
  postMessage({
    type: 'success',
    id,
    requestType: 'diff',
    result,
    options,
    sentAt: Date.now(),
  } satisfies RenderDiffSuccessResponse);
}

function sendError(id: string, error: unknown): void {
  const toErrorMessage = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return 'Unknown error';
  };
  const normalized =
    error instanceof Error ? error : new Error(toErrorMessage(error));
  postMessage({
    type: 'error',
    id,
    error: normalized.message,
    stack: normalized.stack,
  } satisfies RenderErrorResponse);
}

let requestQueue: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  requestQueue = requestQueue.then(async () => {
    try {
      switch (request.type) {
        case 'initialize':
          await handleInitialize(request);
          break;
        case 'set-render-options':
          await handleSetRenderOptions(request);
          break;
        case 'file':
          await handleRenderFile(request);
          break;
        case 'diff':
          await handleRenderDiff(request);
          break;
        default:
          sendError(
            (request as { id: string }).id,
            new Error('Unknown worker request')
          );
      }
    } catch (error) {
      sendError(request.id, error);
    }
  });
});
