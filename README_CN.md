<p align="center"><strong>dsh-slides</strong></p>

# DeepSeek Harness 的幻灯片插件

[English](README.md) | 中文

[![npm](https://img.shields.io/npm/v/dsh-slides?label=npm)](https://www.npmjs.com/package/dsh-slides) [![CI](https://github.com/literaf/dsh-slides/actions/workflows/ci.yml/badge.svg)](https://github.com/literaf/dsh-slides/actions/workflows/ci.yml) [![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin) ![license](https://img.shields.io/badge/license-MIT-green)

给 Agent 一个 `make_slides` 工具，它就能把一场报告写成**一个 HTML 文件**——任意浏览器打开、全屏放映、演讲备注只有你自己看得到、Ctrl+P 直接打印成 PDF。

这个文件在放映时不加载任何东西：没有 CDN、没有网络字体、没有图床。要联网才能放的片子，就是可能在会场当场翻车的片子。

![ink 主题下的一页](assets/theme-ink.png)

## 安装

```sh
dsh plugin --profile web add dsh-slides
dsh web
```

然后直接说：**「把这些结果做成一个十分钟的报告」**。

## Agent 拿到了什么

一个工具 `make_slides`，接收结构化的幻灯片数据，而不是让用户自己再转一遍的 markdown：

| 版式 | 装什么 |
|---|---|
| `title` | 标题、副标题、汇报人。由整体字段自动生成，不需要你自己写一页 |
| `section` | 章节分隔页 |
| `bullets` | 标题写结论，下面列要点，可以配一张图 |
| `image` | 一张图配图注，占满整页 |
| `quote` | 引语加出处 |

不写 `layout` 就按你填了哪些字段自动判断。

每一页都可以带 `notes`——演讲备注。它**不会出现在幻灯片上**，放映时按 `S` 才显示给汇报人自己看。这正是这个工具的用意：结论放页面上，要讲的话放备注里，Agent 的指令里也是这么要求它的。

要点支持 `**粗体**`、`*斜体*` 和 `` `代码` ``。所有内容先转义再套格式，所以内容永远无法往页面里注入标记。

## 放映

| 按键 | |
|---|---|
| `→` `←` `空格` | 下一页 / 上一页 |
| `S` | 显示、隐藏演讲备注 |
| `F` | 全屏 |
| `Home` `End` | 第一页 / 最后一页 |
| `Ctrl+P` | 打印——一页一张、隐藏界面元素，直接出 PDF |

也可以用鼠标：点左边三分之一后退，点其余部分前进。地址栏里带页码，所以链接可以直接指向某一页。

## 主题

五套做完的样子，而不是一堆可调的属性。选一个，别自己拼。

| 主题 | |
|---|---|
| `plain` | 白底、无衬线、细强调线。默认；退到内容后面 |
| `ink` | 暖白纸底 + 衬线。像一篇印出来的论文，适合组会和答辩 |
| `midnight` | 深蓝底浅字。明亮的房间里，白底片子会糊，这个撑得住 |
| `slate` | 中性灰、无彩色强调。适合让图表承担全部颜色的片子 |
| `sunrise` | 米白底配暖色强调。想说服人的报告可以用这个更轻的调子 |

<p align="center">
  <img src="assets/theme-plain.png" width="48%" alt="plain 主题">
  <img src="assets/theme-midnight.png" width="48%" alt="midnight 主题"><br>
  <img src="assets/theme-slate.png" width="48%" alt="slate 主题">
  <img src="assets/theme-sunrise.png" width="48%" alt="sunrise 主题">
</p>

字体栈只写系统字体，理由和「不加载任何东西」是同一个。

## 配置

组合包插入一行（`id: slides`）。在 profile 的 `cordis.patch.yml` 里覆盖（patch 会整体替换 `config`，保留的键要一起写）：

```yaml
- id: slides
  config:
    outputDir: slides/       # 幻灯片写到哪里，相对工作区
    defaultTheme: plain      # plain | ink | midnight | slate | sunrise
    promptGuidance: true     # 注册写幻灯片的指令
    promptOrder: 150
```

## 说明

- 文件通过 `ctx.fs` 写入，所以沙箱文件系统后端会像管别的工具一样管住这次写入。也正因如此，**只有组合里存在文件系统提供者时才会注册这个工具**——没有的话工具和指令都不出现，而不是给模型一个必然失败的调用。
- 图片要你自己提供。用 `data:` URI 可以让片子完全自包含；用 `https` 链接也能放，但放映时就依赖那个站点了。
- 本包只负责渲染，不关心内容从哪来。关心内容的包——比如做学术报告的 `dsh-paper-slides`——平级安装在旁边，驱动 `make_slides`。

## 已知限制

- **暂不导出 `.pptx`。** 0.1.0 只写 HTML。导出已在计划内，路子也清楚：用 `ctx.fs.resolve` 让文件系统后端先裁定这个路径允不允许、落在哪，再用 `processPath` 拿到解析后的位置写字节——容器化判断仍然由沙箱做出，而不是绕过它。在此之前请先打印成 PDF。
- **不支持逐条动画。** 一页整体出现。动画和转场这种东西，由 Agent 替你选，往往一眼就能看出是生成的。

## 许可证

MIT
