import { mount } from 'svelte';
import App from './App.svelte';
import PhotosPage from './lib/PhotosPage.svelte';
import './app.css';

// /photos is the phone-facing background uploader; everything else is the
// dashboard. (Caddy serves index.html for every path.)
const Page = /^\/photos\/?$/.test(location.pathname) ? PhotosPage : App;
const app = mount(Page, { target: document.getElementById('app') });

// Android install needs a service worker on some Chrome versions. Browsers
// only allow one on HTTPS, so this is a no-op on the iPad (no SW support)
// and on plain http://.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export default app;
