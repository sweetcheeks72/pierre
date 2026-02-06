import { ArboriumTokenizer, FileDiff, type ThemeTypes } from '@pierre/diffs';
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
// oxlint-disable-next-line import/default -- Vite worker URL provides a default export
import WorkerUrl from './arborium-worker.ts?worker&url';
import {
  largeTypescriptNewFile,
  largeTypescriptOldFile,
} from './large-diff-source';

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  const normalized = withoutQuery.replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}

export function isLargeDiffRoute(pathname: string): boolean {
  return normalizePathname(pathname) === '/large-diff';
}

export function mountLargeDiffDemo(app: HTMLDivElement): () => void {
  const tokenizer = new ArboriumTokenizer(createMockArboriumTokenizerOptions());
  const workerPool = getOrCreateWorkerPoolSingleton({
    poolOptions: {
      workerFactory() {
        return new Worker(WorkerUrl, { type: 'module' });
      },
      poolSize: 2,
    },
    highlighterOptions: {
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      langs: ['tsx'],
      tokenizer: 'arborium',
    },
  });
  const diffView = new FileDiff(
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
  let workerReady = false;

  app.innerHTML = `
    <div class="layout">
      <div class="toolbar">
        <strong>Aborium Composer Diff Demo</strong>
        <a href="/">Back To Main Demo</a>
        <a href="/ssr/aborium">Open SSR File Renderer</a>
        <button id="theme-dark">Dark Theme</button>
        <button id="theme-light">Light Theme</button>
        <button id="worker-render">Render Worker Diff</button>
        <span id="worker-status" class="worker-status">Worker: idle</span>
      </div>
      <section class="panel">
        <h2>Full File Diff: composerOLD.tsx -> composerNEW.tsx</h2>
        <div id="large-diff-root" class="panel-content"></div>
      </section>
    </div>
  `;

  const largeDiffRoot = globalThis.document.getElementById('large-diff-root');
  if (!(largeDiffRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #large-diff-root container to exist');
  }
  const largeDiffRootElement: HTMLElement = largeDiffRoot;
  const workerStatus = globalThis.document.getElementById('worker-status');
  if (!(workerStatus instanceof HTMLSpanElement)) {
    throw new Error('Expected #worker-status container to exist');
  }
  const workerStatusElement: HTMLElement = workerStatus;

  function renderLargeDiff(forceRender = false): void {
    diffView.render({
      oldFile: largeTypescriptOldFile,
      newFile: largeTypescriptNewFile,
      containerWrapper: largeDiffRootElement,
      forceRender,
    });
  }

  function setTheme(nextThemeType: ThemeTypes): void {
    currentThemeType = nextThemeType;
    globalThis.document.documentElement.dataset.colorMode = currentThemeType;
    diffView.setThemeType(currentThemeType);
    if (workerReady) {
      renderLargeDiff(true);
    }
  }

  async function initializeAndRenderLargeDiff(): Promise<void> {
    workerStatusElement.textContent = 'Worker: initializing...';
    try {
      await workerPool.initialize(['tsx']);
      workerReady = true;
      workerStatusElement.textContent = 'Worker: ready';
      renderLargeDiff(true);
    } catch (error) {
      workerStatusElement.textContent = 'Worker: failed';
      console.error(error);
    }
  }

  const darkThemeButton = globalThis.document.getElementById('theme-dark');
  if (darkThemeButton instanceof HTMLButtonElement) {
    darkThemeButton.onclick = () => setTheme('dark');
  }
  const lightThemeButton = globalThis.document.getElementById('theme-light');
  if (lightThemeButton instanceof HTMLButtonElement) {
    lightThemeButton.onclick = () => setTheme('light');
  }
  const workerRenderButton =
    globalThis.document.getElementById('worker-render');
  if (workerRenderButton instanceof HTMLButtonElement) {
    workerRenderButton.onclick = () => {
      void initializeAndRenderLargeDiff();
    };
  }

  setTheme(currentThemeType);
  void initializeAndRenderLargeDiff();

  return () => {
    diffView.cleanUp();
    workerPool.terminate();
  };
}
