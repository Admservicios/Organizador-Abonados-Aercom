import { defineConfig } from 'vite';
export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'main.mjs' } },
  },
});
