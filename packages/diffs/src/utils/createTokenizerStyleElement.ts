import type { Element as HASTElement } from 'hast';

import { TOKENIZER_CSS_ATTRIBUTE } from '../constants';
import { wrapTokenizerCSS } from './cssWrappers';
import { createHastElement, createTextNodeElement } from './hast_utils';

export function createTokenizerStyleElement(content: string): HASTElement {
  return createHastElement({
    tagName: 'style',
    children: [createTextNodeElement(wrapTokenizerCSS(content))],
    properties: {
      [TOKENIZER_CSS_ATTRIBUTE]: '',
    },
  });
}
