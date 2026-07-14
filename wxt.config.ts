import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SearchLens CN',
    description: '在百度网页搜索结果页本地提供可信度参考、推荐排序与偏好控制。',
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
