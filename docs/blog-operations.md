# 博客操作手册

这份文档说明如何日常维护当前博客：新增文章、设置分类和标签、设置精选文章、本地预览、发布到 Cloudflare Pages。

## 项目目录

```text
D:\MyBlog
├─ content/
│  ├─ posts/          # 所有博客文章，Markdown 格式
│  ├─ about.md        # 关于页
│  └─ site.json       # 站点标题、描述、导航、作者、域名
├─ assets/            # 图片等静态资源
├─ src/               # 主题样式和前端搜索脚本
├─ scripts/           # 构建、预览、新建文章脚本
├─ public/            # Cloudflare Pages headers / redirects
├─ dist/              # 构建产物，自动生成，不手动编辑
└─ docs/              # 项目说明文档
```

日常最常改的是：

```text
content/posts/
content/site.json
content/about.md
assets/
```

不要手动编辑 `dist/`。它是 `npm run build` 自动生成的发布目录。

## 常用命令

在 PowerShell 里进入项目：

```powershell
cd D:\MyBlog
```

新增文章：

```powershell
npm run new:post -- "文章标题"
```

也可以在新建时直接写入分类、标签、摘要、专题和精选状态：

```powershell
npm run new:post -- "Unity 性能预算" --slug unity-performance-budget --date 2026-06-04 --category Unity --tags "Unity,性能,Profiler" --summary "建立 Unity 性能分析入口。" --series "性能与渲染排查" --series-order 3 --featured
```

如果封面已经准备好，先把图片放到 `assets/posts/`，再加 `--cover`：

```powershell
npm run new:post -- "Unity 性能预算" --slug unity-performance-budget --date 2026-06-04 --category Unity --cover /assets/posts/unity-performance-budget.svg
```

`--cover` 只接受本地 `/assets/...` 路径，并且文件必须已经存在。不设置时构建脚本会按文章内容自动生成封面。

发布前完整检查：

```powershell
npm run check:all
```

这一步会顺序执行内容配置检查、阅读量接口测试、静态构建、本地预览服务测试、构建产物检查，并启动本地预览做多页面桌面/移动布局回归检查。发布前优先跑这个命令。

检查内容和配置：

```powershell
npm run lint
```

这一步会检查站点配置、生产域名、评论/阅读量配置、文章 front matter、重复 slug、发布文章的分类/标签/摘要、封面和正文图片路径、RSS/sitemap 构建能力等。发布前建议一定先跑。

生成静态网站：

```powershell
npm run build
```

检查构建产物：

```powershell
npm run check:output
```

这一步会扫描 `dist/`，检查自定义 404、关键安全头、本地链接、文章标题锚点、危险 URL 协议和文章页脚本加载策略。需要先运行 `npm run build`。
RSS 也会在这里检查，确保订阅源包含全文内容，并且正文里的站内链接使用正式域名的绝对地址。

本地预览：

```powershell
npm run preview
```

本地打开：

```text
http://localhost:4173
```

## 新增一篇文章

运行：

```powershell
npm run new:post -- "Unity 性能优化记录"
```

如果分类、标签和摘要已经确定，可以一次生成更完整的草稿：

```powershell
npm run new:post -- "Unity 性能优化记录" --slug unity-performance-notes --date 2026-06-04 --category Unity --tags "Unity,性能,Profiler" --summary "记录一次 Unity 性能分析流程。"
```

如果已经准备了封面文件，可以追加 `--cover /assets/posts/unity-performance-notes.svg`。这个路径必须指向仓库里的本地资源，不能用外链。

脚本会在 `content/posts/` 里生成一个 Markdown 文件，例如：

```text
content/posts/2026-06-04-unity-performance-notes.md
```

如果没有手动设置 `--slug`，同名文章会自动追加编号，避免覆盖已有文章。设置了 `--slug` 时，如果 slug 已存在，脚本会直接报错，避免发布后 URL 和预期不一致。

迁移旧文章时可以用 `--date YYYY-MM-DD` 指定原始发布日期；如果文章后续更新过，可以加 `--updated YYYY-MM-DD`。`updated` 不能早于 `date`。

使用上面带参数的命令时，打开这个文件会看到类似内容：

```yaml
---
title: Unity 性能优化记录
slug: unity-性能优化记录
date: 2026-06-04
category: Unity
tags: ["Unity", "性能", "Profiler"]
summary: "记录一次 Unity 性能分析流程。"
status: draft
---
```

下面就是正文区域，可以直接写 Markdown。

## 发布文章

文章默认是草稿：

```yaml
status: draft
```

草稿不会出现在首页、文章列表、分类、标签、归档、RSS 里。

写完后改成：

```yaml
status: published
```

