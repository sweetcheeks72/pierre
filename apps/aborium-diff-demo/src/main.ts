import { mountMainDemo } from './main-demo';
import { mountSsrDemo } from './ssr-demo';
import { isSsrRoute } from './ssr-markup';
import './style.css';

const app = globalThis.document.getElementById('app');
if (!(app instanceof HTMLDivElement)) {
  throw new Error('Expected #app container to exist');
}

const cleanup = isSsrRoute(globalThis.location.pathname)
  ? mountSsrDemo(app)
  : mountMainDemo(app);

if (import.meta.hot != null) {
  import.meta.hot.dispose(() => {
    cleanup();
  });
}
