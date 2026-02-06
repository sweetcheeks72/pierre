import { isLargeDiffRoute, mountLargeDiffDemo } from './large-diff-demo';
import { mountMainDemo } from './main-demo';
import { mountSsrDemo } from './ssr-demo';
import { isSsrRoute } from './ssr-markup';
import { isStreamingRoute, mountStreamingDemo } from './streaming-demo';
import './style.css';

const app = globalThis.document.getElementById('app');
if (!(app instanceof HTMLDivElement)) {
  throw new Error('Expected #app container to exist');
}

const pathname = globalThis.location.pathname;
let cleanup: () => void;
if (isSsrRoute(pathname)) {
  cleanup = mountSsrDemo(app);
} else if (isLargeDiffRoute(pathname)) {
  cleanup = mountLargeDiffDemo(app);
} else if (isStreamingRoute(pathname)) {
  cleanup = mountStreamingDemo(app);
} else {
  cleanup = mountMainDemo(app);
}

if (import.meta.hot != null) {
  import.meta.hot.dispose(() => {
    cleanup();
  });
}
