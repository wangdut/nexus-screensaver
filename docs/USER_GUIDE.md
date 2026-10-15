# NEXUS · 星核实验室 1.1

Windows 10 / 11 x64 交互式粒子屏保。量子星核、引力星环、时空之门保留原有视觉效果，新增通知区域托盘、系统偏好设置和中文音乐电台。视觉效果离线可用，电台按需联网。

## 安装与首次使用

1. 完整解压 NEXUS-Windows-x64-v1.1.zip。
2. 双击 Install.cmd，为当前用户安装，无需管理员权限。默认启用 Windows 屏保，闲置 5 分钟后全屏。
3. 在自动打开的偏好设置中调整闲置时间（1–240 分钟），按需勾选登录 Windows 时启动托盘，点击保存。
4. 右键右下角通知区域的 NEXUS 图标进入设置，也可从开始菜单打开 NEXUS 偏好设置。图标可能收在 Windows 隐藏图标区域。
5. 窗口右上角 ♫ 选择音乐电台。首次默认关闭音乐，可收藏、搜索、调音量及静音。

只体验画面：双击 Nexus.exe 或 Launch.cmd，不会自动安装、启用开机启动或更改系统屏保。请保留旁边的 web 文件夹和 DLL，不能只复制 exe 或 scr。

运行环境：Windows 10 / 11 x64、.NET Framework 4.8、Microsoft Edge WebView2 Runtime、支持 WebGL 2 的显卡。不需要 Node.js 或 .NET SDK。WebView2 缺失时可从微软官网下载：https://developer.microsoft.com/microsoft-edge/webview2/

## 开机启动与闲置全屏

双击一次不会自动开启开机启动。安装后勾选「登录 Windows 时启动托盘」，才会在登录后自动显示托盘；不会自动打开画面或播放音乐。

Windows 系统屏保独立于托盘运行。安装并启用后，重启也不用再双击，达到闲置时间由 Windows 启动全屏。退出托盘不会停用系统屏保；取消「启用 NEXUS 系统屏保」才会关闭闲置触发。

可选：覆盖全部显示器、纯净模式、移动鼠标或按键即退出的传统模式、关闭体验窗口后保留托盘。默认支持鼠标/触摸互动，Esc 退出；纯净模式下 H 显示控件。关闭体验窗口会停止该窗口的音乐。

锁屏、屏幕关闭、休眠及组织策略由 Windows 管理。如果系统要求恢复时显示登录屏幕，首次输入可能直接返回登录界面。完整互动也可以在窗口体验版按 F 全屏使用。程序不修改锁屏策略，不替代安全锁屏。

## 卸载与升级

安装后，可通过「控制面板 → 程序和功能」或「设置 → 应用 → 已安装的应用」卸载 NEXUS，也可双击 Uninstall.cmd。卸载移除应用、启动项及快捷方式；若当前屏保仍为 NEXUS，则恢复安装前的屏保设置。保留收藏、音量与视觉偏好，便于重新安装。

升级时完整解压新包并运行 Install.cmd。保留现有闲置时间、屏保启用状态与偏好。应用位于 %LOCALAPPDATA%\NexusScreensaver\App，WebView 用户数据位于同级 WebView 文件夹。

## 音乐电台

- Radio Browser 公开目录，无需密钥，优先中文音乐。可搜索名称并收藏常听电台。
- 播放/停止、音量、静音/取消静音；M 快速切换静音。纯净模式仍有迷你播放器。
- 如需屏保自动播放，先选择电台，再勾选「屏保启动时播放上次电台」。保留音量和静音状态。
- 仅主显示器播放；同一用户的另一个 NEXUS 窗口已播放时，提示先停止，避免叠音。Windows 小预览不播放。
- 目录离线时显示带日期的缓存；音频仍需联网。连接失败可重试或换台。
- 仅列出 HTTPS 音源；支持设备可解码的 MP3/AAC 和 HLS。第三方广播可能有广告、主持、地区限制或临时中断。

没有下载或附带音乐文件。电台目录、点击统计和广播流只在使用电台时访问相关服务。API 参考：https://docs.radio-browser.info/

## 交互与屏幕适配

| 操作 | 效果 |
|---|---|
| 移动鼠标 / 手指 | 局部引力扰动 |
| 按住再释放 | 聚拢星尘，释放能量波 |
| 拖动 / 触摸滑动 | 旋转观察角度 |
| 1 / 2 / 3 | 星核 / 星环 / 时空之门 |
| 空格 | 暂停或继续演化 |
| H | 隐藏或显示控制界面 |
| F | 窗口体验版切换全屏 |
| M | 静音或取消静音 |
| ? | 操作指南 |
| Esc | 关闭弹窗、退出全屏或退出屏保 |

引力、速度、光谱、画质和自动漫游在本机保存。自动漫游每 75 秒切换形态。精细模式最多 30,000 个动态粒子，节能模式 16,000 个并关闭辉光；自动画质持续低帧率时降低负载。窗口隐藏时停止渲染，减少动态效果偏好默认暂停，可手动继续。

画面按视口和像素比重新构图，控制区适配窄屏。已检查常规宽屏、4K、超宽屏、竖屏和 320px 窄屏；多台物理显示器及不同显卡仍需在对应硬件验证。Windows 配置入口 /c、全屏 /s 和嵌入预览 /p HWND 均支持。

## 开发与验证

所有命令在本项目目录执行：

    npm.cmd ci
    npm.cmd run build
    npm.cmd run dev

另一个终端运行网页验证：

    npm.cmd test
    node tests/radio.cjs

Windows 原生验证：

    powershell -NoProfile -ExecutionPolicy Bypass -File tests/native.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tests/tray.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tests/settings.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tests/installer.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tests/native-audio.ps1
    dist/Nexus.exe --radio-smoke

构建使用 Windows 自带 .NET Framework C# 编译器；首次构建下载固定版本 WebView2 SDK。前端依赖本地打包，许可证在 licenses。安装与设置验证使用独立注册表分支，不更改实际桌面设置；电台验证静音进行。

生成干净发布包：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1。发布脚本使用文件白名单，排除测试日志、截图和浏览器测试配置。

包内复验：powershell -NoProfile -ExecutionPolicy Bypass -File tests/release.ps1。检查归档清单与版本，解压后启动真实 Windows 程序验证渲染。

源码：web 为粒子/电台界面，src 为 Windows 宿主，scripts 为构建/安装/打包，tests 为验证。更新说明见 RELEASE-NOTES.md。程序不启用麦克风或摄像头。
