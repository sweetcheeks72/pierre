import rawStyles from '../style.css';

const LAYER_ORDER = `@layer base, theme, tokenizer, unsafe;`;

export function wrapCoreCSS(mainCSS: string) {
  return `${LAYER_ORDER}
${rawStyles}
@layer theme {
  ${mainCSS}
}`;
}

export function wrapUnsafeCSS(unsafeCSS: string) {
  return `${LAYER_ORDER}
@layer unsafe {
  ${unsafeCSS}
}`;
}

export function wrapTokenizerCSS(tokenizerCSS: string) {
  return `${LAYER_ORDER}
@layer tokenizer {
  ${tokenizerCSS}
}`;
}
