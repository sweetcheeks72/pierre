import type { ElementContent, Element as HASTElement, Properties } from 'hast';

import type {
  DiffsTokenizer,
  DiffsTokenizerCapabilities,
  DiffsTokenizerPreloadOptions,
  DiffsTokenizerRenderDiffInput,
  DiffsTokenizerRenderFileInput,
  FileDiffMetadata,
  LineTypes,
  SupportedLanguages,
  ThemedDiffResult,
  ThemedFileResult,
} from '../types';
import { getFiletypeFromFileName } from '../utils/getFiletypeFromFileName';
import { createTextNodeElement } from '../utils/hast_utils';
import { splitFileContents } from '../utils/splitFileContents';

interface ArboriumGrammar {
  highlight(source: string): string | Promise<string>;
}

export interface ArboriumModule {
  loadGrammar(language: string): Promise<ArboriumGrammar>;
}

export type ArboriumModuleLoader = () => Promise<ArboriumModule>;

export interface ArboriumTokenizerOptions {
  /**
   * Optional custom loader primarily used for tests or custom runtime module
   * resolution.
   */
  loadModule?: ArboriumModuleLoader;
  /**
   * Optional theme styles that should be attached to rendered nodes.
   */
  themeStyles?: string;
  /**
   * Optional explicit base theme type for pre/header rendering.
   */
  baseThemeType?: 'light' | 'dark';
  /**
   * If true (default), rendering falls back to plain text whenever Arborium
   * grammar loading/highlighting fails.
   */
  fallbackToPlainText?: boolean;
}

const ARBORIUM_TOKENIZER_CAPABILITIES: DiffsTokenizerCapabilities =
  Object.freeze({
    supportsWorkers: true,
    supportsStreaming: false,
    supportsDecorations: false,
    supportsDualTheme: false,
  });

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (_match, rawEntity: string) => {
      if (rawEntity.startsWith('#')) {
        const isHex = rawEntity[1]?.toLowerCase() === 'x';
        const numericValue = Number.parseInt(
          rawEntity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );
        if (
          !Number.isFinite(numericValue) ||
          numericValue < 0 ||
          numericValue > 0x10ffff
        ) {
          return _match;
        }
        return String.fromCodePoint(numericValue);
      }
      return NAMED_ENTITIES[rawEntity] ?? _match;
    }
  );
}

function createLineNode(
  lineContent: ElementContent[],
  lineIndex: number,
  lineType: LineTypes
): HASTElement {
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      'data-line': lineIndex + 1,
      'data-line-type': lineType,
      'data-line-index': `${lineIndex}`,
    },
    children: lineContent,
  };
}

function createPlainLineNode(
  content: string,
  lineIndex: number,
  lineType: LineTypes
): HASTElement {
  return createLineNode([createTextNodeElement(content)], lineIndex, lineType);
}

function parseHtmlAttributes(rawAttributes: string): Properties {
  const properties: Properties = {};
  const attributePattern =
    /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of rawAttributes.matchAll(attributePattern)) {
    const key = match[1];
    const value = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
    if (key === 'class') {
      properties.className = value.split(/\s+/).filter(Boolean);
    } else if (key === 'style') {
      properties.style = value;
    } else {
      properties[key] = value === '' ? true : value;
    }
  }
  return properties;
}

function parseInlineHtml(html: string): ElementContent[] {
  if (html === '') {
    return [];
  }

  const root = { tagName: '__root__', children: [] as ElementContent[] };
  const stack: Array<{ tagName: string; children: ElementContent[] }> = [root];
  const tokenPattern = /<\/?[^>]+>|[^<]+/g;
  const tokens = html.match(tokenPattern);

  if (tokens == null) {
    return [createTextNodeElement(decodeHtmlEntities(html))];
  }

  for (const token of tokens) {
    if (token.startsWith('</')) {
      const tagName = token.slice(2, -1).trim().toLowerCase();
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tagName === tagName) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    if (token.startsWith('<')) {
      const trimmed = token.slice(1, -1).trim();
      if (trimmed === '' || trimmed.startsWith('!')) {
        continue;
      }
      const selfClosing = trimmed.endsWith('/');
      const body = selfClosing ? trimmed.slice(0, -1).trim() : trimmed;
      const firstSpaceIndex = body.indexOf(' ');
      const rawTagName =
        firstSpaceIndex === -1 ? body : body.slice(0, firstSpaceIndex);
      const tagName = rawTagName.toLowerCase();
      const rawAttributes =
        firstSpaceIndex === -1 ? '' : body.slice(firstSpaceIndex + 1);
      const element: HASTElement = {
        type: 'element',
        tagName,
        properties: parseHtmlAttributes(rawAttributes),
        children: [],
      };
      stack[stack.length - 1].children.push(element);
      if (!selfClosing) {
        stack.push(element);
      }
      continue;
    }

    stack[stack.length - 1].children.push(
      createTextNodeElement(decodeHtmlEntities(token))
    );
  }

  return root.children;
}

