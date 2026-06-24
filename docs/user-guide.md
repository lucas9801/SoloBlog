# SOLUS 博客完整使用手册

这份文档覆盖当前博客的日常使用、文章管理、分类标签、专题、评论、阅读量、部署和常见问题。项目是文件驱动的静态博客：文章写在 Markdown 文件里，运行构建命令后生成 `dist/`，再由 Cloudflare Pages 部署到线上。

## 1. 项目结构

```text
D:\MyBlog
├─ content/
│  ├─ posts/          # 文章 Markdown
│  ├─ about.md        # 关于页
│  └─ site.json       # 站点配置
├─ assets/            # 图片、封面、图标等静态资源
├─ src/               # 样式和前端脚本
├─ scripts/           # 构建、检查、预览、新建文章脚本
├─ functions/         # Cloudflare Pages Functions，例如阅读量接口
├─ migrations/        # D1 数据库表结构
├─ public/            # favicon、headers、redirects、manifest
├─ dist/              # 构建产物，自动生成，不手动编辑
└─ docs/              # 使用文档
```

日常最常改的是：

```text
content/posts/
content/about.md
content/site.json
assets/
```

不要手动编辑 `dist/`。每次 `npm run build` 都会重新生成它。

## 2. 常用命令

进入项目：

```powershell
cd D:\MyBlog
```

新建文章：

```powershell
npm run new:post -- "文章标题" --slug article-slug
```

本地构建：

```powershell
npm run build
```

本地预览：

```powershell
npm run preview
```

预览地址：

```text
http://localhost:4173
```

发布前完整检查：

```powershell
npm run check:all
```

提交并推送：

```powershell
git status
git add .
git commit -m "Update blog"
git push
```

## 3. 新增文章

推荐用脚本新建文章：

```powershell
npm run new:post -- "Unity 性能预算" --slug unity-performance-budget --category Unity --tags "Unity,性能,Profiler" --summary "建立 Unity 性能分析入口。"
```

标题包含中文时必须手动提供英文 `--slug`，例如：

```powershell
npm run new:post -- "渲染管线排查记录" --slug render-pipeline-debugging
```

如果标题是纯英文、数字和符号，可以不写 `--slug`，脚本会自动生成。

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--slug` | 文章 URL，例如 `/posts/unity-performance-budget/` |
| `--date` | 发布日期，格式 `YYYY-MM-DD` |
| `--updated` | 更新日期，不能早于 `date` |
| `--category` | 分类 |
| `--tags` | 标签，逗号分隔 |
| `--summary` | 摘要 |
| `--cover` | 自定义封面路径，必须是已存在的 `/assets/...` 文件 |
| `--series` | 专题名称 |
| `--series-order` | 专题内排序 |
| `--featured` | 标记为首页推荐阅读 |

示例：

```powershell
npm run new:post -- "RenderDoc 单帧分析" --slug renderdoc-frame-capture --date 2026-06-21 --category 图形渲染 --tags "RenderDoc,渲染,GPU" --series "性能与渲染排查" --series-order 2 --featured
```

## 4. 文章发布状态

新建文章默认是草稿：

```yaml
status: draft
```

草稿不会显示在首页、文章页、分类页、标签页、专题页、RSS 或搜索结果中。

发布时改为：

```yaml
status: published
```

发布前至少确认：

- `status: published`
- `category` 已设置
- `tags` 至少有一个
- `summary` 不是占位文本
- `slug` 没有重复
- 本地图片路径存在

然后运行：

```powershell
npm run check:all
```

## 5. Front Matter 字段

每篇文章顶部的 `---` 区域是 front matter。

完整示例：

```yaml
---
title: 渲染优化排查清单
slug: render-optimization-checklist
date: 2026-06-04
updated: 2026-06-05
category: 图形渲染
tags: [渲染, Shader, 性能]
series: 性能与渲染排查
seriesOrder: 1
summary: 一份用于定位渲染性能问题的实践清单。
cover: /assets/posts/render-optimization-checklist.svg
reviewAfterDays: 365
featured: true
status: published
---
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `title` | 文章标题 |
| `slug` | 文章 URL 的一部分，推荐英文小写短横线 |
| `date` | 发布日期 |
| `updated` | 更新日期 |
| `category` | 分类，一个文章只能有一个分类 |
| `tags` | 标签，一个文章可以多个 |
| `series` | 专题名称 |
| `seriesOrder` | 专题内排序，正整数 |
| `summary` | 摘要，显示在列表、搜索、订阅源 |
| `cover` | 自定义封面路径；不写会自动生成封面 |
| `reviewAfterDays` | 多少天后提示复查；设为 `false` 可关闭 |
| `featured` | 是否进入首页推荐阅读 |
| `status` | `draft` 或 `published` |

