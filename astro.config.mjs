import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://dxun-dev.github.io',
  base: '/omarchy-elgato',
  trailingSlash: 'always',
  output: 'static',
  markdown: { syntaxHighlight: false },
  vite: { plugins: [tailwindcss()] },
});
