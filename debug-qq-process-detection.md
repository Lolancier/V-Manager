# Debug Session: qq-process-detection
- **Status**: [OPEN]
- **Issue**: 资源查看面板中的“运行进程 / 前台应用”持续显示为 0，且聊天回答“QQ 是否打开”时无法基于本机真实进程状态判断。
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-qq-process-detection.ndjson

## Reproduction Steps
1. 启动应用并打开设置窗口。
2. 查看“资源查看”中的“运行进程”和“前台应用”。
3. 用户机器上已打开 QQ，向 Agent 询问“QQ 有没有打开”。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 主进程调用 `getSystemResourceSnapshot()` 时，`getProcessSnapshot()` 抛错并走兜底返回 0。 | High | Low | Pending |
| B | `getProcessSnapshot()` 实际拿到了进程数据，但 IPC 返回或前端状态更新链路丢失了字段。 | Medium | Low | Pending |
| C | QQ 检测失败不是取数问题，而是聊天回复链路根本没有接入本地进程查询能力。 | High | Low | Pending |
| D | Electron 运行环境中的 PowerShell 调用与终端手动执行表现不同，导致只在应用内失败。 | Medium | Medium | Pending |

## Log Evidence
- 直接在 Node 中调用 `getSystemResourceSnapshot()`，返回 `processCount: 0`、`visibleAppCount: 0`，说明问题在后端取数链路，不是前端展示问题。
- 直接执行 `tasklist /v /fo csv /nh` 能查到 `QQ.exe` 和 `Weixin.exe`，说明系统层面的真实进程数据可用。
- `tasklist` 默认编码导致 `N/A` 被误解码，前台应用计数被放大，需要切换 UTF-8 并过滤系统占位窗口。

## Verification Conclusion
- A: Confirmed（原取数脚本在应用内失败，导致兜底 0）
- B: Rejected（前端不是主因）
- C: Confirmed（聊天链路之前未接入本地进程检测）
- D: Confirmed（不同调用方式/编码处理影响了结果）
