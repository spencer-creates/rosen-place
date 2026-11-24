import { defineConfig } from 'vite'

// The sign-in page is built on its own, into dist/_login, so it shares no files with the app.
// The server serves only /_login/* to people who are not signed in.
export default defineConfig({
  root: 'login',
  base: '/_login/',
  build: { outDir: '../dist/_login', emptyOutDir: true },
})
