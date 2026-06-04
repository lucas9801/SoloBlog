# My Game Dev Blog

一个文件驱动的静态博客。文章使用 Markdown 写在 `content/posts`，构建后生成可部署的静态站点。

## 常用命令

```bash
npm run new:post -- "文章标题"
npm run lint
npm run build
npm run preview
npm run deploy:cloudflare
```

本地预览地址：

```text
http://localhost:4173
```

## 写文章

运行：

```bash
npm run new:post -- "Unity 性能优化记录"
```

脚本会在 `content/posts` 创建一个 Markdown 草稿。编辑完成后，把 front matter 里的：

```yaml
status: draft
```

改成：

```yaml
status: published
```

然后运行：

```bash
npm run build
```

## 文章字段

```yaml
---
title: 文章标题
slug: article-slug
date: 2026-06-04
category: Unity
tags: [Unity, 性能, Profiler]
summary: 一句话摘要，会显示在首页、列表页和 RSS 中。
featured: true
status: published
---
```

## 已支持功能

- 首页、文章详情页
- Markdown 文章生成
- 草稿和发布状态
- 分类页、标签页、归档页
- 全站搜索索引
- RSS：`/rss.xml`
- Sitemap：`/sitemap.xml`
- 响应式桌面和移动端布局
- `content/site.json` 站点配置

## 部署到 Cloudflare Pages

推荐使用 GitHub 仓库连接 Cloudflare Pages。

Cloudflare Pages 构建设置：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Node version: 20
```

详细步骤见 [docs/cloudflare-pages.md](docs/cloudflare-pages.md)。
