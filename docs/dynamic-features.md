# 阅读量和评论配置

当前博客已经预留了两个动态功能：

- 阅读量：Cloudflare Pages Functions + D1，接口路径是 `/api/views`。
- 评论：Giscus，数据存放在 GitHub Discussions。

## 阅读量

代码已经包含：

- `functions/api/views.js`
- `src/views.js`
- `src/article.js`
- `migrations/0001_post_views.sql`
- `migrations/0002_post_view_events.sql`

Cloudflare Pages 会自动识别项目根目录下的 `functions/` 目录。阅读量接口使用的 D1 绑定名固定为：

```text
BLOG_DB
```

### Cloudflare 后台配置方式

1. 打开 Cloudflare Dashboard。
2. 进入 **Workers & Pages**。
3. 创建一个 D1 数据库，例如命名为：

```text
soloblog
```

4. 进入你的 Pages 项目。
5. 打开 **Settings > Bindings**。
6. 添加 **D1 database binding**。
7. Variable name 填：

```text
BLOG_DB
```

8. D1 database 选择刚创建的 `soloblog`。
9. 重新部署一次 Pages 项目。

表结构会由接口自动创建。也可以手动执行：

```bash
npx wrangler d1 execute soloblog --file=migrations/0001_post_views.sql --remote
npx wrangler d1 execute soloblog --file=migrations/0002_post_view_events.sql --remote
```

阅读量写入接口只接受同源 `application/json` POST，请求体格式是：

```json
{
  "slug": "render-optimization-checklist"
}
```

不再接受 URL 查询参数里的 `slug` 写入，避免外站用普通表单请求刷阅读数。

服务端会对同一篇文章、同一匿名访问者、同一天的重复写入做去重。D1 只保存匿名哈希，不保存原始 IP；用于去重的临时事件会自动清理，只保留最近 2 天左右的数据，阅读总数仍保存在 `post_views` 中。需要让哈希更稳定时，可以在 Cloudflare Pages 环境变量里增加：

```text
VIEW_SALT=一段只保存在 Cloudflare 后台的随机字符串
```

### 本地预览

`npm run preview` 只是静态预览，不会运行 Cloudflare Functions，所以本地看不到真实阅读量。

需要调试接口时可以使用 Wrangler：

```bash
npm run build
npx wrangler pages dev dist --d1 BLOG_DB=你的数据库ID
```

## 评论

评论使用 Giscus。它基于 GitHub Discussions，不需要你自己维护数据库。

### GitHub 配置

1. 打开仓库 `lucas9801/SoloBlog`。
2. 进入 **Settings > General**。
3. 勾选 **Discussions**。
4. 安装 Giscus App：

```text
https://github.com/apps/giscus
```

5. 打开 Giscus 配置页面：

```text
https://giscus.app/zh-CN
```

6. Repository 填：

```text
lucas9801/SoloBlog
```

7. Page ↔ Discussions Mapping 建议选择：

```text
pathname
```

8. Discussion Category 建议选择：

```text
Announcements
```

9. 页面会生成一段 `<script>`，从里面复制这些值：

```text
data-repo-id
data-category
data-category-id
```

### 打开评论

编辑 `content/site.json`：

```json
"comments": {
  "enabled": true,
  "provider": "giscus",
  "repo": "lucas9801/SoloBlog",
  "repoId": "填入 data-repo-id",
  "category": "Announcements",
  "categoryId": "填入 data-category-id",
  "mapping": "pathname",
  "strict": "0",
  "reactionsEnabled": "1",
  "emitMetadata": "0",
  "inputPosition": "bottom",
  "theme": "preferred_color_scheme",
  "language": "zh-CN"
}
```

然后运行：

```powershell
npm run lint
npm run build
git add .
git commit -m "Configure comments"
git push
```

## 换成自己的域名

后续换域名时，一般只需要做两件事：

1. 在 Cloudflare Pages 里绑定自定义域名。
2. 在 Pages 环境变量里设置：

```text
SITE_URL=https://你的域名.com
```

阅读量存的是文章 `slug`，评论默认按 `pathname` 匹配。只要文章路径例如 `/posts/start-here/` 不变，换域名不会影响已有阅读量和评论。
