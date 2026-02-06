import {
  getTokenStyleObject,
  stringifyTokenStyle,
  type ThemedToken,
} from 'shiki';

import type { ArboriumStreamToken } from '../arborium-stream';

type StreamToken = ThemedToken | ArboriumStreamToken;

function isThemedToken(token: StreamToken): token is ThemedToken {
  return (
    'offset' in token ||
    'fontStyle' in token ||
    'color' in token ||
    'explanation' in token ||
    'htmlStyle' in token
  );
}

export function createSpanFromToken(token: StreamToken): HTMLSpanElement {
  const element = document.createElement('span');
  if (isThemedToken(token)) {
    const style = token.htmlStyle ?? getTokenStyleObject(token);
    element.style = stringifyTokenStyle(style);
  } else {
    if (token.className != null && token.className.length > 0) {
      element.className = token.className.join(' ');
    }
    if (token.style != null) {
      element.setAttribute('style', token.style);
    }
  }
  element.textContent = token.content;
  return element;
}
