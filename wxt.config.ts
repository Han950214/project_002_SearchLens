import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SearchLens CN',
    description: '在百度搜索页优先提示官网、官方下载和可信来源。',
    permissions: ['storage'],
    host_permissions: [
      'https://www.baidu.com/*',
      'https://baidu.com/*',
    ],
  },
  outDir: '.output',
  zip: {
    name: 'searchlens-cn',
  },
});
