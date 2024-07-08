import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import common from '../../lib/common/common.js';
import { Group, segment } from 'oicq';
import crypto from 'crypto'
import { pipeline } from 'stream'
import { promisify } from 'util'

const root = path.resolve();
const settings = {
    //图片文件存放路径
    image_path: path.join(root, "/plugins/gachaimage/resource/image"),
}

const Names = {
	'草神': 'nahida', '纳西妲': 'nahida', '小草神': 'nahida', '小草王': 'nahida',
	'胡桃': 'hutao',
	'绫华': 'ayaka',
	'万叶': 'kazuha',
	'刻晴': 'keqing',
	'可莉': 'klee',
	'心海': 'kokomi',
	'妮露': 'nilou',
	'随机': 'other',
	'派蒙': 'paimon',
	'公子': 'tartaglia',
	'温迪': 'venti',
	'魈':   'xiao',
	'神子': 'yae',
	'钟离': 'zhongli',
	'瑶瑶': 'yaoyao',
	'珐露珊': 'faruzan',
	'荧': 'lumine',
	'锅巴': 'guoba',
	'雷电将军': 'raiden',
	'赛诺': 'cyno',
	'随机': 'other',
}

export class gachaimage extends plugin {
  constructor () {
    super({
      name: '精选好图',
      dsc: '收集的精选好图',
      event: 'message',
      priority: 5000,
      rule: [
        {
          /** download图片抽卡 */
          reg: '^#好康的$',
          fnc: 'niceimageV1'
        },		
		{
			reg: '^#上传emoji$',
			fnc: 'uploadEmoji',
		},
        {
          /** 随机获得10个角色表情包 */
          reg: '^#.*表情包$',
          fnc: 'emoji'
        },
        {
          /** 表情包列表0-N */
          reg: '^#.*表情包(\\d)+$',
          fnc: 'emojiN'
        }
      ]
    })
  }
  
  async emojiN(e) {
	  let name2 = e.msg.replace('表情包', '').replace('#', '')
	  let r    = name2.match(/(\D+)(\d+)/)
	  if (!r) return
	  
	  let name = r[1]
	  let pos  = parseInt(r[2], 10)
	  if (!Names[name]) {
		  e.reply('哎呀 不存在这个表情包捏')
		  return
	  }
	  
	  let folder = 'emoji'
	  let faceFiles = this.getFilesList(folder, Names[name])
	  
	  if (pos <= 0 || pos > Math.ceil(faceFiles.length / 10)) return;
	  
	  faceFiles = faceFiles.slice(10 * (pos - 1), 10 * pos)
	  let title = name
	  this.sendFiles(e, title, faceFiles)
  }
  
  async emoji(e) {
	  let name = e.msg.replace('表情包', '').replace('#', '')
	  if (!Names[name]) {
		  e.reply('哎呀 不存在这个表情包捏')
		  return
	  }
	  
	  let folder = 'emoji'
	  let faceFiles = this.getFilesList(folder, Names[name])
	  
	  let randomFiles = this.getRandom(faceFiles, 10)
	  let title = name
	  
	  this.sendFiles(e, title, randomFiles)
  }
  
  async niceimageV1 (e) {
	  let name      = "download";
	  let qq        = e.user_id

	  let faceFiles = this.getFilesList(name, '3-star')
	  let randomFiles = this.getRandom(faceFiles, 10)
	  let title = '#好康的'
	  
	  let bufferValue = (await redis.get(`chudadi:${qq}:muyu`)) || 0
	  let b1 =  bufferValue >= 30 ? 150 : bufferValue * 5
	  let b2 =  Math.floor(Math.log(bufferValue) / Math.log(10) * 400)
	  
	  let test = Math.floor(Math.random() * 10000)
	  if (test - b1 < 50) {//出现5星
		faceFiles = this.getFilesList(name, '5-star')
		let randomFiles1 = this.getRandom(faceFiles, 1)
		randomFiles.unshift.apply(randomFiles, randomFiles1)
		title = '#好康的(五星)'
		logger.mark('niceimage', title)
	  } else if (test - b2 < 900) {//出现4星
		faceFiles = this.getFilesList(name, '4-star')
		let randomFiles1 = this.getRandom(faceFiles, 1)
		randomFiles.unshift.apply(randomFiles, randomFiles1)
		title = '#好康的(四星)'
		logger.mark('niceimage', title)
	  }
	  
	  randomFiles.splice(10)

	  this.sendFiles(e, title, randomFiles)
  }
  
