import {
  ArboriumTokenizer,
  File,
  FileDiff,
  type ThemeTypes,
} from '@pierre/diffs';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
import { streamExampleFile } from './example-source';

export function mountMainDemo(app: HTMLDivElement): () => void {
  const tokenizer = new ArboriumTokenizer(createMockArboriumTokenizerOptions());

  const previousStreamExampleSource = streamExampleFile.contents.replace(
    'console.log(message)',
    'console.info(message)'
  );

  const oldFile = {
    ...streamExampleFile,
    contents: previousStreamExampleSource,
  };

  const newFile = streamExampleFile;
  app.innerHTML = `
    <div class="layout">
      <div class="toolbar">
        <strong>Aborium Diff Demo</strong>
        <a href="/ssr/aborium">Open SSR File Renderer</a>
        <a href="/streaming">Streaming Composer Demo</a>
        <a href="/large-diff">Large TSX Diff</a>
        <button id="theme-dark">Dark Theme</button>
        <button id="theme-light">Light Theme</button>
      </div>
      <section class="panel">
        <h2>Arborium File Renderer</h2>
        <div id="file-root" class="panel-content"></div>
      </section>
      <section class="panel">
        <h2>Arborium Diff Renderer</h2>
        <div id="diff-root" class="panel-content"></div>
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

  let currentThemeType: ThemeTypes = 'dark';

  function setTheme(nextThemeType: ThemeTypes): void {
    currentThemeType = nextThemeType;
    globalThis.document.documentElement.dataset.colorMode = currentThemeType;
    fileView.setThemeType(currentThemeType);
    diffView.setThemeType(currentThemeType);
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
  }

  const darkThemeButton = globalThis.document.getElementById('theme-dark');
  if (darkThemeButton instanceof HTMLButtonElement) {
    darkThemeButton.onclick = () => setTheme('dark');
  }
  const lightThemeButton = globalThis.document.getElementById('theme-light');
  if (lightThemeButton instanceof HTMLButtonElement) {
    lightThemeButton.onclick = () => setTheme('light');
  }

  setTheme(currentThemeType);

  return () => {
    fileView.cleanUp();
    diffView.cleanUp();
  };
}
