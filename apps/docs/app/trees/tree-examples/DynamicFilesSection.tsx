import { preloadFileTree } from '@pierre/trees/ssr';

import { baseTreeOptions } from './demo-data';
import { DynamicFilesSectionClient } from './DynamicFilesSectionClient';

const INITIAL_EXPANDED_ITEMS = ['src', 'src/components', 'src/utils'];

const prerenderedHTML = preloadFileTree(
  {
    ...baseTreeOptions,
    id: 'dynamic-files-demo',
  },
  {
    initialExpandedItems: INITIAL_EXPANDED_ITEMS,
  }
).shadowHtml;

export function DynamicFilesSection() {
  return (
    <DynamicFilesSectionClient
      initialExpandedItems={INITIAL_EXPANDED_ITEMS}
      prerenderedHTML={prerenderedHTML}
    />
  );
}
