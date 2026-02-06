import { ArboriumTokenizer, File, type ThemeTypes } from '@pierre/diffs';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
import { streamExampleFile } from './example-source';
import { getSsrPrerenderedHTML, renderSsrShell } from './ssr-markup';

interface SsrWindow {
  __ABORIUM_SSR_PRELOADED_HTML__?: string;
}

export function mountSsrDemo(app: HTMLDivElement): () => void {
  const tokenizer = new ArboriumTokenizer(createMockArboriumTokenizerOptions());
  const fileView = new File({
    tokenizer,
    themeType: 'dark',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    disableFileHeader: false,
  });
  let currentThemeType: ThemeTypes = 'dark';
  let disposed = false;
  const windowWithSSR = globalThis as typeof globalThis & SsrWindow;
  const serverPrerenderedHTML = windowWithSSR.__ABORIUM_SSR_PRELOADED_HTML__;

  if (app.children.length === 0) {
    app.innerHTML = renderSsrShell();
  }

  const fileRoot = globalThis.document.getElementById('ssr-file-root');
  if (!(fileRoot instanceof HTMLDivElement)) {
    throw new Error('Expected #ssr-file-root container to exist');
  }
  const fileRootElement: HTMLDivElement = fileRoot;
  const status = globalThis.document.getElementById('ssr-status');
  if (!(status instanceof HTMLSpanElement)) {
    throw new Error('Expected #ssr-status container to exist');
  }
  const statusElement: HTMLSpanElement = status;

  function setTheme(nextThemeType: ThemeTypes): void {
    currentThemeType = nextThemeType;
    globalThis.document.documentElement.dataset.colorMode = currentThemeType;
    fileView.setThemeType(currentThemeType);
  }

  function hydrateUsingPrerenderedHTML(prerenderedHTML?: string): void {
    fileView.hydrate({
      file: streamExampleFile,
      fileContainer: fileRootElement,
      prerenderedHTML,
    });
    fileView.setThemeType(currentThemeType);
  }

  function rerenderWithClientTokenizer(): void {
    fileView.render({
      file: streamExampleFile,
      fileContainer: fileRootElement,
      forceRender: true,
    });
  }

  async function hydrateFromSsr(): Promise<void> {
    if (serverPrerenderedHTML != null || fileRootElement.shadowRoot != null) {
      statusElement.textContent = 'SSR: hydrating server markup...';
      hydrateUsingPrerenderedHTML(serverPrerenderedHTML);
      rerenderWithClientTokenizer();
      statusElement.textContent = 'SSR: hydrated (server rendered)';
      return;
    }
    statusElement.textContent = 'SSR: preloading...';
    try {
      const prerenderedHTML = await getSsrPrerenderedHTML();
      if (disposed) {
        return;
      }
      hydrateUsingPrerenderedHTML(prerenderedHTML);
      rerenderWithClientTokenizer();
      statusElement.textContent = 'SSR: hydrated';
    } catch (error) {
      statusElement.textContent = 'SSR: failed';
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
  const rehydrateButton = globalThis.document.getElementById('rerender-ssr');
  if (rehydrateButton instanceof HTMLButtonElement) {
    rehydrateButton.onclick = () => {
      void hydrateFromSsr();
    };
  }

  setTheme(currentThemeType);
  void hydrateFromSsr();

  return () => {
    disposed = true;
    fileView.cleanUp();
  };
}
