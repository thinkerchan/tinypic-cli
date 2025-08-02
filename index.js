#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const glob = require('glob');
const chalk = require('chalk');
const argv = require('minimist')(process.argv.slice(2));
const { name, version } = require('./package.json');

const CONFIG = {
  API: 'https://tinyjpg.com/backend/opt/shrink',
  IMG_REGEXP: /\.(gif|jpg|jpeg|png|GIF|JPG|PNG)$/,
  GLOB_SUFFIX: '/*.+(png|jpg|jpeg|PNG|JPG|JPEG)',
  BATCH_SIZE: 5,
  BATCH_DELAY: 5 * 1000,
  REQUEST_TIMEOUT: 15 * 1000,
  FAILED_FILES_PATH: path.join(process.cwd(), '.tinypic-failed.json'),
  HEADERS: {
    "referer": "https://tinyjpg.com/",
    "user-agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_${Math.floor(Math.random() * 10)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0`,
    "x-forwarded-for": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    "x-real-ip": `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
  }
};

// 工具函数
const utils = {
  exists: (path) => fs.existsSync(path),
  getKb: (bytes) => (bytes / 1024).toFixed(1) + 'k',
  getFileSize: (file) => fs.statSync(file).size,
  isDirectory: (path) => utils.exists(path) && fs.statSync(path).isDirectory(),
  chunkArray: (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
    },
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  // 倒计时功能
  countdown: async (seconds) => {
    return new Promise((resolve) => {
      let remaining = seconds;
      const timer = setInterval(() => {
        process.stdout.write(`\r${chalk.gray(`⏳ wait ${remaining} seconds before next batch...`)}`);
        remaining--;

        if (remaining < 0) {
          clearInterval(timer);
          process.stdout.write('\r' + ' '.repeat(50) + '\r'); // 清除倒计时行
          resolve();
        }
      }, 1000);
    });
  },
  // 保存失败文件列表
  saveFailedFiles: (failedFiles) => {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        files: failedFiles
      };
      fs.writeFileSync(CONFIG.FAILED_FILES_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not save failed files list: ${error.message}`));
    }
  },
  // 读取失败文件列表
  loadFailedFiles: () => {
    try {
      if (!utils.exists(CONFIG.FAILED_FILES_PATH)) {
        return null;
      }
      const data = JSON.parse(fs.readFileSync(CONFIG.FAILED_FILES_PATH, 'utf8'));
      return data.files || [];
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not load failed files list: ${error.message}`));
      return null;
    }
  },
  // 清除失败文件列表
  clearFailedFiles: () => {
    try {
      if (utils.exists(CONFIG.FAILED_FILES_PATH)) {
        fs.unlinkSync(CONFIG.FAILED_FILES_PATH);
      }
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not clear failed files list: ${error.message}`));
    }
  }
};

// 文件收集器
class FileCollector {
  constructor(recursive = false) {
    this.recursive = recursive;
  }

  collect() {
    const inputFiles = this._getInputFiles();
    const imageFiles = this._extractImageFiles(inputFiles);
    return [...new Set(imageFiles)]; // 去重
  }

  _getInputFiles() {
    if (!argv._.length) return fs.readdirSync('./');

    if (argv._.length === 1) {
      const input = argv._[0];
      if (input === '.' || input === './') return fs.readdirSync('./');
      if (utils.isDirectory(input)) return { directory: input };
      return [input];
    }

    return argv._;
  }

  _extractImageFiles(files) {
    if (files.directory) {
      return this._collectFromDirectory(files.directory);
    }

    const imageFiles = [];
    const fileArray = Array.isArray(files) ? files : [files];

    fileArray.forEach(file => {
      if (this.recursive && utils.exists(file) && utils.isDirectory(file)) {
        imageFiles.push(...this._collectRecursively(file));
      } else if (this._isImageFile(file)) {
        imageFiles.push(...this._validateAndAdd(file));
      }
    });

    return imageFiles;
  }

