#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const request = require('request');
const glob = require('glob');
const chalk = require('chalk');
const argv = require('minimist')(process.argv.slice(2));
const {name,version} = require('./package.json');

const Conf = {
  API:'https://tinypng.com/web/shrink',
  imgRexp:/\.(gif|jpg|jpeg|png|GIF|JPG|PNG)$/,
  suffix:'/*.+(png|jpg|jpeg|PNG|JPG|JPEG)'
}

// 请求头
const headers = {
  "referer": "https://tinypng.com/",
  "user-agent":'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36',
}


;(()=>{
  function exists(path){
     return fs.existsSync(path) || path.existsSync(path);
}

  function getKb(byte) {
    return (byte / 1024).toFixed(1) + 'k'
  }

  function getSize(file){
    return getKb(fs.statSync(file).size)
  }

  function rawSize(file){
    return fs.statSync(file).size;
  }

  function isDir(path){
    return exists(path) && fs.statSync(path).isDirectory();
  }

  function compress(r){

    let files,
      imgArr = [],
      _path = './', //默认路径
      _deep = false   //进入子目录
      ;

    //  判断文件夹
    if (argv._.length) {
      if (argv._.length==1) {
        if (argv._[0]=='.') { // "tiny ."
          files = fs.readdirSync(_path);
        }else{
          if(isDir(argv._[0])){ // "tiny folder"
            _path = argv._[0]+'/';
            _deep = true;
            files = fs.readdirSync(_path);
          }else{
            files =  argv._ ; // "tiny one.jpg"
          }
        }
      }else{
        files =  argv._ ; //  "tiny 1.jpg 2.jpg ..."
      }
    }else{
      files = fs.readdirSync(_path); // exec "tiny"
    }


    // 1. 遍历
    files.forEach((item,index)=>{
      if (r) {  // tiny -r
        if (fs.existsSync(item)) {
          if (fs.lstatSync(item).isDirectory()) {
            let pic = glob.sync( item + '/**'  + Conf.suffix);
            imgArr = imgArr.concat(pic);
          }else{
            if((Conf.imgRexp).test(item)){
              imgArr.push(item)
            }
            // incaseof some file being not an image
            // else{
              // console.log(chalk.bold.red(`\u2718 ${item} does not exist!`))
            // }
          }
        }
      }else{
        if((Conf.imgRexp).test(item)){ // 检查后缀(注意要过滤掉x.jpg|png类似这样的文件夹)
          item = _deep? (_path+item) : item ; //文件夹路径要修改
          if (fs.existsSync(item)) { // 检查是否存在
            imgArr.push(item)
          }else{
            console.log(chalk.bold.red(`\u2718 ${item} does not exist!`))
          }
        }
      }
    })

    // 2. 去重(避免用户手动输入文件名时候重复)
    imgArr = Array.from(new Set(imgArr));

    let len = imgArr.length;
    if (len==0) {
      console.log(chalk.bold.red('\u2718 No images found.'));
    }else{
      console.log(chalk.bold.green('\u2714 Found ' + len + ' image' + (len === 1 ? '' : 's')));
      console.log(chalk.bold('Processing...'));

      imgArr.forEach((file)=>{
        let _size = getSize(file);
        let _rawSize = rawSize(file);
        request({
          method: 'POST',
          url: Conf.API,
          headers: headers,
          body: fs.createReadStream(file),  //反复压缩的过程中, 有可能没下载完, 文件大小为0, 会导致报错
          encoding: 'utf8'
        },(err,res,body)=>{ //res.body == body
          try {
            body = JSON.parse(body);
          } catch(e) {
            console.log(chalk.red('\u2718 Not a valid JSON response for `' + file + '`'));
            return;
          }

          // 观察接口返回的数据, 只要存在output.url就说明压缩成功
          let op = body.output;
          if (op&&op.url) {

            let diff = _rawSize-op.size;
            let percent = diff/_rawSize*100;

            if (percent<1) {
              console.log(chalk.yellow('\u2718 Couldn’t compress `'+file+'` any further'));
            }else{
              request(op.url).pipe(fs.createWriteStream(file)).on('close', () => {
                console.log(chalk.green('\u2714 Saved '+getKb(diff)+' ('+percent.toFixed(2)+'%) for `'+chalk.bold(file)+'`'));
              })
            }
          }else{
            console.log(chalk.red('\u2718  Something bad happend: '+body.message));
          }
        })
      })
    }

  }

  if (argv.b) {
    console.log(chalk.green('正在备份图片...'));

    let curPath = process.cwd();
    let fatherFolder = path.resolve(curPath,'../'); //curPath对应当前包所在的目录
    let _targetFolder = curPath.split(fatherFolder+'/')[1];
    let targetFolder = fatherFolder+'/_'+_targetFolder;

    fs.copy(curPath, targetFolder, err => {
      if (err) return console.error(err)
      console.log(chalk.green('备份完毕! 图片备份在 `'+targetFolder+'` 中!'));
    })
    return;
  }

  if (argv.v) {
    console.log(name + ' version: ' + chalk.green(version))
  }else if (argv.h) {
    let tips = `
      Usage
        tiny <file or path>
        tiny -b   // backup all your images into \`_folder\`

      Example

        tiny      // current dir
        tiny .    // current dir
        tiny -r   // shrink images recursively

        tiny a.jpg
        tiny a.jpg b.jpg
        tiny img/test.jpg

        tiny folder
      `;
      console.log(chalk.green(tips));
  }else{
    compress(argv.r);
  }
})();