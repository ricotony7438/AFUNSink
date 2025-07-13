export default defineAppConfig({
  title: '潮廷短链生成器',
  email: 'ctowen@duck.com',
  github: 'https://t.me/owenwork',
  twitter: 'https://t.me/owenwork',
  telegram: 'https://t.me/owenwork',
  mastodon: 'https://t.me/owenwork',
  blog: 'https://t.me/owenwork',
  description: '简单/快速/安全的链接缩短器，带分析功能。',
  image: 'https://sink.cool/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  reserveSlug: [
    'dashboard',
  ],
})
