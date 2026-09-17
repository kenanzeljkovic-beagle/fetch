import { defineConfig } from 'vite';

// Bundles the extension's offscreen dialer (web/src/offscreen/offscreen.ts) into one file inside
// phase2/extension/. MV3 forbids loading remote code, so @telnyx/webrtc has to be inlined here.
export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '../phase2/extension',
    emptyOutDir: false, // the rest of the extension lives in that folder
    target: 'chrome116',
    minify: true,
    lib: {
      entry: 'src/offscreen/offscreen.ts',
      formats: ['es'],
      fileName: () => 'offscreen.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