function normalizeLanguage(
  language: SupportedLanguages | undefined
): SupportedLanguages | undefined {
  if (language == null || language === 'text' || language === 'ansi') {
    return undefined;
  }
  return language;
}

function resolveDiffLineTypes(diff: FileDiffMetadata): {
  additions: LineTypes[];
  deletions: LineTypes[];
} {
  const additions: LineTypes[] = new Array(diff.additionLines.length).fill(
    'context'
  );
  const deletions: LineTypes[] = new Array(diff.deletionLines.length).fill(
    'context'
  );
  for (const hunk of diff.hunks) {
    for (const hunkContent of hunk.hunkContent) {
      if (hunkContent.type !== 'change') {
        continue;
      }
      for (let i = 0; i < hunkContent.additions; i++) {
        additions[hunkContent.additionLineIndex + i] = 'change-addition';
      }
      for (let i = 0; i < hunkContent.deletions; i++) {
        deletions[hunkContent.deletionLineIndex + i] = 'change-deletion';
      }
    }
  }
  return { additions, deletions };
}

async function loadDefaultArboriumModule(): Promise<ArboriumModule> {
  const moduleName = '@arborium/arborium';
  const imported = (await import(moduleName)) as Partial<ArboriumModule>;
  if (typeof imported.loadGrammar !== 'function') {
    throw new Error(
      'ArboriumTokenizer: failed to load @arborium/arborium. Expected `loadGrammar` export.'
    );
  }
  return imported as ArboriumModule;
}

export class ArboriumTokenizer implements DiffsTokenizer {
  readonly id = 'arborium';
  readonly capabilities: DiffsTokenizerCapabilities =
    ARBORIUM_TOKENIZER_CAPABILITIES;

  private readonly loadModule: ArboriumModuleLoader;
  private readonly fallbackToPlainText: boolean;
  private readonly themeStyles: string;
  private readonly baseThemeType: 'light' | 'dark' | undefined;
  private modulePromise: Promise<ArboriumModule> | undefined;
  private grammarCache = new Map<
    SupportedLanguages,
    Promise<ArboriumGrammar>
  >();

  constructor(options: ArboriumTokenizerOptions = {}) {
    this.loadModule = options.loadModule ?? loadDefaultArboriumModule;
    this.fallbackToPlainText = options.fallbackToPlainText ?? true;
    this.themeStyles = options.themeStyles ?? '';
    this.baseThemeType = options.baseThemeType;
  }

  async preload({
    langs = [],
  }: DiffsTokenizerPreloadOptions = {}): Promise<void> {
    await Promise.all(
      langs.map(async (lang) => {
        const normalizedLang = normalizeLanguage(lang);
        if (normalizedLang == null) {
          return;
        }
        await this.getGrammar(normalizedLang);
      })
    );
  }

  async renderFile({
    file,
    renderOptions,
  }: DiffsTokenizerRenderFileInput): Promise<ThemedFileResult> {
    const forcePlainText = renderOptions?.forcePlainText ?? false;
    const fileLines = renderOptions?.lines ?? splitFileContents(file.contents);

    let startIndex = 0;
    let linesToRender = fileLines;
    if (forcePlainText) {
      const rangeStart = renderOptions?.startingLine ?? 0;
      const rangeEnd = Math.min(
        fileLines.length,
        rangeStart + (renderOptions?.totalLines ?? Number.POSITIVE_INFINITY)
      );
      startIndex = rangeStart;
      linesToRender = fileLines.slice(rangeStart, rangeEnd);
    }

    const lang = file.lang ?? getFiletypeFromFileName(file.name);
    const renderedLines = await this.renderLines({
      lines: linesToRender,
      lineType: 'context',
      language: lang,
      startIndex,
      forcePlainText,
    });

    const code = forcePlainText ? new Array(startIndex) : renderedLines;
    if (forcePlainText) {
      code.push(...renderedLines);
    }

    return {
      code,
      themeStyles: this.themeStyles,
      baseThemeType: this.baseThemeType,
    };
  }

