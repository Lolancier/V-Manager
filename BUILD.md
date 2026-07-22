# 打包构建指南

## 日常正式打包

1. 完全退出所有 V-Manager 实例（包括安装版和 `win-unpacked` 版）
2. 在项目目录运行：

```bash
cd D:\V-Manager
npm.cmd install
npm.cmd test
npm.cmd run dist
```

3. 成功后生成：

```
D:\V-Manager\release\win-unpacked\V-Manager.exe        # 免安装版
D:\V-Manager\release\V-Manager Setup 0.7.0.exe          # 安装包
```

## 三个构建命令的区别

| 命令 | 作用 |
|------|------|
| `npm.cmd run build` | 只构建前端（`vite build`），不生成桌面程序 |
| `npm.cmd run pack` | 生成免安装版 `win-unpacked` |
| `npm.cmd run dist` | 同时生成免安装版和安装包，正式发布用这个 |

## 发布新版本

例如从 `0.7.0` 更新到 `0.7.1`：

```bash
npm.cmd version 0.7.1 --no-git-tag-version
npm.cmd test
npm.cmd run dist
```

`npm version` 会同步更新 `package.json` 和 `package-lock.json`，安装包名称也会自动变为 `V-Manager Setup 0.7.1.exe`。

## 建议的完整发布顺序

```bash
cd D:\V-Manager
npm.cmd install
npm.cmd version 0.7.1 --no-git-tag-version
npm.cmd test
npm.cmd run dist
```

然后先测试免安装版：

```
release\win-unpacked\V-Manager.exe
```

确认模型、聊天栏、设置和代码工作台均正常后，再测试安装包。

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
npm.cmd run dist
```

### 资源路径

当前资源路径修复已写入构建配置，后续不需要手动复制 `dist`、`Live2D` 模型或 `Cubism` 文件。
