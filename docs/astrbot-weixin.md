# AstrBot 微信联动设计

## 目标

V-Manager 负责角色、人设、记忆、决策和本地 Agent 能力；AstrBot 只承担消息平台 Gateway。这样微信接入不会依赖窗口焦点、键盘模拟或屏幕坐标，也不会让 AstrBot 和 V-Manager 同时生成两套回复。

## 参考项目比对

EchoBot 将平台通道放在独立的 `channels` / `gateway` 层，并把 Decision、Roleplay、Agent 三类职责分开。V-Manager 沿用这个边界，但不复制 EchoBot 的 Python 运行时：现有 Electron/Node Agent 保持不变，新增轻量 AstrBot HTTP 客户端作为通道适配器。

| 项目 | EchoBot | V-Manager 0.7 采用方式 |
|---|---|---|
| 平台抽象 | 独立 Channels 与 Gateway | `astrbot-client.js` 与微信执行器分层 |
| 角色回复 | Roleplay 层 | 继续使用 Vivi 人设与关系引擎 |
| 任务执行 | Agent Core | 继续使用现有本地工具与代码代理 |
| 微信传输 | 当前 README 主要列出 QQ、Telegram | AstrBot 个人微信适配器 |
| 进程形态 | Python 单体服务 | Electron 主程序 + AstrBot 本地旁路服务 |

参考：[EchoBot](https://github.com/KdaiP/EchoBot)、[AstrBot 个人微信文档](https://docs.astrbot.app/platform/weixin_oc.html)、[AstrBot HTTP API](https://docs.astrbot.app/dev/openapi.html)。

## 当前消息流

```text
用户命令
  -> V-Manager 解析联系人和消息
  -> 精确联系人映射为 AstrBot UMO
  -> POST /api/v1/im/message
  -> AstrBot 个人微信适配器
  -> 微信联系人
```

V-Manager 使用最小权限 API Key，只要求 AstrBot 的 `im` scope。启用 AstrBot 后，发送错误会直接返回，不会静默改用 UI 自动化，防止重复发送或假成功。

## 当前限制与下一步

- 联系人必须已有可用 UMO；官方通道不是个人通讯录搜索接口。
- 当前只完成主动文本发送和连接检测。
- 下一步需要一个 AstrBot 插件把接收事件推送到 V-Manager 的本地回调端口。
- V-Manager 收到事件后应先记录 `sender/UMO/context`，再进入 Vivi 对话管线，最后通过同一 UMO 回发。
- 自动回复必须提供联系人白名单、总开关、冷却时间和循环保护，避免两个机器人互相回复。