  _collectFromDirectory(dir) {
    const dirPath = dir.endsWith('/') ? dir : dir + '/';
    return fs.readdirSync(dirPath)
      .filter(file => this._isImageFile(file))
      .map(file => dirPath + file)
      .filter(file => utils.exists(file));
  }

  _collectRecursively(dir) {
    return glob.sync(dir + '/**' + CONFIG.GLOB_SUFFIX);
  }

  _isImageFile(file) {
    return CONFIG.IMG_REGEXP.test(file);
  }

  _validateAndAdd(file) {
    if (utils.exists(file)) {
      return [file];
    } else {
      console.log(chalk.bold.red(`✗ ${file} does not exist!`));
      return [];
    }
  }
}

// 图片压缩器
class ImageCompressor {
  async compressFile(file) {
    const originalSize = utils.getFileSize(file);
    const delay = Math.random() * 1000;

    await utils.sleep(delay);

    try {
      const compressedData = await this._uploadForCompression(file);
      if (!compressedData.output?.url) {
        throw new Error(compressedData.message || 'No compressed output received');
      }

      const { size: compressedSize, url } = compressedData.output;
      const savings = originalSize - compressedSize;
      const percentage = (savings / originalSize * 100);

      if (percentage < 1) {
        console.log(chalk.yellow(`✗ Couldn't compress \`${file}\` any further`));
        return { success: true, file, skipped: true };
      }

      await this._downloadAndSave(url, file);
      console.log(chalk.green(`✓ Saved ${utils.getKb(savings)} (${percentage.toFixed(2)}%) for \`${chalk.bold(file)}\``));
      return { success: true, file };

    } catch (error) {
      console.log(chalk.red(`✗ Failed to compress \`${file}\`: ${error.message}`));
      return { success: false, file, error: error.message };
    }
  }

  async _uploadForCompression(file) {
    const fileStream = fs.createReadStream(file);
    const response = await axios.post(CONFIG.API, fileStream, {
      headers: CONFIG.HEADERS,
      responseType: 'json',
      timeout: CONFIG.REQUEST_TIMEOUT,
    });
    return response.data;
  }

  async _downloadAndSave(url, file) {
    const response = await axios.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(file);

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('close', resolve);
      writer.on('error', reject);
    });
  }
}

// 批量处理器
class BatchProcessor {
  constructor() {
    this.compressor = new ImageCompressor();
    this.failedFiles = [];
    this.skippedFiles = [];
  }

  async process(imageFiles) {
    if (imageFiles.length === 0) {
      console.log(chalk.bold.red('✗ No images found.'));
      return;
    }

    this._printProcessingInfo(imageFiles.length);

    const batches = utils.chunkArray(imageFiles, CONFIG.BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      await this._processBatch(batches[i], i + 1, batches.length);

      if (i < batches.length - 1) {
        const delaySeconds = Math.ceil(CONFIG.BATCH_DELAY / 1000);
        await utils.countdown(delaySeconds);
      }
    }

    this._printFinalSummary(imageFiles.length);
  }

  _printProcessingInfo(totalImages) {
    console.log(chalk.bold.green(`✓ Found ${totalImages} image${totalImages === 1 ? '' : 's'}`));
    console.log(chalk.bold.yellow(`Check API ${CONFIG.API} if it does not work`));

    const totalBatches = Math.ceil(totalImages / CONFIG.BATCH_SIZE);
    console.log(chalk.bold.blue(`📋 Images will be processed in ${totalBatches} batch${totalBatches === 1 ? '' : 'es'} (max ${CONFIG.BATCH_SIZE} images per batch)`));
    console.log(chalk.bold('Processing...'));
  }

