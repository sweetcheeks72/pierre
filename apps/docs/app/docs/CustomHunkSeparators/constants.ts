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
    contents: `import type { ExpansionDirections, HunkData } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import { useState } from 'react';
import styles from './CustomHunkSeparators.module.css';

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
  const wrapper = document.createElement('div');
  wrapper.className = styles.customSeparatorWrapper;

  const root = document.createElement('div');
  root.className = styles.customSeparatorRoot;

  const controls = document.createElement('div');
  controls.className = styles.customSeparatorControls;

  if (hunkData.type === 'additions') {
    const spacer = document.createElement('span');
    spacer.textContent = ' ';
    wrapper.append(spacer, root);
    return wrapper;
  }

  const lineLabel = hunkData.lines === 1 ? 'line' : 'lines';
  const labelText = \`\${hunkData.lines} unmodified \${lineLabel}\`;

  function createControl(direction: ExpansionDirections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = styles.customSeparatorButton;
    const icon = document.createElement('span');
    icon.className = styles.customSeparatorIcon;
    icon.textContent =
      direction === 'up' ? '↓' : direction === 'down' ? '↑' : '↕';
    const label = document.createElement('span');
    label.className = styles.customSeparatorLabel;
    label.textContent = labelText;
    button.append(icon, label);
    button.onclick = () => instance.expandHunk(hunkData.hunkIndex, direction);
    return button;
  }

  if (hunkData.expandable?.up && hunkData.expandable?.down) {
    controls.append(createControl('both'));
  } else if (hunkData.expandable?.up) {
    controls.append(createControl('up'));
  } else if (hunkData.expandable?.down) {
    controls.append(createControl('down'));
  }

  const expandAll = document.createElement('button');
  expandAll.type = 'button';
  expandAll.className = styles.customExpandAllButton;
  expandAll.textContent = 'Expand all';
  expandAll.onclick = () => instance.expandAllHunks();

  const spacer = document.createElement('span');
  spacer.textContent = ' ';
  root.append(controls, expandAll);
  wrapper.append(spacer, root);
  return wrapper;
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
