# 部署到 Cloudflare Pages

当前项目已经按 Cloudflare Pages 部署方式整理好。

## 推荐：Git 集成

1. 创建 GitHub 仓库并推送当前项目。
2. 打开 Cloudflare Dashboard。
3. 进入 **Workers & Pages**。
4. 选择 **Create application**。
5. 选择 **Pages**。
6. 连接 GitHub 仓库。
7. 使用以下构建设置：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
Node version: 20
```

8. 部署。

Cloudflare 会在项目面板里生成一个默认预览地址。

当前正式域名是：

```text
https://blog.solus.games/
```

## 站点地址

构建脚本按以下优先级读取站点地址：

```text
SITE_URL
content/site.json baseUrl
```

`content/site.json` 已经设置为 `https://blog.solus.games/`，因此生产构建默认使用正式域名。

如果以后更换域名，更新 `content/site.json`，或者在 Cloudflare Pages 里添加这个环境变量：

```text
SITE_URL=https://your-domain.com/
```

然后重新部署。这样 canonical、RSS、sitemap 和 robots.txt 都会保持正确。

## 可选：使用 Wrangler 直接部署

如果不走 Git 集成，可以用 Wrangler 手动发布：

```bash
npm run build
npx wrangler pages deploy dist --project-name soloblog-4w3
```

也可以使用：

```bash
npm run deploy:cloudflare
```

Wrangler 提示登录时，需要在浏览器里完成 Cloudflare 登录。

## Cloudflare 相关文件

- `wrangler.toml`: Wrangler 使用的 Pages 项目名和输出目录。
- `.node-version`: 指定 Node 20，保证构建环境一致。
- `public/_headers`: 复制到 `dist` 的安全和缓存响应头。
- `public/_redirects`: 复制到 `dist` 的 RSS 别名重定向。
- `dist/robots.txt`: 由 `npm run build` 生成。
- `dist/rss.xml`: 由 `npm run build` 生成。
- `dist/sitemap.xml`: 由 `npm run build` 生成。

## 正常发布流程

1. 在 `content/posts` 里创建或编辑 Markdown 文件。
2. 设置 `status: published`。
3. 运行：

```bash
npm run check:all
```

4. 提交并 push。
5. Cloudflare Pages 会自动重新部署。
