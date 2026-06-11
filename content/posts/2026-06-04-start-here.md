---
title: SOLUS 技术档案的起点
slug: start-here
date: 2026-06-04
category: 随笔
tags: [博客, 游戏开发, 知识库]
summary: SOLUS 用于沉淀游戏开发、图形渲染、工程实践和项目复盘中的长期技术笔记。
featured: true
status: published
---

这篇文章是 SOLUS 技术档案的起点。后续内容会按主题进入不同分类，并通过标签形成可检索的知识链路。

## 写什么

我会优先记录这些内容：

- 游戏项目中的真实问题和解决过程
- 渲染、Shader、性能优化相关实验
- Unity、Godot、Cocos 等引擎实践
- 工具链、自动化和团队协作经验
- 项目上线后的复盘与改进清单

## 怎么维护

每篇文章都是一个 Markdown 文件。构建脚本会读取 `content/posts`，自动生成文章页、归档页、分类页、标签页、搜索索引、RSS 和 sitemap。

以后写新文章时，可以运行：

```bash
npm run new:post -- "文章标题"
```

然后编辑生成的 Markdown 文件，再运行：

```bash
npm run build
```

这样技术档案就会更新。
