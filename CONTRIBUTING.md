# 参与项目

欢迎通过 Issues 反馈问题、提出功能建议，或提交 Pull Request。

## 开始开发

1. Fork 并克隆仓库，进入项目目录。
2. 执行 npm ci 和 npm run build，随后 npm run dev。
3. 保持代码、测试和素材位于项目目录内。不要提交 dist、依赖目录、浏览器配置、运行日志或发布 ZIP。

## 提交变更

- 描述解决的问题、最终行为及验证方式；界面调整请附截图。
- 前端变更运行 npm test；电台变更运行 node tests/radio-policy.cjs、node tests/radio-recovery.cjs、node tests/radio.cjs 及 tests/native-audio.ps1（后两项需要网络，静音验证）。
- 增删或修改电台必须遵守 [白名单核验与维护规则](docs/RADIO_ALLOWLIST.md)：先核验主管部门名录及官方频道/音源，再改 config/radio-allowlist.json、依据文档和测试。不得仅凭中文名称、国家字段或可播放就加入，也不得恢复开放目录回退。
- Windows 设置或安装变更运行 tests/settings.ps1 和 tests/installer.ps1；它们使用隔离注册表分支。
- 原生窗口变更运行 tests/native.ps1 与 tests/tray.ps1；需要 Windows 桌面会话。
- 修改安装或打包内容后，运行 scripts/package.ps1 与 tests/release.ps1。
- 保持默认不播放音乐、开机托盘可选、退出停止音频的行为。不要为方便测试修改真实系统配置。

完整命令与环境要求见 docs/USER_GUIDE.md。提交日志或截图前请移除个人信息。
