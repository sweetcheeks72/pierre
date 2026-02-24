import type { PreloadFileOptions } from '@pierre/diffs/ssr';

import { CUSTOM_HUNK_SEPARATORS_EXAMPLE } from '../../diff-examples/CustomHunkSeparators/constants';
import { CustomScrollbarCSS } from '@/components/CustomScrollbarCSS';

export { CUSTOM_HUNK_SEPARATORS_EXAMPLE };

const fileOptions = {
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
  unsafeCSS: CustomScrollbarCSS,
} as const;

export const CUSTOM_HUNK_SEPARATORS_SWITCHER: PreloadFileOptions<undefined> = {
  file: {
    name: 'custom_hunk_separators.tsx',
    contents: `import type { HunkData } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import { useState } from 'react';

type SeparatorOption =
  | 'line-info'
  | 'line-info-basic'
  | 'metadata'
  | 'simple'
  | 'custom';

function renderCustomSeparator(
  hunkData: HunkData,
  instance: FileDiff<undefined>
) {
  const root = document.createElement('div');
  root.style.fontFamily =
    'var(--diffs-header-font-family, var(--diffs-header-font-fallback))';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.gridColumn = '2 / 3';
  root.style.position = 'sticky';
  root.style.left = 'var(--diffs-column-number-width, 0px)';
  root.style.width = 'var(--diffs-column-content-width, auto)';
  root.style.minWidth = '0';
  const controls = document.createElement('div');
  controls.style.display = 'inline-flex';
  controls.style.gap = '4px';

  if (hunkData.type === 'additions') {
    root.style.justifyContent = 'flex-end';
    const expandAll = document.createElement('button');
    expandAll.textContent = 'expand all';
    expandAll.style.color = 'var(--diffs-fg-number)';
    expandAll.onclick = () => instance.expandAllHunks();
    root.append(expandAll);
    return root;
  }

  if (hunkData.expandable?.up && hunkData.expandable?.down) {
    const both = document.createElement('button');
    const bothIcon = document.createElement('span');
    bothIcon.textContent = '↕';
    both.appendChild(bothIcon);
    both.style.fontFamily =
      'var(--diffs-font-family, var(--diffs-font-fallback))';
    both.style.fontSize = '1rem';
    const bothLabel = document.createElement('span');
    bothLabel.textContent = \`expand \${hunkData.lines} lines\`;
    bothLabel.style.color = 'var(--diffs-fg-number)';
    bothLabel.style.fontFamily =
      'var(--diffs-header-font-family, var(--diffs-header-font-fallback))';
    bothLabel.style.marginInlineStart = '4px';
    both.appendChild(bothLabel);
    both.onclick = () => instance.expandHunk(hunkData.hunkIndex, 'both');
    controls.appendChild(both);
  } else if (hunkData.expandable?.up) {
    const up = document.createElement('button');
    const upIcon = document.createElement('span');
    upIcon.textContent = '↑';
    up.appendChild(upIcon);
    up.style.fontFamily =
      'var(--diffs-font-family, var(--diffs-font-fallback))';
    up.style.fontSize = '1rem';
    const upLabel = document.createElement('span');
    upLabel.textContent = \`expand \${hunkData.lines} lines\`;
    upLabel.style.color = 'var(--diffs-fg-number)';
    upLabel.style.fontFamily =
      'var(--diffs-header-font-family, var(--diffs-header-font-fallback))';
    upLabel.style.marginInlineStart = '4px';
    up.appendChild(upLabel);
    up.onclick = () => instance.expandHunk(hunkData.hunkIndex, 'up');
    controls.appendChild(up);
  } else if (hunkData.expandable?.down) {
    const down = document.createElement('button');
    const downIcon = document.createElement('span');
    downIcon.textContent = '↓';
    down.appendChild(downIcon);
    down.style.fontFamily =
      'var(--diffs-font-family, var(--diffs-font-fallback))';
    down.style.fontSize = '1rem';
    const downLabel = document.createElement('span');
    downLabel.textContent = \`expand \${hunkData.lines} lines\`;
    downLabel.style.color = 'var(--diffs-fg-number)';
    downLabel.style.fontFamily =
      'var(--diffs-header-font-family, var(--diffs-header-font-fallback))';
    downLabel.style.marginInlineStart = '4px';
    down.appendChild(downLabel);
    down.onclick = () => instance.expandHunk(hunkData.hunkIndex, 'down');
    controls.appendChild(down);
  }
  root.append(controls);
  return root;
}

function HunkSeparatorDemo({ oldFile, newFile }) {
  const [separator, setSeparator] = useState<SeparatorOption>('line-info');

  if (separator === 'custom') {
    const instance = new FileDiff({
      hunkSeparators: (hunkData, fileDiffInstance) =>
        renderCustomSeparator(hunkData, fileDiffInstance),
    });
    instance.render({ oldFile, newFile, containerWrapper: document.body });
    return null;
  }

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{ hunkSeparators: separator }}
    />
  );
}`,
  },
  options: fileOptions,
};
