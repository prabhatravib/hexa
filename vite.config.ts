import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
// When building on GitHub Actions, use the repository name as base for GitHub Pages project sites
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
// When building on Cloudflare Pages, always use root base
const isCloudflarePages = Boolean(process.env.CF_PAGES);

export default defineConfig({
  base: isCloudflarePages ? '/' : repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
