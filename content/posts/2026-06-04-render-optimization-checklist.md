---
title: 渲染优化排查清单
slug: render-optimization-checklist
date: 2026-06-04
category: 图形渲染
tags: [渲染, Shader, 性能]
series: 性能与渲染排查
seriesOrder: 1
summary: 一份用于定位渲染性能问题的实践清单，覆盖帧调试、Draw Call、Overdraw、纹理和 Shader 分支。
featured: true
status: published
---

渲染优化不应该从猜测开始。更稳妥的方式是先把问题拆成可观察的指标，再逐项排除。

## 先看帧

使用 Frame Debugger、RenderDoc 或平台 Profiler 观察一帧里发生了什么：

| 工具 | 适合观察 | 输出结果 |
| --- | --- | --- |
| Frame Debugger | 引擎内渲染步骤 | 调用顺序和渲染状态 |
| RenderDoc | 单帧 GPU 细节 | Draw Call、资源绑定和管线状态 |
| 平台 Profiler | 真实设备表现 | CPU、GPU 和内存时间线 |

- Draw Call 是否异常增长
- 透明物体是否造成明显 Overdraw
- 后处理是否占据主要耗时
- 阴影、反射、实时光源是否过重

## 再看资源

纹理、网格和材质经常是隐性成本来源。排查时要确认压缩格式、贴图尺寸、Mipmap、材质实例数量和批处理状态。

## 最后改 Shader

Shader 优化要谨慎。优先删除无效分支、减少纹理采样、降低变体数量，并用真实设备验证收益。
