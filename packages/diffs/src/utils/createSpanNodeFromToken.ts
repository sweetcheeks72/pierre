import {
  getTokenStyleObject,
  stringifyTokenStyle,
  type ThemedToken,
} from 'shiki';

import type {
  ArboriumStreamToken,
  ArboriumStreamTokenWrapper,
} from '../arborium-stream';

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

export function createSpanFromToken(token: StreamToken): HTMLElement {
  const element = document.createElement('span');
  if (isThemedToken(token)) {
    const style = token.htmlStyle ?? getTokenStyleObject(token);
    element.style = stringifyTokenStyle(style);
  } else {
    const wrappers = token.wrappers ?? [];
    if (wrappers.length > 0) {
      const root = document.createElement(wrappers[0].tagName);
      let current: HTMLElement = root;
      applyWrapperProperties(current, wrappers[0]);
      for (let index = 1; index < wrappers.length; index++) {
        const wrapper = wrappers[index];
        const child = document.createElement(wrapper.tagName);
        applyWrapperProperties(child, wrapper);
        current.appendChild(child);
        current = child;
      }
      current.textContent = token.content;
      return root;
    }
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

function applyWrapperProperties(
  element: HTMLElement,
  wrapper: ArboriumStreamTokenWrapper
): void {
  if (wrapper.className != null && wrapper.className.length > 0) {
    element.className = wrapper.className.join(' ');
  }
  if (wrapper.style != null) {
    element.setAttribute('style', wrapper.style);
  }
  if (wrapper.attributes != null) {
    for (const [key, value] of Object.entries(wrapper.attributes)) {
      if (value === true) {
        element.setAttribute(key, '');
      } else if (value === false) {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, value);
      }
    }
  }
}
