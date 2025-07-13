export default defineAppConfig({
  title: '潮廷短链生成器',
  email: 'ctowen@duck.com',
  github: 'https://cturl.dpdns.org/',
  twitter: 'https://cturl.dpdns.org/',
  telegram: 'https://cturl.dpdns.org/',
  mastodon: 'https://cturl.dpdns.org/',
  blog: 'https://cturl.dpdns.org/',
  description: '简单/快速/安全的链接缩短器，带分析功能。',
  image: 'https://sink.cool/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  reserveSlug: [
    'dashboard',
  ],
})
