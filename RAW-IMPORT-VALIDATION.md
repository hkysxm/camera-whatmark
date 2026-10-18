# RAW / JPEG / PNG / HEIC 读取修复与验证

## 原因及修改范围

原 RAW 提取器会跳过任意非标记字节继续扫描，未严格区分 JPEG 头部和熵编码区，也把浏览器不支持的无损 JPEG 帧当作候选。它按声明的像素面积只选一个候选，解码失败后没有回退。

在 Panasonic GF7 等真实样本中，压缩数据被误读为 18616×15342 等巨大 JPEG，覆盖了文件内有效的 1920×1440 预览；Nikon、OM System、Pentax 和 Canon CR3 样本也复现了误选失败。

修改仅涉及 index.html 的读取链路：
- 严格验证 JPEG 标记、段长度、量化表、扫描区和 8-bit 支持类型，排除伪候选及无损 RAW JPEG 帧。
- 按像素排序逐个解码候选；失败后尝试下一个有效预览。
- TIFF/DNG 后备只选择可显示图像，避免把 CFA 传感器阵列直接当作 RGB。
- 优先读取原文件元数据，再用内嵌 JPEG 补充缺失字段；补充 CR3 的 CMT1/CMT2/CMT4 TIFF 元数据读取。
- 当嵌入 JPEG 没有方向信息时，按外层 RAW 的方向校正，避免竖拍预览横置；已有 JPEG 方向不重复旋转。
- HEIC/HEIF 优先原生解码，失败后按需加载固定版本 heic-to 1.6.6 / libheif，并以 SHA-384 校验。照片在浏览器本地解码，不上传至转换服务。

未改动水印渲染、导出、布局、拖动或队列管理逻辑；原始 HTML 备份未改动。

## 关于用户遇到的 ARW

没有收到用户的故障 ARW 原文件。以下六款 Sony 的公开 ARW 样本，在修复前后均可导入，因此不能声称已复现用户那一份 ARW 的具体故障。已修复的是独立确认的通用 RAW 误识别缺陷；如果用户文件仍失败，需要原文件继续定位。程序仍使用 RAW 的可解码预览，不是完整 RAW 显影引擎。

## 实测结果

Chromium 实际执行每个样本的导入、加水印、JPEG 导出及 EXIF/XMP 回读校验；随后用独立 Pillow 再次解码导出文件并核对尺寸。21/21 通过。尺寸为实际可用且已按方向显示的像素，不冒充 RAW 全分辨率。

| 样本 | 可用像素 | JPEG 导出像素 | 结果 |
| --- | --- | --- | --- |
| Panasonic DMC-GF7.rw2 | 1920×1440 | 1920×1440 | 通过 |
| Fujifilm X-E1.raf | 1920×1280 | 1920×1280 | 通过 |
| Pentax K-1 Mark II.pef | 7360×4912 | 2048×1367 | 通过 |
| OM Sytem OM-1.orf | 3200×2400 | 2048×1536 | 通过 |
| Nikon D810.nef | 4912×7360 | 1367×2048 | 通过 |
| Leica T (Typ 701).dng | 720×480 | 720×480 | 通过 |
| DJI Phantom 4 (1).dng | 960×720 | 960×720 | 通过 |
| Canon EOS R3.cr3 | 6000×4000 | 2048×1365 | 通过 |
| Canon EOS 70D.cr2 | 5472×3648 | 2048×1365 | 通过 |
| Sony ILCE-7M4 (A7M4).ARW | 7008×4672 | 2048×1365 | 通过 |
| Sony ILCE-7M3 (A7M3).arw | 1080×1616 | 1080×1616 | 通过 |
| Sony DSLR-A500.arw | 1616×1080 | 1616×1080 | 通过 |
| heic-iphone.heic | 4032×3024 | 2048×1536 | 通过 |
| heic-single.heic | 1440×960 | 1440×960 | 通过 |
| fixed.jpg | 600×1008 | 600×1008 | 通过 |
| fixed.png | 1219×2048 | 1219×2048 | 通过 |
| Sony NEX-7.arw | 1616×1080 | 1616×1080 | 通过 |
| Sony NEX-5N.arw | 1616×1080 | 1616×1080 | 通过 |
| Sony ILCE-5000 (A5000).arw | 1616×1080 | 1616×1080 | 通过 |
| canon-dslr.jpg | 5184×3456 | 2048×1365 | 通过 |
| photo.png | 5184×3456 | 2048×1365 | 通过 |

其中 JPEG/PNG 包括原有回归图片和真实 Canon JPEG；photo.png 是由该真实照片转换的 PNG。两份 HEIC 包括 iPhone XS Max 照片。无元数据的图片保持未知字段为空。

追加测试通过：
- 缺少 JPEG 量化表的伪大尺寸候选不再遮蔽有效预览。
- 模拟第一张实际 JPEG 候选解码失败后，能使用第二张实际 JPEG。
- 损坏 RAW 明确失败，不替换成示例照片。
- JPEG/PNG/RAW 不加载 HEIC 解码器；HEIF 加载失败后可重试成功。
- RAW 方向 8 的旋转位置及尺寸正确。
- Deflate 压缩 TIFF 解码通过。
- 既有水印拖动、单张删除、清空队列、重新导入导出回归通过。

## 样本来源与边界

- [metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images)，提交 `651ad0e67aa8d43d358ad05f9bc07b52d8b9ac6e`，使用 arw、cr2、cr3、nef、orf、pef、raf、rw2、dng 目录下表列真实文件。
- [exifr fixtures](https://github.com/MikeKovarik/exifr/tree/6cbf6e921688faf7723e1f2e0b9e672d1f0aa21c/test/fixtures)，HEIC 与 Canon JPEG。
- [heic-to 1.6.6](https://www.npmjs.com/package/heic-to/v/1.6.6)；[源码及 LGPL-3.0 许可](https://github.com/hoppergee/heic-to)。解码器首次使用需要访问 cdn.jsdelivr.net，失败会明确提示并允许重试。

覆盖 Sony、Canon、Nikon、Fujifilm、OM System、Panasonic、Pentax、Leica、DJI 的代表样本，不等于覆盖每一家相机的所有机型、压缩模式和固件版本。Hasselblad 3FR、Phase One IIQ 等没有真实样本验证。没有内嵌可解码预览的 RAW 仍可能需要先用相机软件转换。HEIC 本次是导入支持，未增加 HEIC 导出。未进行 iOS/Android 实机测试。