## 6. 分类

分类写在文章里：

```yaml
category: Unity
```

构建时会自动生成分类页，不需要手动建页面。

当前建议分类：

```text
Unity
Unreal
Cocos
图形渲染
性能优化
工具链
架构设计
游戏开发
随笔
```

如果新增分类，需要在 `content/site.json` 的 `categoryCovers` 中登记，否则检查会失败。

## 7. 标签

标签写法：

```yaml
tags: [Shader, 渲染, 移动端]
```

注意：

- 不要写 `#Shader`
- 不要在同一篇文章里重复标签
- 标签适合描述具体技术点、工具、平台、问题类型

构建时会自动生成标签页：

```text
/tags/shader/
/tags/渲染/
```

## 8. 专题

专题用于组织连续文章：

```yaml
series: 性能与渲染排查
seriesOrder: 1
```

同一 `series` 会自动生成专题页：

```text
/series/性能与渲染排查/
```

建议：

- `seriesOrder` 从 1 开始
- 同一专题内不要重复排序号
- 专题适合课程、排查链路、系统性笔记

## 9. 首页推荐阅读

文章加上：

```yaml
featured: true
```

首页“推荐阅读”会展示最多 3 篇精选文章，按发布时间倒序排列。

取消推荐：

```yaml
featured: false
```

或删除 `featured` 字段。

## 10. 封面图片

文章封面有两种来源：

- 推荐：用生图工具生成真实图片封面，输出 `/assets/posts/<slug>.webp`。
- 兜底：如果文章没有写 `cover`，构建脚本会自动生成 `/assets/posts/<slug>.svg` 封面。

### 10.1 生图封面配置

生图接口 key 只需要配置一次。新建项目根目录文件：

```text
D:\MyBlog\.env
```

写入：

```env
LUMIO_API_KEY=你的 API key
```

默认接口是：

```text
https://api.lumio.games
```

通常不需要写 URL。如果以后要覆盖接口地址，可以在 `.env` 里加：

```env
LUMIO_API_BASE_URL=https://api.lumio.games
```

`.env` 已加入 `.gitignore`，不要把 API key 提交到仓库。

### 10.2 为文章生成封面

先确认文章 front matter 至少有：

```yaml
title: 文章标题
slug: article-slug
date: 2026-06-24
category: 图形渲染
tags: [渲染, Shader, 性能]
summary: 一句话摘要
```

按 slug 生成单篇封面：

```powershell
npm run cover -- --slug article-slug
```

按文件生成：

```powershell
npm run cover -- --file content/posts/2026-06-24-article-slug.md
```

工具会自动完成：

- 根据文章标题、分类、标签和摘要生成 prompt
- 调用 Lumio 生图接口
- 用 `sharp` 叠加 SOLUS 风格标题暗条
- 输出 `assets/posts/<slug>.webp`
- 写回 front matter：

```yaml
cover: /assets/posts/article-slug.webp
```

### 10.3 常用封面命令

只看 prompt，不调用接口、不花钱：

```powershell
npm run cover -- --slug article-slug --dry-run
```

给所有还没有 `cover` 的文章生成封面：

```powershell
npm run cover -- --all
```

强制重新生图：

```powershell
npm run cover -- --slug article-slug --force
```

只重新叠加标题层，不重新调用生图接口：

```powershell
npm run cover -- --slug article-slug --recomposite
```

