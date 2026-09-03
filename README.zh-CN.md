<div align="center">

<img src="src/static/icon.svg" alt="Safari Dark Mode 图标" width="96" height="96">

# Safari Dark Mode

一款专为 Safari 26 打造的深色模式扩展：将浅色网站转换为深色，同时保留网站原生深色主题。

![Safari 26+](https://img.shields.io/badge/Safari-26%2B-006CFF?logo=safari&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![测试](https://img.shields.io/badge/tests-36%20passing-brightgreen)

[English](README.md) · **简体中文**

</div>

Safari Dark Mode 使用 Dark Reader 的动态渲染引擎转换普通 HTTP(S) 页面。自动模式会检测并保留网站的原生深色主题；你也可以为每个网站关闭或强制启用深色模式。

<p align="center">
  每天晚上打开safari的我就这样：
  <br><br>
  <img src="https://i.imgflip.com/5ajbfn.png" alt="meme" width="200" height="200">
</p>

## 功能

- 自动检测网站原生深色主题
- 按完整主机名设置自动、关闭或强制深色模式
- 调整亮度、对比度和棕褐色滤镜
- 自动适应单页应用和网站主题变化
- 通过受限资源代理处理跨域样式表
- 设置仅保存在本地，不含分析或遥测
- 使用 Dark Reader v4.9.129 引擎及其网站适配规则

## 环境要求

- macOS 与 Safari 26 或更高版本
- Node.js 22 或更高版本，以及 npm
- 已启用 Safari 临时网页扩展加载功能
- 如需签名并长期安装，则需要 Xcode 26 或更高版本

## 开始使用

```sh
git clone https://github.com/mikotokuroko/safari-dark-mode.git
cd safari-dark-mode
npm install
npm run check
```

构建后的扩展位于 `dist/extension/`。

## 在 Safari 中安装

### 临时开发安装

1. 如果 Safari 没有显示 **开发** 菜单，请先将其启用。
2. 允许未签名扩展，并打开 Safari 的临时网页扩展加载功能。
3. 选择 `dist/extension/manifest.json`；如果 Safari 要求选择文件夹，则选择 `dist/extension/`。
4. 打开 **Safari → 设置 → 网站 → 扩展 → Safari Dark Mode**。
5. 将 **所有网站** 设置为 **允许**。
6. 使用工具栏按钮选择自动、关闭或强制深色模式，并调整主题参数。

> [!IMPORTANT]
> 每次重新构建后都要重新加载临时扩展。Safari 可能会为它分配新身份并重置网站权限；如果扩展显示无法访问网站，请重新检查 **所有网站** 权限。

### 已签名的 macOS App

Safari 退出时会关闭 **允许未签名扩展**。如需长期保留扩展，请将其打包成已签名的 macOS Safari Web Extension App：

1. 安装并打开完整版本的 Xcode，然后选择其开发工具：

   ```sh
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -runFirstLaunch
   ```

2. 构建扩展并生成 Xcode 项目：

   ```sh
   npm run build

   xcrun safari-web-extension-packager \
     "$PWD/dist/extension" \
     --project-location "$HOME/Documents/Safari-Dark-Mode-Xcode" \
     --app-name "Safari Dark Mode" \
     --bundle-identifier "com.mikotokuroko.safaridarkmode" \
     --swift \
     --macos-only \
     --copy-resources
   ```

3. 在 Xcode 中点击蓝色项目图标。在 **TARGETS** 下，分别打开 **Safari Dark Mode**（容器 App）和 **Safari Dark Mode Extension**（浏览器扩展）的 **Signing & Capabilities**，并为两者选择同一个开发团队。
4. 将容器 App 的 Bundle Identifier 设置为 `com.mikotokuroko.safaridarkmode`，扩展则保留为 `com.mikotokuroko.safaridarkmode.Extension`。扩展标识符必须以完整的 App 标识符开头。
5. 选择 **Product → Clean Build Folder**，选择 **Safari Dark Mode** App scheme 和 **My Mac**，然后点击 **Run**。
6. 在 Safari 中启用扩展，并允许它访问 **所有网站**。

## 开发

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 构建未打包扩展 |
| `npm run check` | 运行代码检查、类型检查、构建和全部测试 |
| `npm test` | 运行 Vitest 测试 |
| `npm run fixtures` | 在 4173 和 4174 端口运行本地兼容性测试页面 |

提交的锁文件将 Dark Reader v4.9.129 标签固定到提交 `c2a707302a39b8047543712e9c582bac07835d34`。

## 项目结构

```text
src/background/   设置、消息处理和受限资源请求
src/content/      主题检测、策略、Dark Reader 集成和动态更新
src/popup/        工具栏控制界面
src/onboarding/   首次运行的网站访问权限说明
src/shared/       数据协议、验证、策略和浏览器辅助函数
src/vendor/       固定版本的 Dark Reader 引擎和网站配置
fixtures/         本地浅色、深色、动态、框架和资源测试页面
tests/            单元、协议、页面、代理和清单测试
qa/               Safari 验收报告
```

## 隐私与安全

扩展仅请求 `storage`、`tabs` 和 HTTP(S) 网站访问权限。所有设置都保存在 Safari 的本地扩展存储中。资源代理只接受 HTTP(S) GET 请求，不发送凭据或来源信息，超时时间为 10 秒，并拒绝超过 8 MiB 的响应。

本扩展不包含分析、遥测、远程代码、原生消息、外部消息、本地文件访问或 PDF 支持。

## 当前范围

版本 0.1.0 面向 macOS Safari 26 及以上版本。目前不包括 iPhone 和 iPad、旧版 Safari、PDF、本地文件、定时计划、同步、导入与导出、键盘快捷键、预生成的 Xcode 容器、TestFlight 和 App Store 发布。

Dark Reader 的来源信息请参阅 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，自动与浏览器实测状态请参阅 [qa/SAFARI_QA.md](qa/SAFARI_QA.md)。
