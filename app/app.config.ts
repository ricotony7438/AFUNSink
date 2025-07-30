export default defineAppConfig({
  title: '潮廷短链中心',
  email: 'ctowen@duck.com',
  github: 'https://afun.center/',
  twitter: 'https://afun.center/',
  telegram: 'https://afun.center/',
  mastodon: 'https://afun.center/',
  blog: 'https://afun.center/',
  description: '简单/快速/安全的链接缩短器，带全球分析功能。',
  image: 'https://sink.cool/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  reserveSlug: [
    'dashboard',
  ],
})
