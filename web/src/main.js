import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const app = mount(App, { target: document.getElementById('app') });

// Android install needs a service worker on some Chrome versions. Browsers
// only allow one on HTTPS, so this is a no-op on the iPad (no SW support)
// and on plain http://.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export default app;