    async _processBatch(batch, batchIndex, totalBatches) {
    console.log(chalk.cyan(`\n📦 Processing batch ${batchIndex}/${totalBatches} (${batch.length} images)...`));

    const results = await Promise.all(batch.map(file => this.compressor.compressFile(file)));

    // 收集失败和跳过的文件
    results.forEach(result => {
      if (!result.success) {
        this.failedFiles.push({ file: result.file, error: result.error });
      } else if (result.skipped) {
        this.skippedFiles.push(result.file);
      }
    });

    console.log(chalk.green(`✅ Batch ${batchIndex}/${totalBatches} completed!`));
  }

    _printFinalSummary(totalFiles) {
    const successCount = totalFiles - this.failedFiles.length;
    const skippedCount = this.skippedFiles.length;
    const failedCount = this.failedFiles.length;

    console.log(chalk.bold.green('\n🎉 All batches completed!'));
    console.log(chalk.bold.blue(`📊 Summary: ${successCount} successful, ${skippedCount} skipped, ${failedCount} failed`));

    if (this.skippedFiles.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Skipped files (couldn't compress further):`));
      this.skippedFiles.forEach(file => {
        console.log(chalk.yellow(`   • ${file}`));
      });
    }

    if (this.failedFiles.length > 0) {
      console.log(chalk.red(`\n❌ Failed files:`));
      this.failedFiles.forEach(({ file, error }) => {
        console.log(chalk.red(`   • ${file} - ${error}`));
      });

      // 保存失败文件列表
      utils.saveFailedFiles(this.failedFiles);
      console.log(chalk.cyan(`\n💡 Tip: Run ${chalk.bold('tiny failed')} to retry failed files`));
    } else {
      // 如果没有失败文件，清除之前保存的失败文件列表
      utils.clearFailedFiles();
    }
  }

  // 处理失败文件的静态方法
  static async processFailedFiles() {
    const failedFiles = utils.loadFailedFiles();

    if (!failedFiles || failedFiles.length === 0) {
      console.log(chalk.yellow('📝 No failed files found to retry'));
      return;
    }

    console.log(chalk.blue(`📋 Found ${failedFiles.length} failed file${failedFiles.length === 1 ? '' : 's'} to retry:`));
    failedFiles.forEach(({ file }) => {
      console.log(chalk.gray(`   • ${file}`));
    });

    // 只处理文件名，重新压缩
    const fileNames = failedFiles.map(({ file }) => file);
    const processor = new BatchProcessor();
    await processor.process(fileNames);
  }
}

// 备份功能
function backupFiles() {
  console.log(chalk.green('Backing Up all your FILES...'));

  const curPath = process.cwd();
  const parentDir = path.resolve(curPath, '../');
  const folderName = path.basename(curPath);
  const backupPath = path.join(parentDir, '_' + folderName);

  fs.copy(curPath, backupPath, err => {
    if (err) {
      console.error(err);
    } else {
      console.log(chalk.yellow(`Done! The backup is in \`${backupPath}\` !`));
    }
  });
}

// 显示帮助信息
function showHelp() {
  const helpText = `
    Usage
    tiny <file or path>
    tiny -b       // backup all your images into \`_folder\`
    tiny failed   // retry failed files from last compression

    Example

    tiny      // current dir
    tiny .    // current dir
    tiny -r   // shrink images recursively

    tiny a.jpg
    tiny a.jpg b.jpg
    tiny img/test.jpg

    tiny folder
    tiny failed   // retry previously failed files
    `;
  console.log(chalk.green(helpText));
}

// 主程序
(async () => {
  // 检查是否是 failed 命令
  if (argv._.includes('failed')) {
    await BatchProcessor.processFailedFiles();
    return;
  }

  if (argv.b) {
    backupFiles();
    return;
  }

  if (argv.v) {
    console.log(name + ' version: ' + chalk.green(version));
    return;
  }

  if (argv.h) {
    showHelp();
    return;
  }

  // 压缩图片
  const collector = new FileCollector(argv.r);
  const imageFiles = collector.collect();

  const processor = new BatchProcessor();
  await processor.process(imageFiles);
})();