  async sendFiles(e, title, randomFiles) {
	  let messages = []
	  randomFiles.forEach(v => {
		  let finalPath = v;
		  let bitMap = fs.readFileSync(finalPath);
		  let base64 = Buffer.from(bitMap, 'binary').toString('base64');
		  messages.push(segment.image(`base64://${base64}`))
	  })

	  let FM = await common.makeForwardMsg(e, messages, title)
	  try{
		  let ret = await e.reply(FM, false, {recallMsg: 0})
		  //logger.info('ret', ret)
		  if (ret === undefined) {
			  await e.reply('遭遇神秘力量...')
		  }
	  } catch (error) {
		  await e.reply('遭遇神秘力量...')
	  }
  }
  
  async uploadEmoji (e) {
	this.setContext('_upload_emoji_exec')
	await this.reply('请输入要上传的图片')
  }
  
  async _upload_emoji_exec() {
	  let pos = this.e.msg?.indexOf('结束') ?? -1
	  if (pos >= 0 && pos <= 1) {
			this.finish('_upload_emoji_exec')
			this.reply('上传完毕')

			return
	  }
	  
	  let counter = 0
	  
	  for (let m of this.e.message) {
		if (m.type == 'image') {
		    if (m) {
			  logger.mark(typeof m.file)
			  let shortname = this.cryptPwd(m.url)
			  let myresult = await this.saveImg(m.url, typeof m.file == 'string' ? m.file : shortname)
			  
			  if (myresult)
				  counter++
		    }
		}
	  }
		
	  this.reply(`保存${counter}个文件成功`)
  }
  
  async saveImg (url, keyWord) {
    let savePath = `${settings.image_path}/emoji/other/`

    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath)
    }

    const response = await fetch(url)

    keyWord = keyWord.replace(/\.|\\|\/|:|\*|\?|<|>|\|"/g, '_')

    if (!response.ok) {
      this.e.reply('添加图片下载失败。。')
      return false
    }

    let type = response.headers.get('content-type').split('/')[1]
    if (type == 'jpeg') type = 'jpg'

    if (fs.existsSync(`${savePath}${keyWord}.${type}`)) {
      keyWord = `${keyWord}_${moment().format('X')}`
    }

    savePath = `${savePath}${keyWord}.${type}`

    const streamPipeline = promisify(pipeline)
    await streamPipeline(response.body, fs.createWriteStream(savePath))

    return savePath
  }
  
  
  cryptPwd (pwd) {
    let md5 = crypto.createHash('md5');
    return md5.update(pwd).digest('hex');
  }
  
  /**
   * 取得目录中的文件名列表
   **/
  getFilesList(cate, child) {
	  let facePath = path.join(settings.image_path, cate, child);
	  let faceFiles    = []
	  fs.readdirSync(facePath).forEach(fileName => faceFiles.push(path.join(settings.image_path, cate, child, fileName)));
	  return faceFiles
  }
  
  /**
   * 取得数组中的随机count项
   **/
  getRandom(array, count) {
	  let s = []
	  
	  if (array.length <= count) return array
	  
	  while (count > 0) {
		let idx = Math.floor(Math.random() * array.length)
		if (s.indexOf(idx) == -1) {
			s.push(idx)
			count--
		}
	  }
	  
	  return s.map(x => array[x])
  }
}