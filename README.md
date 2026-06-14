# SOLUS Dev Notes

面向游戏开发、图形渲染与工程实践的文件驱动技术档案站。文章使用 Markdown 写在 `content/posts`，构建后生成可部署的静态站点。

## 快速开始

```powershell
cd D:\MyBlog
npm run new:post -- "文章标题"
npm run check:all
npm run preview
```

新建文章时也可以直接带上常用元信息：

```powershell
npm run new:post -- "Unity 性能预算" --slug unity-performance-budget --date 2026-06-04 --category Unity --tags "Unity,性能,Profiler" --summary "建立 Unity 性能分析入口。"
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
- [阅读量和评论配置](docs/dynamic-features.md)
