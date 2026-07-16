import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    default_locale: 'zh_CN',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    permissions: ['storage'],
    icons: {
      16: 'icons/searchlens-16.png',
      32: 'icons/searchlens-32.png',
      48: 'icons/searchlens-48.png',
      128: 'icons/searchlens-128.png',
    },
  },
  outDir: '.output',
  zip: {
    name: 'searchlens-cn',
  },
});
