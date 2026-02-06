import { ArboriumTokenizer, FileStream, type ThemeTypes } from '@pierre/diffs';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
import { streamingComposerSource } from './streaming-source';

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  const normalized = withoutQuery.replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}

export function isStreamingRoute(pathname: string): boolean {
  return normalizePathname(pathname) === '/streaming';
}

export function mountStreamingDemo(app: HTMLDivElement): () => void {
  const tokenizer = new ArboriumTokenizer(createMockArboriumTokenizerOptions());
  const streamView = new FileStream({
    tokenizer,
    lang: 'tsx',
    themeType: 'dark',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    disableFileHeader: false,
  });

  let currentThemeType: ThemeTypes = 'dark';

  function createChunkedStream(source: string): ReadableStream<string> {
    const lines = source.split('\n');
    let cursor = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const minDelay = 10;
    const maxDelay = 30;

    const nextDelay = () =>
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    return new ReadableStream<string>({
      start(controller) {
        const pushNext = () => {
          if (cancelled) {
            return;
          }
          if (cursor >= lines.length) {
            controller.close();
            return;
          }

          const remaining = lines.length - cursor;
          const chunkLines = Math.min(
            remaining,
            Math.max(1, Math.floor(Math.random() * 8) + 1)
          );
          const chunk = `${lines.slice(cursor, cursor + chunkLines).join('\n')}\n`;
          cursor += chunkLines;

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
        <strong>Aborium Streaming Demo</strong>
        <a href="/">Back To Main Demo</a>
        <a href="/large-diff">Open Composer TSX Diff</a>
        <button id="theme-dark">Dark Theme</button>
        <button id="theme-light">Light Theme</button>
        <button id="stream-start">Start Stream</button>
        <button id="stream-reset">Reset Stream</button>
      </div>
      <section class="panel">
        <h2>FileStream: composerNEW.tsx</h2>
        <div id="stream-root" class="panel-content"></div>
      </section>
    </div>
  `;

  const streamRoot = globalThis.document.getElementById('stream-root');
  if (!(streamRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #stream-root container to exist');
  }
  const streamRootElement: HTMLElement = streamRoot;

  function resetStream(): void {
    streamView.cleanUp();
    streamRootElement.innerHTML = '';
  }

  function startStream(): void {
    resetStream();
    void streamView.setup(
      createChunkedStream(streamingComposerSource),
      streamRootElement
    );
  }

  function setTheme(nextThemeType: ThemeTypes): void {
    currentThemeType = nextThemeType;
    globalThis.document.documentElement.dataset.colorMode = currentThemeType;
    streamView.setThemeType(currentThemeType);
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

  setTheme(currentThemeType);
  startStream();

  return () => {
    streamView.cleanUp();
  };
}
