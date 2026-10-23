# OptiMark 相机照片水印工具

浏览器中的照片水印编辑与导出工具。网站入口为 `index.html`，无需构建。

## GitHub Pages

在仓库 **Settings → Pages → Build and deployment** 中设置：

- Source：**GitHub Actions**

仓库的 `.github/workflows/pages.yml` 使用 Node.js 24 版 Actions，在推送到 `main` 时自动发布。首次切换 Source 后，可在 **Actions → Deploy GitHub Pages → Run workflow** 手动启动一次。默认网址：

https://hkysxm.github.io/camera-whatmark/

GitHub Free 需要公开仓库；支持私有仓库 Pages 的付费套餐可保留仓库私有。仓库私有不代表 Pages 网站也私有，发布前请检查站点访问设置。

## 安装到手机（PWA）

使用 HTTPS 打开上方网站地址，首次联网加载后可安装到主屏幕：

- **Android / Chrome**：浏览器菜单 → **安装应用**或**添加到主屏幕**。
- **iPhone / iPad / Safari**：分享菜单 → **添加到主屏幕**；若出现“作为 Web App 打开”，保持开启。

安装后以独立窗口运行，也可继续使用浏览器。PWA 不生成 APK / IPA，不涉及应用商店发布。

页面和样式缓存完成后可离线启动，继续使用现有的照片导入、水印和导出功能。在线访问时读取最新页面；缓存更新不会强制刷新正在编辑的页面。

- 额外字体和 HEIC 解码器仅在联网加载且被缓存后可离线使用；未缓存的字体会使用系统回退字体。
- 照片、编辑状态和图片队列不会写入 PWA 缓存，关闭或重载应用前请先导出。系统清理网站数据后需重新联网建立缓存。
- iOS 上文件保存位置及下载交互由系统和浏览器决定。当前未提供系统分享接收、后台处理或原生相册接口。
- `file://` 直接打开 HTML 不启用 PWA；本地验证可使用下方的 localhost 服务。

## 使用与限制

- JPEG 可保存选定 EXIF，中文文字通过 XMP 保存。
- PNG / WebP 当前只导出图像，不保留元数据；不支持 HEIC 编码。
- RAW 使用内嵌预览或可解码图像，并显示实际可用像素，不提供完整 RAW 显影。
- Python 导出脚本依赖 Playwright + Chromium；字体需要在运行环境中可用。
- 照片处理在浏览器内执行；样式和字体使用外部服务。

修复详情见 [FIXES.md](FIXES.md)，测试记录见 [TEST-RESULTS.txt](TEST-RESULTS.txt)。
原始上传文件保留于 [backups/optimark_exif.original.html](backups/optimark_exif.original.html)。

## 本地运行

直接打开 `index.html`，或在仓库目录运行：

```sh
python3 -m http.server 8000
```
