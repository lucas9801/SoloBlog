# SOLUS Dev Notes

面向游戏开发、图形渲染与工程实践的文件驱动技术档案站。文章使用 Markdown 写在 `content/posts`，构建后生成可部署的静态站点。

## 快速开始

```powershell
cd D:\MyBlog
npm run new:post -- "文章标题" --slug article-slug
npm run check:all
npm run preview
```

标题包含中文时必须手动提供英文 `--slug`，这样发布后的 URL 会保持稳定、可读。

不带 `--category` 新建文章时，会使用 `content/site.json` 里的 `defaultPostCategory`。

新建文章时也可以直接带上常用元信息：

```powershell
npm run new:post -- "Unity 性能预算" --slug unity-performance-budget --date 2026-06-04 --category Unity --tags "Unity,性能,Profiler" --summary "建立 Unity 性能分析入口。"
```

如果已经把封面图片放到 `assets/posts/`，可以额外加 `--cover /assets/posts/your-cover.svg`。封面参数只接受本地 `/assets/...` 路径，文件必须已经存在；不设置时构建脚本会按文章自动生成封面。

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

GitHub Actions 会在 `main` 分支 push 和 Pull Request 上运行 `npm run check:all`，用于提前发现构建、输出、布局和动态接口回归。

## 文档

- [完整使用手册](docs/user-guide.md)
- [博客操作手册](docs/blog-operations.md)
- [Cloudflare Pages 部署说明](docs/cloudflare-pages.md)
- [阅读量和评论配置](docs/dynamic-features.md)
