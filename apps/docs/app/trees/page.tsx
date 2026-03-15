import { permanentRedirect } from 'next/navigation';

export default function TreesHomeRedirect() {
  permanentRedirect('/preview/trees');
}
