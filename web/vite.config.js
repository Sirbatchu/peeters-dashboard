import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';

// The whole point of this config: the display device is an iPad 4 stuck on
// iOS 10.3 / Safari 10. plugin-legacy transpiles syntax (?., ??, async) and
// injects core-js polyfills (fetch is native in 10.3, but Promise.finally,
// Object.entries etc. are not). renderModernChunks:false because the ONLY
// consumer is that iPad — shipping a modern bundle nobody loads is waste.
export default defineConfig({
  plugins: [
    svelte(),
    legacy({
      targets: ['ios_saf >= 10'],
      renderModernChunks: false
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    minify: 'terser',
    target: 'es2015'
  }
});
