#!/usr/bin/env node
const fs = require('fs');
const request = require('request');
const chalk = require('chalk');
const argv = require('minimist')(process.argv.slice(2));
const {name,version} = require('./package.json');

const Conf = {
  API:'https://tinypng.com/web/shrink',
  imgRexp:/\.(gif|jpg|jpeg|png|GIF|JPG|PNG)$/
}

// 请求头
const headers = {
  "referer": "https://tinypng.com/",
  "user-agent":'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36',
}

;(()=>{
  function getKb(byte) {
    return (byte / 1024).toFixed(1) + 'k'
  }

  function getSize(file){
    return getKb(fs.statSync(file).size)
  }

  function rawSize(file){
    return fs.statSync(file).size;
  }

  if (argv.v) {
    console.log(name + ' version: ' + chalk.green(version))
  }else if (argv.h) {
    let tips = `
      Usage
        tiny <file or path>

      Example
        tiny
        tiny .
        tiny a.jpg
        tiny a.jpg b.jpg
        tiny img/test.jpg
      `;
      console.log(chalk.green(tips));
  }else{
    let files, imgArr = [];
    if (argv._.length) {
      if (argv._.length==1 && argv._[0]=='.') {
        files = fs.readdirSync('./');
      }else{
        files =  argv._ ;
      }
    }else{
      files = fs.readdirSync('./');
    }

    // 1. 遍历
    files.forEach((item,index)=>{
      if((Conf.imgRexp).test(item)){ // 检查后缀(注意要过滤掉x.jpg|png类似这样的文件夹)
        if (fs.existsSync(item)) { // 检查是否存在
          imgArr.push(item)
        }else{
          console.log(chalk.bold.red(`\u2718 ${item} does not exist!`))
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
})();