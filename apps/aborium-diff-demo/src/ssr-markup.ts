import { ArboriumTokenizer } from '@pierre/diffs';
import { preloadFile } from '@pierre/diffs/ssr';

import { createMockArboriumTokenizerOptions } from './arborium-mock';
import { streamExampleFile } from './example-source';

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  const normalized = withoutQuery.replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}

export function isSsrRoute(pathname: string): boolean {
  return normalizePathname(pathname) === '/ssr/aborium';
}

const TYPESCRIPT_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'switch',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const TOKEN_PATTERN =
  /\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[{}()[\].,;:]+|[+\-*/%=&|^!<>?:]+|\s+|./g;

function escapeHTML(source: string): string {
  return source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function classifyToken(token: string): string | undefined {
  if (/^\s+$/.test(token)) {
    return undefined;
  }
  if (token.startsWith('//') || token.startsWith('/*')) {
    return 'a-c';
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('`') && token.endsWith('`'))
  ) {
    return 'a-s';
  }
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    return 'a-n';
  }
  if (TYPESCRIPT_KEYWORDS.has(token)) {
    return 'a-k';
  }
  if (/^[{}()[\].,;:]+$/.test(token)) {
    return 'a-p';
  }
  if (/^[+\-*/%=&|^!<>?:]+$/.test(token)) {
    return 'a-o';
  }
  if (/^[A-Z][A-Za-z0-9_$]*$/.test(token)) {
    return 'a-t';
  }
  if (/^[a-z_$][A-Za-z0-9_$]*$/.test(token)) {
    return 'a-v';
  }
  return undefined;
}

function highlightTypeScriptLikeLine(source: string): string {
  let html = '';
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const escaped = escapeHTML(token);
    const tag = classifyToken(token);
    if (tag == null) {
      html += escaped;
    } else {
      html += `<${tag}>${escaped}</${tag}>`;
    }
  }
  return html;
}

function createSsrTokenizer(): ArboriumTokenizer {
  return new ArboriumTokenizer({
    ...createMockArboriumTokenizerOptions(),
    loadModule: () =>
      Promise.resolve({
        loadGrammar() {
          return Promise.resolve({
            highlight(source: string) {
              return highlightTypeScriptLikeLine(source);
            },
          });
        },
      }),
  });
}

export async function getSsrPrerenderedHTML(): Promise<string> {
  const tokenizer = createSsrTokenizer();
  const preloaded = await preloadFile({
    file: streamExampleFile,
    options: {
      tokenizer,
      themeType: 'dark',
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      disableFileHeader: false,
      overflow: 'scroll',
    },
  });
  return preloaded.prerenderedHTML;
}

export function renderSsrShell(prerenderedHTML?: string): string {
  const preloadedTemplate =
    prerenderedHTML != null
      ? `<template shadowrootmode="open">${prerenderedHTML}</template>`
      : '';

  return `
    <div class="layout">
      <div class="toolbar">
        <strong>Aborium SSR Demo</strong>
        <a href="/">Back To Main Demo</a>
        <button id="theme-dark">Dark Theme</button>
        <button id="theme-light">Light Theme</button>
        <button id="rerender-ssr">Rehydrate SSR</button>
        <span id="ssr-status" class="worker-status">SSR: server rendered</span>
      </div>
      <section class="panel">
        <h2>Arborium File Renderer (SSR Hydration)</h2>
        <div id="ssr-file-root" class="panel-content">${preloadedTemplate}</div>
      </section>
    </div>
  `;
}
