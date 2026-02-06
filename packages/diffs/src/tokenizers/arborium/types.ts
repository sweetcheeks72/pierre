import type { SupportedLanguages } from '../../types';

export interface ArboriumStreamToken {
  content: string;
  className?: string[];
  style?: string;
  wrappers?: ArboriumStreamTokenWrapper[];
}

export interface ArboriumStreamTokenWrapper {
  tagName: string;
  className?: string[];
  style?: string;
  attributes?: Record<string, string | boolean>;
}

interface ArboriumGrammar {
  highlight(source: string): string | Promise<string>;
}

export interface ArboriumStreamModule {
  loadGrammar(language: string): Promise<ArboriumGrammar>;
}

export type ArboriumStreamModuleLoader = () => Promise<ArboriumStreamModule>;

export interface ArboriumCodeToTokenTransformStreamOptions {
  lang?: SupportedLanguages;
  fallbackToPlainText?: boolean;
  loadModule?: ArboriumStreamModuleLoader;
}
