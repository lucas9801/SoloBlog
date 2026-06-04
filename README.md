# My Game Dev Blog

一个文件驱动的静态博客。文章使用 Markdown 写在 `content/posts`，构建后生成可部署的静态站点。

## 快速开始

```powershell
cd D:\MyBlog
npm run new:post -- "文章标题"
npm run lint
npm run build
npm run preview
```

本地预览地址：

```text
http://localhost:4173
```

## 常用目录

```text
content/posts/     博客文章
content/site.json  站点配置
content/about.md   关于页
assets/            图片资源
dist/              构建产物，不手动编辑
docs/              操作文档
```

## 部署

Cloudflare Pages 构建设置：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Node version: 20
```

## 文档

- [博客操作手册](docs/blog-operations.md)
- [Cloudflare Pages 部署说明](docs/cloudflare-pages.md)
