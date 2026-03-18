/** @jsxImportSource preact */
import { hydrate, render } from 'preact';

import type { FileTreeRootProps } from '../components/Root';
import { Root } from '../components/Root';
import type { FileTreeFiles } from '../types';

/**
 * Mutable renderer implementation so tests can stub Preact rendering/hydration
 * in jsdom (Preact 11 beta can crash there).
 */
export const preactRenderer: {
  renderRoot: <TFiles extends FileTreeFiles>(
    element: HTMLElement,
    props: FileTreeRootProps<TFiles>
  ) => void;
  hydrateRoot: <TFiles extends FileTreeFiles>(
    element: HTMLElement,
    props: FileTreeRootProps<TFiles>
  ) => void;
  unmountRoot: (element: HTMLElement) => void;
} = {
  renderRoot: <TFiles extends FileTreeFiles>(
    element: HTMLElement,
    props: FileTreeRootProps<TFiles>
  ) => {
    render(<Root {...props} />, element);
  },
  hydrateRoot: <TFiles extends FileTreeFiles>(
    element: HTMLElement,
    props: FileTreeRootProps<TFiles>
  ) => {
    hydrate(<Root {...props} />, element);
  },
  unmountRoot: (element) => {
    render(null, element);
  },
};

export function preactRenderRoot<TFiles extends FileTreeFiles>(
  element: HTMLElement,
  props: FileTreeRootProps<TFiles>
): void {
  preactRenderer.renderRoot(element, props);
}

export function preactHydrateRoot<TFiles extends FileTreeFiles>(
  element: HTMLElement,
  props: FileTreeRootProps<TFiles>
): void {
  preactRenderer.hydrateRoot(element, props);
}

export function preactUnmountRoot(element: HTMLElement): void {
  preactRenderer.unmountRoot(element);
}
