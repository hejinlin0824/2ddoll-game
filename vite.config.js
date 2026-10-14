import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5199,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        game: 'game.html',
        editor: 'weapon-editor.html',
        studio: 'asset-studio.html',
      },
    },
  },
});