发布文章至少要满足这些条件：

- `category` 不能还是 `未分类`
- `tags` 至少有一个
- `summary` 不能还是默认占位文本
- `slug` 不能和其他文章重复
- `cover` 和正文图片如果使用本地路径，文件必须存在

然后运行：

```powershell
npm run check:all
```

本地确认没问题后提交并推送：

```powershell
git add .
git commit -m "Add new post"
git push
```

Cloudflare Pages 会自动重新部署。

## 文章字段说明

每篇文章顶部的 `---` 区域叫 front matter。

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
featured: true
status: published
---
```

字段含义：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `slug` | 推荐 | 文章网址的一部分，例如 `/posts/render-optimization-checklist/` |
| `date` | 是 | 发布日期，格式 `YYYY-MM-DD` |
| `updated` | 否 | 更新日期，格式 `YYYY-MM-DD` |
| `category` | 推荐 | 分类，一个文章只能设置一个分类 |
| `tags` | 推荐 | 标签，一个文章可以设置多个 |
| `series` | 否 | 专题/系列名称，用来把多篇文章组织成连续阅读链路 |
| `seriesOrder` | 否 | 专题内排序，正整数，数字越小越靠前 |
| `summary` | 推荐 | 摘要，会显示在首页、列表页、RSS 和搜索结果 |
| `cover` | 推荐 | 文章列表页封面图路径，例如 `/assets/posts/my-cover.png`；本地路径必须存在 |
| `featured` | 否 | 是否作为首页精选文章 |
| `status` | 是 | `draft` 草稿，`published` 发布 |

## 设置分类

分类直接写在文章 front matter 里：

```yaml
category: Unity
```

或：

```yaml
category: 图形渲染
```

不需要手动创建分类页。构建时会自动生成：

```text
/categories/unity/
/categories/图形渲染/
```

建议分类数量不要太多。SOLUS 这类技术档案站可以先用这些：

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

发布文章的分类必须在 `content/site.json` 的 `categoryCovers` 里声明。这样分类页和默认封面会保持一致；如果要新增分类，先在 `categoryCovers` 里加上分类名和对应封面。

## 设置标签

标签写成数组：

```yaml
tags: [Unity, 性能, Profiler]
```

或：

```yaml
tags: [Shader, 渲染, 移动端]
```

构建时会自动生成标签页：

```text
/tags/unity/
/tags/性能/
/tags/shader/
```

标签可以比分类更细。建议用来描述技术点、工具、问题类型。

标签不要写 `#`，也不要在同一篇文章里重复。例如应该写：

```yaml
tags: [Shader, 渲染, 移动端]
```

不要写：

```yaml
tags: [#Shader, 渲染, 渲染]
```

## 设置专题

专题适合组织一组需要连续阅读的文章，例如：

```yaml
series: 性能与渲染排查
seriesOrder: 1
```

同一个 `series` 会自动生成专题页：

```text
/series/性能与渲染排查/
```

文章页底部也会自动显示当前专题的阅读列表。`seriesOrder` 必须是正整数，建议从 1 开始递增；同一专题内不要重复。

## 设置精选文章

在文章里加：

```yaml
featured: true
```

首页会展示所有设置为 `featured: true` 的文章，并按发布时间倒序排列。

如果不想让某篇文章出现在精选区，把它改成 `featured: false` 或删除这个字段。

取消精选：

```yaml
featured: false
```

或者直接删除 `featured` 字段。

## 修改文章网址

文章网址由 `slug` 决定。

例如：

```yaml
slug: unity-performance-start
```

生成的网址是：

```text
/posts/unity-performance-start/
```

建议 `slug` 使用英文、小写、短横线：

```yaml
slug: shader-variant-cleanup
slug: unity-gc-optimization
slug: renderdoc-frame-debugging
```

如果文章已经发布到网上，不建议随便改 `slug`，否则旧链接会失效。

## 正文 Markdown 写法

标题：

```markdown
## 二级标题
### 三级标题
```

二级到四级标题会自动生成章节链接，方便把文章里的某一节单独分享出去。

列表：

```markdown
- 第一项
- 第二项
- 第三项
```

表格：

```markdown
| 工具 | 适合观察 |
| --- | --- |
| RenderDoc | 单帧 GPU 细节 |
| Profiler | CPU、GPU 和内存时间线 |
```

代码块：

````markdown
```csharp
Debug.Log("Hello");
```
````

链接：

```markdown
[Unity 官方文档](https://docs.unity3d.com/)
```

外部链接会自动在新标签页打开，并带有外链标识。站内链接建议使用 `/posts/.../`、`/tags/.../` 这类根路径。

引用：

```markdown
> 这里是一段引用。
```

