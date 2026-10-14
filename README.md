# Design Asset Board

个人本地设计素材整理工具。用于保存图片素材、软件内文件夹分类、高清查看、无限画板整理参考图，并支持基础备注。

## 功能

- 复制粘贴图片到软件内素材库
- 软件内文件夹分类，支持多层级文件夹
- 图片高清查看和右侧信息面板
- 无限画板，支持图片移动、缩放、旋转、复制粘贴、拖出悬浮窗口
- 回收站和主题设置
- 本地保存，不依赖云同步

## 启动

普通用户可从 [Releases](https://github.com/wuhuan832-jpg/design-asset-board/releases/latest) 下载 Windows 安装包。

开发者可以从源码启动：

```bash
npm install
npm start
```

## 本地数据

软件不使用共享数据库，也不会把素材上传到 GitHub。正式版会将每位用户的数据独立保存在其电脑的 Electron 用户数据目录中；开发版使用项目内的 `.user-data/`。

以下内容均已被 Git 忽略，不会提交到 GitHub，也不会包含在安装包中：

- `.user-data/`
- `library/`
- `node_modules/`
- `dist/` 和其他构建产物
- Electron 安装包 `.zip`

因此，仓库公开后，其他用户看不到作者现有的素材、文件夹、画板、笔记和设置；其他用户创建的数据也只存在于他们自己的电脑上，不会影响作者的数据。

## 开源许可

源代码使用 [MIT License](LICENSE)。

