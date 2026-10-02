# dsh-prompt-for-me

<p align="center">
  <a href="README.md"><kbd>English</kbd></a>
  &nbsp;|&nbsp;
  <a href="README.zh-CN.md"><kbd>中文</kbd></a>
</p>

面向 DeepSeek Harness（DSH）输入框的提示词优化插件。它会把非空草稿改写得更清晰、更便于执行，并将结果写回输入框供你检查。

## 项目概述

Prompt for Me 运行在 DSH Web Session 中。插件将本地内置的优化提示词与输入框草稿组合起来，再调用 DSH 当前选定的模型路由。生成内容会流式写入输入框，由你决定是否继续修改或发送。

默认优化提示词是本地模板，其助手身份设为 DeepSeek AI 编程助手。生成内容使用 DSH 配置的模型；插件不会调用独立的提示词优化服务。

## 功能

- **优化当前草稿。** 在保留原任务意图的基础上，让指令更清晰、更便于开发 Agent 执行。
- **使用 DSH 模型路由。** 默认跟随当前 Session 选择的提供商和模型；也可以在设置中固定 DSH 提供的模型。
- **编辑优化提示词。** 提示词规则和 few-shot 示例段可以分别自定义，并分别恢复默认，也可以一键恢复两段。
- **添加自定义 few-shot。** 可配置“原始提示词 / 优化后提示词”，或“宽泛任务提示 / 优化后的任务指令”。
- **保持输入控制权。** 结果写入草稿供你审阅，插件不会自动提交消息。

## 当前功能范围

当前启用的是提示词优化，输入框必须有文字。空草稿提示词设计和项目上下文采集仍保留在代码中，但目前均已关闭。优化请求只发送输入框草稿和配置的本地提示词，不采集项目文件或会话历史。

请求会发送到 DSH 当前选定的提供商/模型（或嘴替设置中的自定义路由）。数据处理遵循对应模型提供商的条款。

## 使用方式

1. 在 DeepSeek Harness Web 中打开项目 Session。
2. 在输入框中写下需要优化的任务。
3. 点击输入框操作区旁的嘴替按钮。
4. 检查并编辑生成的草稿，确认后再发送。

| 操作 | 结果 |
| --- | --- |
| 输入非空草稿后点击嘴替 | 将优化后的指令流式写入输入框。 |
| 生成期间再次点击 | 取消当前请求。 |
| 在输入框中按 `Ctrl+Z` / `Ctrl+Y` | 在生成草稿历史中撤销或重做。 |
| 检查完成后按 Enter | 通过 DSH 发送当前可见草稿。 |

空草稿不会启动提示词生成，因为空草稿提示词设计目前处于关闭状态。

## 安装

1.0.0 版本面向 DeepSeek Harness `0.2.x`（`0.2.0-rc.1` 或更新版本）。

在本仓库的 GitHub Releases 页面下载对应版本的安装包：

```sh
dsh plugin --profile web add https://github.com/XXXXXQ-0206/dsh-prompt-for-me/releases/download/v1.0.0/dsh-prompt-for-me-1.0.0.tgz
dsh web
```

如果使用 fork 或更新的发布版本，请替换为对应的所有者、标签和版本号。也可以固定 Git 标签安装：

```sh
dsh plugin --profile web add github:XXXXXQ-0206/dsh-prompt-for-me#v1.0.0
```

安装或更新后重启 `dsh web`。

```sh
dsh plugin --profile web update dsh-prompt-for-me
dsh plugin --profile web remove dsh-prompt-for-me
```

## 设置

打开 **设置 → 嘴替**。

- **模型路由：** 默认跟随当前 Session，也可以从 DSH 模型目录中选择提供商和模型，为插件固定使用。
- **生成方式：** 默认使用**最快（不思考）**；只有在需要更深入分析时才选择更高档位。
- **优化提示词：** 分别编辑默认指令和 few-shot 示例段。每一段都可以单独恢复默认，也可以同时恢复两段。
- **自定义 few-shot 示例：** 添加、编辑、启用、停用或删除示例。每条例子可以是“原始提示词配优化后提示词”，也可以是“宽泛任务提示配优化后的任务指令”；最多可保存 16 条。
- **高级生成限制：** 设置最大输出 Token 数和请求超时。

项目上下文采集关闭时，对应设置项会隐藏。

## 构建

要求：Node.js 22.19 或更高版本。

```sh
npm ci
npm run build
npm test
```

提交更改前运行完整检查：

```sh
npm run check
```

`npm run check` 会重建生成文件、运行测试，并通过 `npm pack --dry-run` 检查安装包内容。

## 项目结构

```text
src/index.cjs              DSH Host 集成、模型路由与 RPC
src/core.cjs               提示词拼装、设置与有界请求数据
src/optimizer-template.cjs 本地默认优化提示词与 few-shot 段
src/client-factory.cjs     输入框按钮与设置界面
src/features.cjs           已归档能力的功能开关
cordis.patch.yml           DSH Web Profile 配置
scripts/build.mjs          Host 与 Client 构建脚本
lib/                       生成的安装包产物
```

## 参与贡献

欢迎提交问题报告和范围明确的 Pull Request。提交前请：

1. 说明用户可见的问题以及预期行为。
2. 控制改动范围，并补充或更新相关测试。
3. 运行 `npm run check`，并在 Pull Request 中说明结果。

项目规范见 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。

## 常见问题

**为什么空输入框没有生成内容？**

空草稿提示词设计目前已关闭。请先输入草稿，再使用 Prompt for Me。

**插件会把项目文件发送给模型吗？**

当前启用的优化流程只发送输入框草稿和配置的提示词。项目上下文采集当前关闭。

**由哪个模型生成结果？**

默认使用当前 DSH Session 选定的模型。你也可以在 Prompt for Me 设置中固定某个 DSH 提供商和模型。

**可以修改默认提示词吗？**

可以。你可以在设置中编辑提示词规则、模板 few-shot 示例段和自定义 few-shot 示例；模板的两段均提供恢复默认操作。

## 许可证

本项目采用 MIT License，详见 [LICENSE](LICENSE)。

## 版权声明与模板来源

默认提示词模板来源于 Trae，并针对本插件进行了改编。项目已调整模板中的助手身份名称及集成方式；此来源说明不代表任何背书或关联关系。

## 免责声明

本软件按 **“AS IS”** 原样提供，不附带任何明示或默示的保证。在适用法律允许的最大范围内，作者和贡献者不对因使用本软件而产生的任何直接、间接、附带、特殊、惩罚性或后果性损失承担责任。使用者自行承担使用风险，并负责遵守适用法律及模型服务条款。禁止将本软件用于违法用途。
