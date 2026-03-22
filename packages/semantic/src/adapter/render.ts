import type { DiffLineAnnotation, SemanticAnnotation } from './pierre-adapter';

interface ChangeStyle {
  icon: string;
  bg: string;
  fg: string;
  border: string;
}

const CHANGE_STYLES: Record<SemanticAnnotation['changeType'], ChangeStyle> = {
  added: {
    icon: '+',
    bg: 'rgba(34,197,94,0.12)',
    fg: '#22c55e',
    border: 'rgba(34,197,94,0.3)',
  },
  modified: {
    icon: '~',
    bg: 'rgba(234,179,8,0.12)',
    fg: '#eab308',
    border: 'rgba(234,179,8,0.3)',
  },
  deleted: {
    icon: '−',
    bg: 'rgba(239,68,68,0.12)',
    fg: '#ef4444',
    border: 'rgba(239,68,68,0.3)',
  },
  renamed: {
    icon: '→',
    bg: 'rgba(59,130,246,0.12)',
    fg: '#3b82f6',
    border: 'rgba(59,130,246,0.3)',
  },
  moved: {
    icon: '↗',
    bg: 'rgba(168,85,247,0.12)',
    fg: '#a855f7',
    border: 'rgba(168,85,247,0.3)',
  },
};

/**
 * Creates a DOM element for rendering a semantic annotation badge in Pierre's diff viewer.
 *
 * Usage with Pierre's FileDiff:
 * ```ts
 * import { semanticDiffToAnnotations, renderSemanticAnnotation } from '@pierre/semantic';
 *
 * const annotations = semanticDiffToAnnotations(before, after, 'file.ts');
 * instance.render({
 *   lineAnnotations: annotations,
 *   renderAnnotation: renderSemanticAnnotation,
 * });
 * ```
 */
export function renderSemanticAnnotation(
  annotation: DiffLineAnnotation<SemanticAnnotation>
): HTMLElement {
  const meta = (annotation as { metadata: SemanticAnnotation }).metadata;
  const style = CHANGE_STYLES[meta.changeType];

  const badge = document.createElement('div');
  badge.className = 'pierre-semantic-annotation';
  badge.setAttribute('data-change-type', meta.changeType);
  badge.setAttribute('data-entity-type', meta.entityType);
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'padding:2px 8px',
    'margin:2px 0',
    'font-size:12px',
    'line-height:18px',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
    `background:${style.bg}`,
    `border:1px solid ${style.border}`,
    'border-radius:4px',
  ].join(';');

  // Change type icon
  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = `color:${style.fg};font-weight:700;min-width:12px;text-align:center`;
  iconSpan.textContent = style.icon;
  badge.appendChild(iconSpan);

  // Entity type label
  const typeSpan = document.createElement('span');
  typeSpan.style.cssText = `color:${style.fg};font-weight:500;opacity:0.8;font-size:11px`;
  typeSpan.textContent = meta.entityType;
  badge.appendChild(typeSpan);

  // Entity name
  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'color:inherit;font-weight:600';
  nameSpan.textContent = meta.entityName;
  badge.appendChild(nameSpan);

  // Old name for renames
  if (meta.oldName != null && meta.oldName !== meta.entityName) {
    const oldSpan = document.createElement('span');
    oldSpan.style.cssText = 'color:inherit;opacity:0.5;font-size:11px';
    oldSpan.textContent = `(was ${meta.oldName})`;
    badge.appendChild(oldSpan);
  }

  return badge;
}
