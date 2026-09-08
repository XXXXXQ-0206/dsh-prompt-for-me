# dsh-prompt-for-me

**为 DeepSeek Harness 设计的 Prompt 设计伙伴。**

`dsh-prompt-for-me` 位于 Harness 输入栏旁边，帮你把模糊的想法变成开发 Agent 可以直接执行的 Prompt。它会读取当前项目作为背景，理解草稿背后的真实意图，然后优化现有草稿，或在草稿为空时设计下一步最有价值的开发 Prompt。结果会流式写入输入框，你可以继续审阅、撤销、重做，再像普通草稿一样发送。

这不是自动 Ghost Text 插件，也不会代替你发送消息。

## 为什么需要它

写好一条 Agent Prompt 本质上是一种设计工作。它通常需要知道：

- 你正在解决什么问题；
- 项目当前已经包含什么；
- 下一步应该修改哪段代码、执行哪个命令、聚焦哪个模块；
- 需要哪些行为、输出、边界、测试和验收标准；
- 哪些约束必须原样保留。

`dsh-prompt-for-me` 负责收集这些背景并完成 Prompt 设计，而不是把项目变成摘要，或者生成一条助手式回复。

## 功能亮点

- **一个按钮，两种模式**  
  输入框有正文时显示 **优化提示词**；项目已打开且输入框为空时显示 **设计提示词**。

- **项目级上下文**  
  读取 Session `cwd`、有界的文件树、关键 manifest，以及最近 git 状态/diff。背景只用于理解，不会成为最终输出。

- **设计而不是预测**  
  草稿为空时，它会设计下一步值得执行的工程动作，不会模仿用户语气，也不会生成闲聊。

- **诚实的优化**  
  保留原始 Prompt 的核心意图，不扩展成无关需求；优化结果中不会反问用户、要求用户补充细节。

- **使用你当前选中的模型**  
  复用输入框当前选择的 provider/model，并支持 Session 请求头与固定组合配置兜底。

- **流式且可控**  
  输出增量写入草稿；请求期间锁定输入；再次点击立即中断并恢复原始草稿；`Ctrl+Z` / `Ctrl+Y` 支持回退与重做。

- **隐私优先**  
  只发送有界文本，项目路径、manifest、会话历史和交互记忆均有上限；调用模型前会替换常见密钥模式。

## 使用方式

1. 在项目工作区打开 DeepSeek Harness Web Session。
2. 点击输入栏右下“上下文占用图标右侧、发送按钮左侧”的按钮。
3. 有正文时优化 Prompt；空输入时设计下一步开发 Prompt。
4. 审阅流式结果，按需修改，再像普通草稿一样发送。

| 操作 | 结果 |
| --- | --- |
| 输入任务后点击 **优化提示词** | 使用项目上下文优化当前 Prompt。 |
| 打开项目、草稿为空后点击 **设计提示词** | 设计下一步高价值开发 Prompt。 |
| 生成中再次点击 | 中止请求并恢复原始草稿。 |
| `Ctrl+Z` / `Ctrl+Y` | 在生成历史中撤销/重做。 |
| 按 Enter | 只发送最终可见草稿。 |

## 安装

Release 包含预构建的 Host 与 Client 产物：

```sh
dsh plugin --profile web add https://github.com/XXXXXQ-0206/dsh-prompt-for-me/releases/download/v0.6.8/dsh-prompt-for-me-0.6.8.tgz
```

也可以安装固定 Git 标签：

```sh
dsh plugin --profile web add github:XXXXXQ-0206/dsh-prompt-for-me#v0.6.8
```

安装后重启 `dsh web`。从 Git 安装时，pnpm 可能要求允许包的 `prepare` 脚本；它只复制 Host 文件并包装 Client factory。

更新或卸载：

```sh
dsh plugin --profile web update dsh-prompt-for-me
dsh plugin --profile web remove dsh-prompt-for-me
```

## 设置

打开 **设置 → 插件 → 可配置 → Prompt for Me / Prompt 嘴替**。

- **手动生成快捷键** 默认为 `Mod+Shift+Space`。
- **高级设置 → 建议模型** 默认跟随当前 Session，也可以固定到 Harness 模型目录中的某个 provider/model。

上下文预算、偏好记忆、模型输出上限和超时均由产品统一管理，不要求用户调整内部参数。

## 架构

这是一个同时包含 Host 与 Browser 两端的 dsh bundle：

```text
src/index.cjs              Host 入口：Session 事件、项目上下文、模型路由、NDJSON RPC
src/core.cjs               有界 Prompt 输入、脱敏、记忆、按模式切换的系统指令
src/client-factory.cjs     Browser 半边：输入栏按钮、流式处理、锁定/中断/撤销
cordis.patch.yml           Web Profile bundle patch
lib/                       生成的 Host/Client 产物
```

Browser 通过 `/dsh-prompt-for-me/rpc` 使用 NDJSON 通信。Host 收集项目证据、限制所有文本字段大小、调用当前选中的 `ctx.llm` 路由，并把增量与最终候选流式返回输入框。

## 开发

需要 Node.js 22.19 或更高版本。

```sh
npm run check
```

该命令会重建静态产物、运行测试，并检查包内容。

## License

MIT
