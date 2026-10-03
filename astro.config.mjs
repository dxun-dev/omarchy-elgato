import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://omarchy-elgato.dxun.dev',
  trailingSlash: 'always',
  output: 'static',
  markdown: { syntaxHighlight: false },
  vite: { plugins: [tailwindcss()] },
});