生成后运行：

```powershell
npm run check:all
```

如果检查通过，`.webp` 封面文件和文章 front matter 一起提交。

### 10.4 手动封面

自定义封面写法：

```yaml
cover: /assets/posts/my-cover.png
```

要求：

- 路径必须以 `/assets/` 开头
- 文件必须已经存在
- 不要使用外链

当前自动封面是海报式 SVG，会根据文章标题、分类、日期生成。自定义封面适合你后续使用真实截图、游戏画面、工具界面或手工设计图。
生图工具生成的 `.webp` 会优先作为文章封面和社交分享图；不需要修改 `build.js`。

推荐封面比例：

```text
16:9
1200 x 675
```

## 11. 正文 Markdown 写法

标题：

```markdown
## 二级标题
### 三级标题
```

列表：

```markdown
- 第一项
- 第二项
```

表格：

```markdown
| 工具 | 用途 |
| --- | --- |
| RenderDoc | 单帧 GPU 分析 |
| Profiler | 性能时间线 |
```

代码块：

````markdown
```csharp
Debug.Log("Hello");
```
````

命令行建议写语言：

````markdown
```powershell
npm run check:all
git push
```
````

提示块：

```markdown
> [!NOTE] 假设
> 这个结论基于 Unity 2022 LTS。

> [!WARNING]
> 不要只依赖编辑器 Profiler，最终数据要以真机为准。
```

支持：

```text
NOTE
TIP
IMPORTANT
WARNING
CAUTION
```

## 12. 正文图片

把图片放到 `assets/`，例如：

```text
assets/posts/profiler-capture.png
```

正文引用：

```markdown
![Unity Profiler 截图](/assets/posts/profiler-capture.png)
```

注意：

- 图片路径用 `/assets/...`
- alt 文本要描述图片内容
- 不要写空 alt：`![](...)`

## 13. 修改关于页

编辑：

```text
content/about.md
```

使用普通 Markdown 写法即可。

## 14. 修改站点配置

编辑：

```text
content/site.json
```

常用字段：

| 字段 | 说明 |
| --- | --- |
| `title` | 网站标题 |
| `brand` | 左上角品牌名 |
| `tagline` | 品牌副标题 |
| `description` | 网站描述 |
| `baseUrl` | 正式域名，用于 canonical、RSS、sitemap |
| `homePostsPerPage` | 首页最新文章数量 |
| `archivePostsPerPage` | 文章列表、分类、标签、专题分页数量 |
| `defaultPostCategory` | 新建文章默认分类 |
| `navigation` | 顶部导航 |
| `hero` | 首页首屏文案 |
| `comments` | Giscus 评论配置 |
| `views` | 阅读量配置 |

正式域名当前是：

```text
https://blog.solus.games/
```

如果以后换域名，改 `baseUrl`，或者在 Cloudflare Pages 里设置环境变量：

```text
SITE_URL=https://your-domain.com/
```

## 15. 搜索、归档和订阅

构建会自动生成：

```text
/archive/          全部文章
/categories/.../   分类页
/tags/.../         标签页
/years/.../        年份归档
/series/.../       专题页
/search/           搜索页
/rss.xml           RSS
/feed.json         JSON Feed
/sitemap.xml       Sitemap
/opensearch.xml    浏览器搜索描述
```

不需要手动维护这些页面。

## 16. 阅读量

阅读量功能使用：

```text
Cloudflare Pages Functions + D1
```

相关文件：

```text
functions/api/views.js
src/views.js
src/article.js
migrations/0001_post_views.sql
migrations/0002_post_view_events.sql
```

Cloudflare Pages 中 D1 绑定名必须是：

```text
BLOG_DB
```

如果需要更稳定的匿名去重哈希，可以在 Cloudflare Pages 环境变量中设置：

```text
VIEW_SALT=一段随机字符串
```

阅读量按文章 `slug` 保存。只要文章 `slug` 不变，换域名不会丢阅读量。

本地 `npm run preview` 是静态预览，不会运行 Cloudflare Functions，所以本地可能看不到真实阅读量。

