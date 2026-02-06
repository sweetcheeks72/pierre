import type { SupportedLanguages } from '../types';
import type {
  ArboriumCodeToTokenTransformStreamOptions,
  ArboriumStreamModule,
  ArboriumStreamToken,
  ArboriumStreamTokenWrapper,
} from './types';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

interface TokenContext {
  className?: string[];
  style?: string;
  wrappers?: ArboriumStreamTokenWrapper[];
}

interface ParsedAttributes {
  className?: string[];
  style?: string;
  attributes?: Record<string, string | boolean>;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, rawEntity: string) => {
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
          return match;
        }
        return String.fromCodePoint(numericValue);
      }
      return NAMED_ENTITIES[rawEntity] ?? match;
    }
  );
}

function parseAttributes(rawAttributes: string): ParsedAttributes {
  const attributePattern =
    /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const parsedAttributes: ParsedAttributes = {};
  for (const match of rawAttributes.matchAll(attributePattern)) {
    const key = match[1];
    const value = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
    if (key === 'class') {
      const className = value.split(/\s+/).filter(Boolean);
      if (className.length > 0) {
        parsedAttributes.className = className;
      }
    } else if (key === 'style' && value.trim() !== '') {
      parsedAttributes.style = value;
    } else {
      (parsedAttributes.attributes ??= {})[key] = value === '' ? true : value;
    }
  }
  return parsedAttributes;
}

function parseHighlightedHtmlToTokens(html: string): ArboriumStreamToken[] {
  if (html === '') {
    return [];
  }
  const output: ArboriumStreamToken[] = [];
  const stack: TokenContext[] = [{}];
  const tokenPattern = /<\/?[^>]+>|[^<]+/g;
  const tokens = html.match(tokenPattern);
  if (tokens == null) {
    return [{ content: decodeHtmlEntities(html) }];
  }
  for (const token of tokens) {
    if (token.startsWith('</')) {
      if (stack.length > 1) {
        stack.pop();
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
      const parent = stack[stack.length - 1];
      const attrs = parseAttributes(rawAttributes);
      const wrapper: ArboriumStreamTokenWrapper = {
        tagName,
      };
      if (attrs.className != null && attrs.className.length > 0) {
        wrapper.className = attrs.className;
      }
      if (attrs.style != null && attrs.style.trim() !== '') {
        wrapper.style = attrs.style;
      }
      if (attrs.attributes != null) {
        wrapper.attributes = attrs.attributes;
      }
      const merged: TokenContext = {
        className:
          parent.className != null || attrs.className != null
            ? [...(parent.className ?? []), ...(attrs.className ?? [])]
            : undefined,
        style: mergeStyles(parent.style, attrs.style),
        wrappers:
          parent.wrappers != null ? [...parent.wrappers, wrapper] : [wrapper],
      };
      if (!selfClosing) {
        stack.push(merged);
      }
      continue;
    }
    const content = decodeHtmlEntities(token);
    if (content === '') {
      continue;
    }
    const context = stack[stack.length - 1];
    output.push({
      content,
      className: context.className,
      style: context.style,
      wrappers: context.wrappers,
    });
  }
  return output;
}

function mergeStyles(
  parentStyle: string | undefined,
  childStyle: string | undefined
): string | undefined {
  if (parentStyle == null || parentStyle.trim() === '') {
    return childStyle;
  }
  if (childStyle == null || childStyle.trim() === '') {
    return parentStyle;
  }
  const parentSuffix = parentStyle.trimEnd().endsWith(';') ? '' : ';';
  return `${parentStyle}${parentSuffix}${childStyle}`;
}

function normalizeLanguage(
  lang: SupportedLanguages | undefined
): Exclude<SupportedLanguages, 'text' | 'ansi'> | undefined {
  if (lang == null || lang === 'text' || lang === 'ansi') {
    return undefined;
  }
  return lang;
}

async function loadDefaultArboriumModule(): Promise<ArboriumStreamModule> {
  ensureArboriumWindowGlobal();
  const moduleName = '@arborium/arborium';
  const imported = (await import(moduleName)) as Partial<ArboriumStreamModule>;
  if (typeof imported.loadGrammar !== 'function') {
    throw new Error(
      'ArboriumStream: failed to load @arborium/arborium. Expected `loadGrammar` export.'
    );
  }
  return imported as ArboriumStreamModule;
}

/**
 * Stream transform that converts incoming code chunks into per-token spans using Arborium.
 * It emits stable lines as soon as a newline is received and flushes the final partial line.
 */
export class ArboriumCodeToTokenTransformStream extends TransformStream<
  string,
  ArboriumStreamToken
> {
  readonly options: ArboriumCodeToTokenTransformStreamOptions;

  constructor(options: ArboriumCodeToTokenTransformStreamOptions) {
    const {
      lang,
      fallbackToPlainText = true,
      loadModule = loadDefaultArboriumModule,
    } = options;
    const normalizedLang = normalizeLanguage(lang);
    let grammarPromise:
      | Promise<
          { highlight(source: string): string | Promise<string> } | undefined
        >
      | undefined;
    let lineBuffer = '';

    const getGrammar = async (): Promise<
      { highlight(source: string): string | Promise<string> } | undefined
    > => {
      if (normalizedLang == null) {
        return undefined;
      }
      ensureArboriumWindowGlobal();
      grammarPromise ??= loadModule()
        .then((module) => module.loadGrammar(normalizedLang))
        .catch((error) => {
          if (!fallbackToPlainText) {
            throw error;
          }
          return undefined;
        });
      return grammarPromise;
    };

    const emitLine = async (
      line: string,
      controller: TransformStreamDefaultController<ArboriumStreamToken>
    ) => {
      try {
        const grammar = await getGrammar();
        const tokens =
          grammar == null
            ? [{ content: line }]
            : parseHighlightedHtmlToTokens(await grammar.highlight(line));
        if (tokens.length === 0 && line !== '') {
          controller.enqueue({ content: line });
          return;
        }
        for (const token of tokens) {
          controller.enqueue(token);
        }
      } catch (error) {
        if (!fallbackToPlainText) {
          throw error;
        }
        controller.enqueue({ content: line });
      }
    };

    super({
      async transform(chunk, controller) {
        const merged = lineBuffer + chunk;
        const lines = merged.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          await emitLine(line, controller);
          controller.enqueue({ content: '\n' });
        }
      },
      async flush(controller) {
        if (lineBuffer === '') {
          return;
        }
        await emitLine(lineBuffer, controller);
      },
    });

    this.options = options;
  }
}

function ensureArboriumWindowGlobal(): void {
  const scope = globalThis as Record<string, unknown>;
  scope.window ??= scope;
}
