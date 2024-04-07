import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "My Blog",
  description: "我的博客自留地",
  lang: 'zh-Hans',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: '关于', link: '/posts/about' }
    ],

    sidebar: [
      {
        text: '2024',
        items: [
          { text: '部署与使用 Squid 正向代理', link: '/posts/2024/部署与使用 Squid 正向代理' },
          { text: '消息摘要、加解密、签名、证书', link: '/posts/2024/消息摘要、加解密、签名、证书' }
        ]
      }
    ],

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ],

    footer: {
      copyright: `版权所有 © 2024-${new Date().getFullYear()} 五竹 &nbsp; &nbsp; Powered by VitePress`,
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    outline: {
      label: '页面导航',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
  }
})
