---
title: Unity 性能分析从哪里下手
slug: unity-performance-start
date: 2026-06-04
category: Unity
tags: [Unity, 性能, Profiler]
summary: 面对卡顿问题时，先建立性能预算，再用 Profiler 区分 CPU、GPU、内存和 IO 的瓶颈。
status: published
---

Unity 项目的性能问题经常混在一起。解决前先判断瓶颈属于 CPU、GPU、内存还是 IO。

## 建立预算

以 60 FPS 为例，一帧预算约为 16.67ms。移动端还要额外关注发热、降频和电量消耗。

## 分层定位

常见入口：

- CPU：脚本、物理、动画、UI 重建
- GPU：渲染管线、后处理、阴影、Overdraw
- 内存：实例化、纹理、GC 分配
- IO：资源加载、解压、网络等待

## 固化检查

把常见性能检查写进发布流程，比临上线再集中排查更可靠。
