import { TOKENIZER_CSS_ATTRIBUTE } from '../constants';

export function createTokenizerCSSStyleNode(): HTMLStyleElement {
  const node = document.createElement('style');
  node.setAttribute(TOKENIZER_CSS_ATTRIBUTE, '');
  return node;
}
