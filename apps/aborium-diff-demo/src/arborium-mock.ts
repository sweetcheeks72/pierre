import type { ArboriumTokenizerOptions } from '@pierre/diffs';

export const tokenizerStyles = `
  pre[data-theme-type='dark'] a-k {
    color: #ff678d;
  }
    
  pre[data-theme-type='light'] a-k {
    color: #fc2b73;
  }

  pre[data-theme-type='dark'] a-n {
    color: #68cdf2;
  }

  pre[data-theme-type='light'] a-n {
    color: #1ca1c7;
  }

  pre[data-theme-type='dark'] a-s {
    color: #5ecc71;
  }

  pre[data-theme-type='light'] a-s {
    color: #199f43;
  }

  pre[data-theme-type='dark'] a-v,
  pre[data-theme-type='dark'] a-pr {
    color: #ffa359;
  }
  pre[data-theme-type='light'] a-v,
  pre[data-theme-type='light'] a-pr {
    color: #d47628;
  }

  pre[data-theme-type='dark'] a-c,
  pre[data-theme-type='light'] a-c {
    color: #84848a;
    font-style: italic;
  }

  pre[data-theme-type='dark'] a-p,
  pre[data-theme-type='light'] a-p {
    color: inherit;
  }
`;

export const themeStyles = [
  '--diffs-dark:#fbfbfb;',
  '--diffs-dark-bg:#070707;',
  '--diffs-dark-addition-color:#00cab1;',
  '--diffs-dark-deletion-color:#ff2e3f;',
  '--diffs-dark-modified-color:#009fff;',
  '--diffs-light:#070707;',
  '--diffs-light-bg:#ffffff;',
  '--diffs-light-addition-color:#00cab1;',
  '--diffs-light-deletion-color:#ff2e3f;',
  '--diffs-light-modified-color:#009fff;',
].join('');

export function createMockArboriumTokenizerOptions(): ArboriumTokenizerOptions {
  return {
    tokenizerStyles,
    themeStyles,
  };
}
