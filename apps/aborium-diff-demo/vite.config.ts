import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';

import {
  getSsrPrerenderedHTML,
  isSsrRoute,
  renderSsrShell,
} from './src/ssr-markup';

function aboriumSsrRoutePlugin(): Plugin {
  let preloadedHTMLPromise: Promise<string> | undefined;
  let styleCSSPromise: Promise<string> | undefined;

  const getPreloadedHTML = async (): Promise<string> => {
    preloadedHTMLPromise ??= getSsrPrerenderedHTML();
    return await preloadedHTMLPromise;
  };

  const getStyleCSS = async (): Promise<string> => {
    styleCSSPromise ??= readFile(
      new URL('./src/style.css', import.meta.url),
      'utf-8'
    );
    return await styleCSSPromise;
  };

  return {
    name: 'aborium-ssr-route',
    apply: 'serve',
    configureServer(server) {
      const indexHtmlUrl = new URL('./index.html', import.meta.url);
      server.middlewares.use((request, response, next) => {
        void (async () => {
          const method = request.method ?? 'GET';
          if (method !== 'GET' && method !== 'HEAD') {
            next();
            return;
          }
          const requestUrl = request.url ?? '/';
          if (!isSsrRoute(requestUrl)) {
            next();
            return;
          }

          const prerenderedHTML = await getPreloadedHTML();
          const inlineStyleCSS = await getStyleCSS();
          const rawHtml = await readFile(indexHtmlUrl, 'utf-8');
          const appHTML = `<div id="app">${renderSsrShell(prerenderedHTML)}</div>`;
          const withAppMarkup = rawHtml.replace(
            '<div id="app"></div>',
            appHTML
          );
          const withDarkMode = withAppMarkup.replace(
            '<html lang="en">',
            '<html lang="en" data-color-mode="dark">'
          );
          const withInlineStyles = withDarkMode.replace(
            '</head>',
            `<style data-aborium-ssr-inline-css>${inlineStyleCSS}</style></head>`
          );
          const withPreloadScript = withInlineStyles.replace(
            '</head>',
            `<script>window.__ABORIUM_SSR_PRELOADED_HTML__ = ${JSON.stringify(prerenderedHTML)};</script></head>`
          );
          const transformed = await server.transformIndexHtml(
            requestUrl,
            withPreloadScript
          );
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html');
          response.end(transformed);
        })().catch((error: unknown) => {
          next(error as Error);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [aboriumSsrRoutePlugin()],
});