  async renderDiff({
    diff,
    renderOptions,
  }: DiffsTokenizerRenderDiffInput): Promise<ThemedDiffResult> {
    const forcePlainText = renderOptions?.forcePlainText ?? false;
    const diffLineTypes = resolveDiffLineTypes(diff);
    const additionLanguage = diff.lang ?? getFiletypeFromFileName(diff.name);
    const deletionLanguage =
      diff.lang ?? getFiletypeFromFileName(diff.prevName ?? diff.name);

    const [deletionLines, additionLines] = await Promise.all([
      this.renderLines({
        lines: diff.deletionLines,
        lineType: 'context',
        language: deletionLanguage,
        startIndex: 0,
        forcePlainText,
        lineTypes: diffLineTypes.deletions,
      }),
      this.renderLines({
        lines: diff.additionLines,
        lineType: 'context',
        language: additionLanguage,
        startIndex: 0,
        forcePlainText,
        lineTypes: diffLineTypes.additions,
      }),
    ]);

    return {
      code: {
        deletionLines,
        additionLines,
      },
      themeStyles: this.themeStyles,
      baseThemeType: this.baseThemeType,
    };
  }

  private async renderLines({
    lines,
    lineType,
    language,
    startIndex,
    forcePlainText,
    lineTypes,
  }: {
    lines: string[];
    lineType: LineTypes;
    language: SupportedLanguages;
    startIndex: number;
    forcePlainText: boolean;
    lineTypes?: LineTypes[];
  }): Promise<ElementContent[]> {
    if (forcePlainText) {
      return lines.map((line, index) =>
        createPlainLineNode(
          line,
          startIndex + index,
          lineTypes?.[index] ?? lineType
        )
      );
    }

    const normalizedLanguage = normalizeLanguage(language);
    if (normalizedLanguage == null) {
      return lines.map((line, index) =>
        createPlainLineNode(
          line,
          startIndex + index,
          lineTypes?.[index] ?? lineType
        )
      );
    }

    let grammar: ArboriumGrammar;
    try {
      grammar = await this.getGrammar(normalizedLanguage);
    } catch (error) {
      if (!this.fallbackToPlainText) {
        throw error;
      }
      return lines.map((line, index) =>
        createPlainLineNode(
          line,
          startIndex + index,
          lineTypes?.[index] ?? lineType
        )
      );
    }

    const renderedLines = new Array<ElementContent>(lines.length);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      try {
        const hasTrailingNewline = line.endsWith('\n');
        const lineSource = hasTrailingNewline ? line.slice(0, -1) : line;
        const highlightedLine = await grammar.highlight(lineSource);
        const children = parseInlineHtml(highlightedLine);

        if (children.length === 0) {
          children.push(createTextNodeElement(lineSource));
        }
        if (hasTrailingNewline) {
          children.push(createTextNodeElement('\n'));
        }

        renderedLines[index] = createLineNode(
          children,
          startIndex + index,
          lineTypes?.[index] ?? lineType
        );
      } catch (error) {
        if (!this.fallbackToPlainText) {
          throw error;
        }
        renderedLines[index] = createPlainLineNode(
          line,
          startIndex + index,
          lineTypes?.[index] ?? lineType
        );
      }
    }
    return renderedLines;
  }

  private async getGrammar(
    language: SupportedLanguages
  ): Promise<ArboriumGrammar> {
    let grammarPromise = this.grammarCache.get(language);
    if (grammarPromise == null) {
      grammarPromise = this.getModule().then((module) =>
        module.loadGrammar(language)
      );
      this.grammarCache.set(language, grammarPromise);
    }
    try {
      return await grammarPromise;
    } catch (error) {
      this.grammarCache.delete(language);
      throw error;
    }
  }

  private getModule(): Promise<ArboriumModule> {
    this.modulePromise ??= this.loadModule();
    return this.modulePromise;
  }
}
