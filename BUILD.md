# 打包构建指南

## 日常正式打包

1. 完全退出所有 V-Manager 实例（包括安装版和 `win-unpacked` 版）。
2. 在项目目录运行：

```bash
cd D:\V-Manager
npm install
npm test
npm run dist
```

3. 成功后生成（输出到项目同级 `V-Manager-builds` 目录）：

```
D:\V-Manager-builds\win-unpacked\V-Manager.exe      # 免安装版
D:\V-Manager-builds\V-Manager Setup 0.10.0.exe      # 安装包
```

## 三个构建命令的区别

| 命令 | 作用 |
|------|------|
| `npm run build` | 只构建前端（`vite build`），不生成桌面程序 |
| `npm run pack` | 生成免安装版 `win-unpacked` |
| `npm run dist` | 同时生成免安装版和安装包，正式发布用这个 |

## 发布新版本

例如从 `0.10.0` 更新到 `0.10.1`：

```bash
npm version 0.10.1 --no-git-tag-version
npm test
npm run dist
```

`npm version` 会同步更新 `package.json` 和 `package-lock.json`，安装包名称也会自动变为 `V-Manager Setup 0.10.1.exe`。

## 建议的完整发布顺序

```bash
cd D:\V-Manager
npm install
npm version 0.10.1 --no-git-tag-version
npm test
npm run dist
```

然后先测试免安装版：

```
D:\V-Manager-builds\win-unpacked\V-Manager.exe
```

确认模型、聊天栏、设置和代码工作台均正常后，再测试安装包。

## 开发门禁（发布前）

```bash
npm run audit:architecture   # 架构审计（IPC 所有权、窗口安全、打包布局）
npx tsc --noEmit             # 严格类型检查
npm run verify:electron      # 真实 Electron 运行时与原生语音模块冒烟
npm run verify               # 审计 + 测试 + 构建三合一
```

## 常见问题

### EBUSY 或 app.asar locked

说明旧版程序仍在运行。优先从托盘或右键菜单正常退出。

如果仍被占用，先检查进程：

```powershell
Get-Process "V-Manager" -ErrorAction SilentlyContinue
```

确认后强制终止：

```powershell
Get-Process "V-Manager" | Stop-Process
```

然后重新构建：

```bash
npm run dist
```

### 资源路径

当前资源路径修复已写入构建配置，后续不需要手动复制 `dist`、`Live2D` 模型或 `Cubism` 文件。
