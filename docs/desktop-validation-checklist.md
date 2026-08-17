# Desktop Validation Checklist

更新时间：2026-08-17

## 已完成的自动化验证

- [x] `npx tsc --noEmit`
  - 严格类型检查通过。
  - 说明：`src/pet/official/*` 为官方 Live2D 示例源码，已通过 `// @ts-nocheck` 从项目门禁中隔离，避免第三方示例代码阻塞业务代码的严格检查。
- [x] `npm run build`
  - 9 个 renderer HTML 入口均成功产出。
  - 当前主要共享产物：
    - `dist/assets/mount-root-QQ4Luzrz.js` `324.25 kB`
    - `dist/assets/mount-root-iOdrTLco.css` `71.74 kB`
- [x] `npm run verify:electron`
  - Electron runtime smoke 通过。
  - 结果：
    - `electron = 43.4.0`
    - `node = 24.18.1`
    - `chrome = 150.0.7871.224`
    - `modules = 148`
    - `sherpa-onnx-node` 原生导出完整

## 仍需人工完成的发布门禁

- [ ] NSIS 干净安装、覆盖升级、卸载，并确认用户数据保留策略
- [ ] 透明窗口多显示器、DPI 缩放、置顶、拖拽、鼠标穿透测试
- [ ] Live2D 加密资源与中文路径加载测试
- [ ] 真实 TTS/STT 模型推理、安装、切换、缓存失效测试
- [ ] 游戏试玩、模拟输入、截图、取消、联网拦截测试
- [ ] 启动时间、空闲内存、逐窗口打开后的 renderer 数量与峰值内存记录

## 当前判断

- 结构现代化：基本达标
- 自动化门禁：已补齐关键缺口
- 发布门禁：仍需完成上面的人工桌面验证项
