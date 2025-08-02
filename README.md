# tinypic-cli

基于 TinyJPG API 的图片压缩命令行工具，支持批量处理、失败重试等功能。

## 安装

```bash
npm i -g tinypic-cli
```

## 功能特性

- 🚀 **批量压缩**：支持多种图片格式 (jpg, jpeg, png, gif)
- 📦 **分批处理**：每批处理5张图片，避免API压力过大
- ⏱️ **智能延迟**：批次间自动延迟，显示倒计时
- 🔄 **失败重试**：自动记录失败文件，支持重新处理
- 📊 **详细报告**：显示压缩统计和结果摘要
- 🔍 **递归搜索**：支持深度遍历子目录
- 💾 **备份功能**：处理前自动备份原文件
- 🎯 **智能过滤**：自动去重，跳过无法优化的文件

## 使用方法

### 基本用法

```bash
# 压缩当前目录所有图片
tiny

# 压缩当前目录（等同于上面）
tiny .

# 压缩指定文件
tiny image.jpg
tiny photo1.jpg photo2.png

# 压缩指定目录
tiny images/
```

### 高级用法

```bash
# 递归压缩所有子目录的图片
tiny -r
tiny -r images/

# 备份所有文件到父目录的 _folder 中
tiny -b

# 重新处理之前失败的文件
tiny failed

# 查看版本信息
tiny -v

# 查看帮助信息
tiny -h
```

## 命令选项

| 选项 | 说明 |
|------|------|
| `-r` | 递归处理子目录中的所有图片 |
| `-b` | 备份当前目录到父目录的 `_folder` 中 |
| `-v` | 显示版本信息 |
| `-h` | 显示帮助信息 |
| `failed` | 重新处理上次失败的文件 |

## 支持格式

- **图片格式**：JPG, JPEG, PNG, GIF
- **大小写不敏感**：支持 .jpg/.JPG, .png/.PNG 等

## 处理流程

1. **文件发现**：扫描指定路径，过滤图片文件
2. **分批处理**：每批最多5个文件，避免API限制
3. **智能延迟**：批次间等待5秒，显示倒计时
4. **结果统计**：显示成功、跳过、失败的文件统计
5. **失败记录**：自动保存失败文件列表到 `.tinypic-failed.json`

## 输出示例

```
✓ Found 12 images
Check API https://tinyjpg.com/backend/opt/shrink if it does not work
📋 Images will be processed in 3 batches (max 5 images per batch)
Processing...

📦 Processing batch 1/3 (5 images)...
✓ Saved 128.5k (45.2%) for `image1.jpg`
✓ Saved 89.3k (32.1%) for `image2.png`
✗ Couldn't compress `image3.jpg` any further
✗ Failed to compress `image4.png`: Connection timeout
✓ Saved 156.7k (38.9%) for `image5.jpg`
✅ Batch 1/3 completed!

⏳ wait 5 seconds before next batch...

📦 Processing batch 2/3 (5 images)...
...

🎉 All batches completed!
📊 Summary: 8 successful, 2 skipped, 2 failed

⚠️ Skipped files (couldn't compress further):
   • image3.jpg
   • image8.png

❌ Failed files:
   • image4.png - Connection timeout
   • image11.jpg - Invalid file format

💡 Tip: Run tiny failed to retry failed files
```

## 失败重试

当有文件压缩失败时，工具会自动保存失败列表。使用以下命令重新处理：

```bash
tiny failed
```

重试时会显示：

```
📋 Found 2 failed files to retry:
   • image4.png
   • image11.jpg

📦 Processing batch 1/1 (2 images)...
...
```

## 配置说明

工具内置以下配置：

- **API地址**：https://tinyjpg.com/backend/opt/shrink
- **批次大小**：5个文件/批
- **批次延迟**：5秒
- **请求超时**：15秒
- **失败文件**：保存到 `.tinypic-failed.json`

## 注意事项

1. **网络要求**：需要稳定的网络连接访问 TinyJPG API
2. **文件备份**：使用 `-b` 选项可在处理前备份文件
3. **API限制**：工具通过分批处理和延迟来避免API限制
4. **失败处理**：单个文件失败不会中断整个处理流程
5. **重复处理**：工具会自动去重，避免重复处理同一文件

## 故障排除

### 常见问题

**Q: 提示 "Connection timeout"**
A: 检查网络连接，或稍后重试失败的文件

**Q: 某些文件无法压缩**
A: 文件可能已经高度优化，这是正常现象

**Q: 批量处理中断**
A: 使用 `tiny failed` 重新处理失败的文件

### 错误代码

- **Connection timeout**: 网络连接超时
- **Invalid file format**: 文件格式不支持
- **No compressed output received**: API未返回压缩结果

## 开发者

基于 TinyJPG API 开发，使用 Node.js 构建。

## 许可证

MIT License