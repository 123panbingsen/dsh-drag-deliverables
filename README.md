# dsh-drag-deliverables

把 DeepSeek Harness 对话里的**交付文件卡片拖到桌面、文件夹或任何应用**（WPS、浏览器、微信…）。

DSH 桌面端是 Electron，网页那套 `dataTransfer.setData("DownloadURL", ...)` **在 Electron 里没有实现**，
所以在页面里怎么拖都拖不出文件。Electron 官方唯一支持的方式是主进程的
[`webContents.startDrag()`](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop)，
它必须从主进程调用，因此需要给桌面壳打一个很小的补丁（约 40 行），本仓库把它做成了可一键安装的形式。

## 组成

| 部分 | 作用 |
| --- | --- |
| `index.js` / `client.js` | DSH 插件：在交付卡片右侧加一个拖拽图标；无原生桥时退化为「点一下选文件夹保存副本」 |
| `patch/main.patch.js` | 追加到 `resources\app\lib\main.js`：接收 IPC 并调用 `startDrag` |
| `patch/preload.patch.cjs` | 追加到 `resources\app\lib\preload-app.cjs`：暴露 `window.dshDragDeliverable` |
| `tools/extract-asar.mjs` | 把 `app.asar` 解包成 `resources\app`（零依赖，直接读 asar 格式） |
| `shell/install.ps1` | 安装器：关闭 DSH → 解包 → 打补丁 → 换包 → 重启 → 失败自动回滚 |
| `shell/uninstall.ps1` | 卸载器：还原原版 `app.asar` 并重启 |

## 安装

1. 把这个仓库下载到本地；
2. 双击 `shell\install.bat`。

安装器会自动找到 DSH、关闭它、解包 `app.asar`（约 400 MB，10 秒左右）、打补丁、重启。
**失败会自动回滚**，不会让 DSH 起不来。

日志：`%TEMP%\dsh-drag-install.log`

## 使用

重启后，交付卡片右侧会出现一个下载图标（在 WPS 按钮左边）：

- **按住拖动** → 拖到桌面 / 资源管理器 / WPS 等应用，文件直接落地；
- 未打 shell 补丁时（例如在浏览器里打开 Web GUI）→ 点击图标弹出文件夹选择框，由 Host 复制一份过去，重名自动加 `(2)`。

## 卸载 / 更新

双击 `shell\uninstall.bat` 还原原版。

DSH 官方更新会重装 `app.asar`，补丁随之失效；重新双击 `install.bat` 即可。

> `app.asar.dragbak` 是原版备份，**不要手动删除**；删了只能重装 DSH 才能恢复。

## 已验证

在隔离副本里实测（不是推测）：

- **干净安装**（仅有 `app.asar`）：安装器自动解包 18309 个文件 → 打补丁 → 换包 → 启动成功，`window.dshDragDeliverable` 为 `native: true`；
- 未打补丁时该桥为 `undefined`；
- 交付卡片上确实渲染出拖拽图标，`draggable: true` 且未被禁用；
- 以真实 PDF 路径调用 `start()` 不报错，主进程无错误日志。

## 原理与限制

- 页面无法主动发起原生拖拽，只能由 `dragstart` 里的用户手势经 preload → IPC → 主进程 `startDrag` 触发；
- 拖拽预览图使用内嵌 48×48 图标。早期版本直接用 1024×1024 的 `icon.png`，会出现一块巨大的虚影，看起来像「没有预览图」；
- 仅支持 Windows（脚本与路径处理按 Windows 编写）。macOS/Linux 上的 DSH 若结构相同，可参照 `install.ps1` 改写。

## 许可

MIT