## 17. 评论

评论使用 Giscus，数据在 GitHub Discussions。

配置位置：

```text
content/site.json
```

当前配置结构：

```json
"comments": {
  "enabled": true,
  "provider": "giscus",
  "repo": "lucas9801/SoloBlog",
  "repoId": "R_kgDOPJtNMQ",
  "category": "Announcements",
  "categoryId": "DIC_kwDOPJtNMc4C-wYk",
  "mapping": "pathname",
  "strict": "0",
  "reactionsEnabled": "1",
  "emitMetadata": "0",
  "inputPosition": "bottom",
  "theme": "preferred_color_scheme",
  "language": "zh-CN"
}
```

如果要重新配置 Giscus：

1. 确认 GitHub 仓库开启 Discussions。
2. 安装 Giscus App。
3. 打开 `https://giscus.app/zh-CN`。
4. Repository 填 `lucas9801/SoloBlog`。
5. Mapping 建议选 `pathname`。
6. Category 建议选 `Announcements`。
7. 把页面生成的 `repoId` 和 `categoryId` 填回 `content/site.json`。

评论按路径匹配。只要文章路径 `/posts/<slug>/` 不变，换域名不会影响已有评论。

## 18. Cloudflare Pages 部署

Cloudflare Pages 推荐使用 Git 集成。构建设置：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
Node version: 20
```

环境变量建议：

```text
NODE_VERSION=20
```

如果要覆盖站点域名：

```text
SITE_URL=https://blog.solus.games/
```

推送到 GitHub 后，Cloudflare Pages 会自动部署。

## 19. 手动部署

如果不用 Git 自动部署，可以使用 Wrangler：

```powershell
npm run build
npx wrangler pages deploy dist --project-name soloblog-4w3
```

或：

```powershell
npm run deploy:cloudflare
```

## 20. 发布流程

推荐流程：

```powershell
cd D:\MyBlog
npm run new:post -- "文章标题" --slug article-slug
```

编辑文章：

```yaml
category: Unity
tags: [Unity, 性能]
summary: 这里写摘要。
status: published
```

生成封面：

```powershell
npm run cover -- --slug article-slug
```

检查：

```powershell
npm run check:all
```

提交：

```powershell
git add .
git commit -m "Add article"
git push
```

线上检查：

```text
https://blog.solus.games/
```

## 21. 常见问题

### 新文章为什么没显示？

检查文章是否是：

```yaml
status: published
```

然后重新：

```powershell
npm run build
git add .
git commit -m "Publish post"
git push
```

### 分类或标签为什么没出现？

分类和标签只根据已发布文章生成。草稿不会参与生成。

### 新增分类为什么检查失败？

需要在 `content/site.json` 的 `categoryCovers` 中登记分类。

### 可以删除示例文章吗？

可以，删除 `content/posts/` 里的示例 Markdown。注意当前检查要求至少有一篇文章。

### 为什么本地没有真实阅读量？

`npm run preview` 是静态预览，不运行 Cloudflare Functions。真实阅读量需要部署到 Cloudflare Pages 并绑定 D1。

### 为什么评论不显示？

检查：

- `content/site.json` 中 `comments.enabled` 是否为 `true`
- GitHub Discussions 是否开启
- Giscus App 是否安装到仓库
- `repoId` 和 `categoryId` 是否正确

### 换域名会影响阅读量和评论吗？

一般不会。阅读量按 `slug` 保存，评论按 `pathname` 匹配。只要文章路径不变，换域名不影响已有数据。

### 能不能用网页后台写文章？

当前是 Markdown 文件驱动。后续可以接入 Decap CMS 或其他 CMS，但当前版本需要编辑文件并通过 Git 发布。

## 22. 不要做的事

- 不要手动编辑 `dist/`
- 不要把文章图片放在外链
- 不要随意修改已发布文章的 `slug`
- 不要把草稿设为 `published` 后不跑检查
- 不要在标签名前写 `#`
- 不要把 `content/site.json` 的 `baseUrl` 留成 Pages 默认域名
