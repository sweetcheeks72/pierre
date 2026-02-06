import {
  DEFAULT_COLLAPSED_CONTEXT_THRESHOLD,
  DEFAULT_THEMES,
} from '../../constants';
import { getSharedHighlighter } from '../../highlighter/shared_highlighter';
import type {
  DiffsTokenizer,
  DiffsTokenizerCapabilities,
  DiffsTokenizerRenderDiffInput,
  DiffsTokenizerRenderFileInput,
  ForceDiffPlainTextOptions,
  ForceFilePlainTextOptions,
  ThemedDiffResult,
  ThemedFileResult,
} from '../../types';
import { getFiletypeFromFileName } from '../../utils/getFiletypeFromFileName';
import { getHighlighterOptions } from '../../utils/getHighlighterOptions';
import { renderDiffWithHighlighter } from '../../utils/renderDiffWithHighlighter';
import { renderFileWithHighlighter } from '../../utils/renderFileWithHighlighter';

const SHIKI_TOKENIZER_CAPABILITIES: DiffsTokenizerCapabilities = Object.freeze({
  supportsWorkers: true,
  supportsStreaming: true,
  supportsDecorations: true,
  supportsDualTheme: true,
});

export class ShikiTokenizer implements DiffsTokenizer {
  readonly id = 'shiki';
  readonly capabilities: DiffsTokenizerCapabilities =
    SHIKI_TOKENIZER_CAPABILITIES;

  async renderFile({
    file,
    options,
    renderOptions,
  }: DiffsTokenizerRenderFileInput): Promise<ThemedFileResult> {
    const lang = file.lang ?? getFiletypeFromFileName(file.name);
    const highlighter = await getSharedHighlighter(
      getHighlighterOptions(lang, options)
    );
    const normalizedRenderOptions: ForceFilePlainTextOptions | undefined =
      renderOptions != null
        ? {
            forcePlainText: renderOptions.forcePlainText ?? false,
            startingLine: renderOptions.startingLine,
            totalLines: renderOptions.totalLines,
            lines: renderOptions.lines,
          }
        : undefined;
    return renderFileWithHighlighter(
      file,
      highlighter,
      options,
      normalizedRenderOptions
    );
  }

  async renderDiff({
    diff,
    options,
    renderOptions,
  }: DiffsTokenizerRenderDiffInput): Promise<ThemedDiffResult> {
    const lang = diff.lang ?? getFiletypeFromFileName(diff.name);
    const highlighter = await getSharedHighlighter(
      getHighlighterOptions(lang, options)
    );
    const normalizedRenderOptions: ForceDiffPlainTextOptions = {
      forcePlainText: renderOptions?.forcePlainText ?? false,
      startingLine: renderOptions?.startingLine,
      totalLines: renderOptions?.totalLines,
      expandedHunks: renderOptions?.expandedHunks,
      collapsedContextThreshold:
        renderOptions?.collapsedContextThreshold ??
        DEFAULT_COLLAPSED_CONTEXT_THRESHOLD,
    };
    return renderDiffWithHighlighter(
      diff,
      highlighter,
      options,
      normalizedRenderOptions
    );
  }

  async preload(): Promise<void> {
    await getSharedHighlighter({
      themes: [DEFAULT_THEMES.dark, DEFAULT_THEMES.light],
      langs: ['text'],
    });
  }
}

let defaultShikiTokenizer: ShikiTokenizer | undefined;

export function getShikiTokenizer(): ShikiTokenizer {
  defaultShikiTokenizer ??= new ShikiTokenizer();
  return defaultShikiTokenizer;
}

export function isShikiTokenizer(tokenizer: DiffsTokenizer): boolean {
  return tokenizer.id === 'shiki';
}
