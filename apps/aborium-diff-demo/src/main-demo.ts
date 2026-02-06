import {
  ArboriumTokenizer,
  File,
  FileDiff,
  FileStream,
  type ThemeTypes,
} from '@pierre/diffs';
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
// oxlint-disable-next-line import/default -- Vite worker URL provides a default export
import WorkerUrl from './arborium-worker.ts?worker&url';
import { streamExampleFile, streamExampleSource } from './example-source';

export function mountMainDemo(app: HTMLDivElement): () => void {
  const tokenizer = new ArboriumTokenizer(createMockArboriumTokenizerOptions());

  const previousStreamExampleSource = streamExampleSource.replace(
    'console.log(message)',
    'console.info(message)'
  );

  const oldFile = {
    ...streamExampleFile,
    contents: previousStreamExampleSource,
  };

  const newFile = streamExampleFile;
  const streamSource = newFile.contents;

  function createChunkedStream(source: string): ReadableStream<string> {
    let cursor = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const minDelay = 25;
    const maxDelay = 90;

    const nextDelay = () =>
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    return new ReadableStream<string>({
      start(controller) {
        const pushNext = () => {
          if (cancelled) {
            return;
          }
          if (cursor >= source.length) {
            controller.close();
            return;
          }
          const remaining = source.length - cursor;
          const chunkSize = Math.min(
            remaining,
            Math.max(1, Math.floor(Math.random() * 10) + 1)
          );
          const chunk = source.slice(cursor, cursor + chunkSize);
          cursor += chunkSize;
          try {
            controller.enqueue(chunk);
          } catch {
            cancelled = true;
            return;
          }
          timer = setTimeout(pushNext, nextDelay());
        };

        pushNext();
      },
      cancel() {
        cancelled = true;
        if (timer != null) {
          clearTimeout(timer);
        }
      },
    });
  }

  app.innerHTML = `
    <div class="layout">
      <div class="toolbar">
        <strong>Aborium Diff Demo</strong>
        <a href="/ssr/aborium">Open SSR File Renderer</a>
        <button id="theme-dark">Dark Theme</button>
        <button id="theme-light">Light Theme</button>
        <button id="stream-start">Start Stream</button>
        <button id="stream-reset">Reset Stream</button>
        <button id="worker-render">Render Worker Examples</button>
        <span id="worker-status" class="worker-status">Worker: idle</span>
      </div>
      <section class="panel">
        <h2>Arborium File Renderer</h2>
        <div id="file-root" class="panel-content"></div>
      </section>
      <section class="panel">
        <h2>Arborium Diff Renderer</h2>
        <div id="diff-root" class="panel-content"></div>
      </section>
      <section class="panel">
        <h2>Arborium Worker File Renderer</h2>
        <div id="worker-file-root" class="panel-content"></div>
      </section>
      <section class="panel">
        <h2>Arborium Worker Diff Renderer</h2>
        <div id="worker-diff-root" class="panel-content"></div>
      </section>
      <section class="panel">
        <h2>Arborium FileStream</h2>
        <div id="stream-root" class="panel-content"></div>
      </section>
    </div>
  `;

  const fileRoot = globalThis.document.getElementById('file-root');
  if (!(fileRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #file-root container to exist');
  }
  const fileRootElement: HTMLElement = fileRoot;
  const diffRoot = globalThis.document.getElementById('diff-root');
  if (!(diffRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #diff-root container to exist');
  }
  const diffRootElement: HTMLElement = diffRoot;
  const streamRoot = globalThis.document.getElementById('stream-root');
  if (!(streamRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #stream-root container to exist');
  }
  const streamRootElement: HTMLElement = streamRoot;
  const workerFileRoot = globalThis.document.getElementById('worker-file-root');
  if (!(workerFileRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #worker-file-root container to exist');
  }
  const workerFileRootElement: HTMLElement = workerFileRoot;
  const workerDiffRoot = globalThis.document.getElementById('worker-diff-root');
  if (!(workerDiffRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #worker-diff-root container to exist');
  }
  const workerDiffRootElement: HTMLElement = workerDiffRoot;
  const workerStatus = globalThis.document.getElementById('worker-status');
  if (!(workerStatus instanceof HTMLSpanElement)) {
    throw new Error('Expected #worker-status container to exist');
  }
  const workerStatusElement: HTMLElement = workerStatus;

  const fileView = new File({
    tokenizer,
    themeType: 'dark',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    disableFileHeader: false,
  });

  const diffView = new FileDiff({
    tokenizer,
    themeType: 'dark',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    diffStyle: 'split',
    disableFileHeader: false,
  });

  const streamView = new FileStream({
    tokenizer,
    lang: 'typescript',
    themeType: 'dark',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    disableFileHeader: true,
  });
  const workerPool = getOrCreateWorkerPoolSingleton({
    poolOptions: {
      workerFactory() {
        return new Worker(WorkerUrl, { type: 'module' });
      },
      poolSize: 2,
    },
    highlighterOptions: {
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      langs: ['typescript'],
      tokenizer: 'arborium',
    },
  });
  const workerFileView = new File(
    {
      tokenizer,
      themeType: 'dark',
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      disableFileHeader: false,
    },
    workerPool
  );
  const workerDiffView = new FileDiff(
    {
      tokenizer,
      themeType: 'dark',
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      diffStyle: 'split',
      disableFileHeader: false,
    },
    workerPool
  );

  let currentThemeType: ThemeTypes = 'dark';

  function resetStream(): void {
    streamView.cleanUp();
    streamRootElement.innerHTML = '';
  }

  function startStream(): void {
    resetStream();
    void streamView.setup(createChunkedStream(streamSource), streamRootElement);
  }

  function renderWorkerExamples(forceRender = false): void {
    workerFileView.render({
      file: newFile,
      containerWrapper: workerFileRootElement,
      forceRender,
    });
    workerDiffView.render({
      oldFile,
      newFile,
      containerWrapper: workerDiffRootElement,
      forceRender,
    });
  }

  async function initializeAndRenderWorkerExamples(): Promise<void> {
    workerStatusElement.textContent = 'Worker: initializing...';
    try {
      await workerPool.initialize(['typescript']);
      workerStatusElement.textContent = 'Worker: ready';
      renderWorkerExamples(true);
    } catch (error) {
      workerStatusElement.textContent = 'Worker: failed';
      console.error(error);
    }
  }

  function setTheme(nextThemeType: ThemeTypes): void {
    currentThemeType = nextThemeType;
    globalThis.document.documentElement.dataset.colorMode = currentThemeType;
    fileView.setThemeType(currentThemeType);
    diffView.setThemeType(currentThemeType);
    streamView.setThemeType(currentThemeType);
    workerFileView.setThemeType(currentThemeType);
    workerDiffView.setThemeType(currentThemeType);
    fileView.render({
      file: newFile,
      containerWrapper: fileRootElement,
      forceRender: true,
    });
    diffView.render({
      oldFile,
      newFile,
      containerWrapper: diffRootElement,
      forceRender: true,
    });
    renderWorkerExamples(true);
  }

  const darkThemeButton = globalThis.document.getElementById('theme-dark');
  if (darkThemeButton instanceof HTMLButtonElement) {
    darkThemeButton.onclick = () => setTheme('dark');
  }
  const lightThemeButton = globalThis.document.getElementById('theme-light');
  if (lightThemeButton instanceof HTMLButtonElement) {
    lightThemeButton.onclick = () => setTheme('light');
  }
  const streamStartButton = globalThis.document.getElementById('stream-start');
  if (streamStartButton instanceof HTMLButtonElement) {
    streamStartButton.onclick = startStream;
  }
  const streamResetButton = globalThis.document.getElementById('stream-reset');
  if (streamResetButton instanceof HTMLButtonElement) {
    streamResetButton.onclick = resetStream;
  }
  const workerRenderButton =
    globalThis.document.getElementById('worker-render');
  if (workerRenderButton instanceof HTMLButtonElement) {
    workerRenderButton.onclick = () => {
      void initializeAndRenderWorkerExamples();
    };
  }

  setTheme(currentThemeType);
  startStream();
  void initializeAndRenderWorkerExamples();

  return () => {
    fileView.cleanUp();
    diffView.cleanUp();
    streamView.cleanUp();
    workerFileView.cleanUp();
    workerDiffView.cleanUp();
    workerPool.terminate();
  };
}