## 添加图片

把图片放进：

```text
assets/
```

例如：

```text
assets/unity-profiler.png
```

文章里这样引用：

```markdown
![Unity Profiler 截图](/assets/unity-profiler.png)
```

注意路径前面要有 `/assets/`，方括号里要写清楚图片内容。正文图片会进入文章可访问性和 SEO 检查，不能写成 `![](...)`。

## 修改博客标题、描述和导航

编辑：

```text
content/site.json
```

常用字段：

```json
{
  "title": "SOLUS Dev Notes",
  "brand": "SOLUS",
  "tagline": "技术档案",
  "description": "游戏开发、图形渲染和工程实践的长期技术档案。",
  "baseUrl": "https://blog.solus.games/",
  "socialImage": "/assets/og/solus-og.png"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `title` | 网站标题 |
| `brand` | 左上角品牌名 |
| `tagline` | 品牌副标题 |
| `description` | 网站描述 |
| `baseUrl` | 正式站点地址，用于 canonical URL、RSS、sitemap 和 robots.txt |
| `socialImage` | 首页、归档、标签、专题等页面默认分享图，当前 PNG 由 `assets/og/solus-og.svg` 生成 |
| `navigation` | 顶部导航 |
| `hero` | 首页 Hero 文案 |

## 修改浏览器图标和安装信息

浏览器标签页图标：

```text
public/favicon.svg
```

站点安装信息和移动端收藏名称：

```text
public/site.webmanifest
```

这些文件会在 `npm run build` 时复制到 `dist/`。所有页面的 `<head>` 已经自动引用它们，不需要在每篇文章里单独配置。

## 修改关于页

编辑：

```text
content/about.md
```

写法和普通文章一样，也是 Markdown。

## 本地预览流程

每次改完文章或配置后：

```powershell
npm run lint
npm run build
npm run preview
```

打开：

```text
http://localhost:4173
```

如果预览服务已经在运行，只需要重新：

```powershell
npm run build
```

然后刷新浏览器。

## 发布到线上

当前项目已经连接 GitHub 仓库：

```text
https://github.com/lucas9801/SoloBlog.git
```

日常发布流程：

```powershell
git status
git add .
git commit -m "Update blog"
git push
```

推送后 Cloudflare Pages 会自动构建和部署。

## Cloudflare Pages 设置

Cloudflare Pages 项目应使用：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
Node version: 20
```

如果有环境变量，建议设置：

```text
NODE_VERSION=20
```

当前正式域名已经写入 `content/site.json`：

```text
https://blog.solus.games/
```

如果以后更换域名，更新 `content/site.json` 的 `baseUrl`，或者在 Cloudflare Pages 里设置 `SITE_URL` 覆盖。

## 检查线上是否更新

推送后去 Cloudflare Pages 的 Deployments 页面看状态。

成功后访问：

```text
https://blog.solus.games/
```

如果页面还是旧的，可以：

1. 等 1 到 2 分钟。
2. 强制刷新浏览器。
3. 在 Cloudflare Pages 查看最新 deployment 是否成功。
4. 确认文章 `status` 是 `published`。

## 常见问题

### 为什么新文章没显示？

检查：

```yaml
status: published
```

再运行：

```powershell
npm run build
git add .
git commit -m "Publish post"
git push
```

### 为什么分类或标签没出现？

分类和标签只会根据已发布文章生成。草稿文章不会参与生成。

### 可以删除示例文章吗？

可以。删除 `content/posts/` 里的示例 Markdown 文件，然后运行：

```powershell
npm run lint
npm run build
```

注意：当前 lint 要求至少有一篇文章。如果全部删除，需要先新增自己的文章。

### 可以不用命令行写文章吗？

当前版本是文件驱动，需要编辑 Markdown 文件。以后可以接入 CMS，比如 Decap CMS，让你在网页后台写文章。

### 可以添加评论、点赞、浏览量吗？

可以，但需要额外接动态能力，例如 Cloudflare Pages Functions + D1/KV，或者第三方评论系统。

当前版本优先保证博客内容、分类、标签、归档、搜索、RSS 和部署流程稳定。

## 推荐日常流程

最常用的一套流程：

```powershell
cd D:\MyBlog
npm run new:post -- "文章标题"
```

编辑生成的 Markdown：

```yaml
category: Unity
tags: [Unity, 性能]
summary: 这里写摘要。
# cover: /assets/posts/my-cover.svg
# cover 可省略；省略时构建脚本会按文章自动生成封面
status: published
```

检查和构建：

```powershell
npm run check:all
```

提交发布：

```powershell
git add .
git commit -m "Add article"
git push
```

Cloudflare Pages 自动发布完成后，访问线上地址查看。
