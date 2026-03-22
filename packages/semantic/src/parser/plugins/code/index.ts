import type { SemanticEntity } from '../../../model/entity';
import { defaultSimilarity } from '../../../model/identity';
import type { SemanticParserPlugin } from '../../plugin';
import { extractEntities } from './entity-extractor';
import { loadGrammar } from './grammar-loader';
import { getAllCodeExtensions, getLanguageConfig } from './languages';

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.slice(lastDot);
}

// Lazy-loaded Parser
let Parser: unknown = null;

function getParser(): unknown {
  if (Parser == null) {
    try {
      Parser = require('tree-sitter');
    } catch {
      return null;
    }
  }
  return Parser;
}

export class CodeParserPlugin implements SemanticParserPlugin {
  id = 'code';
  extensions = getAllCodeExtensions();

  extractEntities(content: string, filePath: string): SemanticEntity[] {
    const ParserClass = getParser();
    if (ParserClass == null) {
      return []; // tree-sitter not available, skip
    }

    const ext = getExtension(filePath);
    const config = getLanguageConfig(ext);
    if (config == null) return [];

    let grammar: unknown;
    try {
      grammar = loadGrammar(config, ext);
    } catch {
      return []; // Grammar not installed
    }

    const parser = new (ParserClass as new () => {
      setLanguage(g: unknown): void;
      parse(s: string): unknown;
    })();
    parser.setLanguage(grammar);

    const tree = parser.parse(content);
    return extractEntities(
      tree as Parameters<typeof extractEntities>[0],
      filePath,
      config,
      content
    );
  }

  computeSimilarity(a: SemanticEntity, b: SemanticEntity): number {
    return defaultSimilarity(a, b);
  }
}
