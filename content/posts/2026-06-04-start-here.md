---
title: 从这里开始：我的游戏开发技术博客
slug: start-here
date: 2026-06-04
category: 随笔
tags: [博客, 游戏开发, 知识库]
summary: 这个博客用于沉淀游戏开发过程中的技术文章、项目复盘、工具链经验和长期学习笔记。
featured: true
status: published
---

这篇文章是博客的起点。后续所有内容都可以按主题放进不同分类，并通过标签串联起来。

## 写什么

我会优先记录这些内容：

- 游戏项目中的真实问题和解决过程
- 渲染、Shader、性能优化相关实验
- Unity、Godot、Cocos 等引擎实践
- 工具链、自动化和团队协作经验
- 项目上线后的复盘与改进清单

## 怎么维护

每篇文章都是一个 Markdown 文件。构建脚本会读取 `content/posts`，自动生成文章页、归档页、分类页、标签页和搜索索引。

以后写新文章时，可以运行：

```bash
npm run new:post -- "文章标题"
```

然后编辑生成的 Markdown 文件，再运行：

```bash
npm run build
```

这样博客就会更新。
