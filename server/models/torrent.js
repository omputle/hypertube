import WebTorrent from 'webtorrent'
import fs from 'fs'
import { getExt } from './videoModel'
import q from './query'

let client = new WebTorrent()
const dest = 'server/public/videos/'
const tpath = '/tmp/webtorrent/'

let error_message = ""

client.on('error', (err) => {
	error_message = err.message;
})

client.on('download', (bytes) => {
	let downloadSpeed = Number(client.downloadSpeed/1000).toFixed(1)+'kb/s'
  process.stdout.write(downloadSpeed+'\r')
})

client.on('torrent', (tor) => {
    let progress = Number(tor.downloaded/1000000).toFixed(0)+'/'
        +Number(tor.length/1000000).toFixed(0)+' mb'
    let downloadSpeed = Number(client.downloadSpeed/1000).toFixed(1)+'kb/s'
    process.stdout.write(downloadSpeed+'  '+tor.name+'\r')
})

export async function magnetUrl(param) {
  param.tr = param.tr.join(',')
  var con = Object.values(param)
  var magnet = con.join(',')
  return ('magnet:?xt='+magnet.replace(',',''))
}

export async function deleteTorrent(magnet) {
    var torrent = client.get(magnet)
    
    if (!torrent) 
      console.log('no torrent')
    else {
        var dir = tpath+torrent.infoHash
        torrent.destroy(() => {
            fs.rmdir(dir, { recursive: true }, (err) => {
                if (err) {
                    throw err;
                }
            })
        })
    }
    return (torrent ? `torrent ${torrent.infoHash} destroyed` : 'torrent does not exist')
}

export async function infoTorrent(magnet) {
    var torrent = client.get(magnet)
    var stat = {
      torrentpath: tpath,
      destination: '',
      size: '',
      downloaded: 0+' kb',
      downloadSpeed: Number(client.downloadSpeed/1000).toFixed(1)+'kb/s'
    }
    torrent.files.forEach((data) => {
      stat.torrentpath += torrent.infoHash
      stat.destination = dest+data.name
      stat.size = Number(data.length/100).toFixed(0)+' kb'
      stat.downloaded = Number(data.downloaded/100).toFixed(0)+' kb'
    })
    return (stat.destination.length > 0 ? stat : '\ninitializing torrent: '+torrent.infoHash)    
}

async function insertMovie(name, ext) {
    let params = ['name', 'ext', 'created']
    let created = new Date().getDate()
    let res = await q.fetchone('movies', ['name'], ['name'], name)
    res ? 1 : q.insert('movies', params, [name, ext, created]) 
    return (res ? 1 : 0)
}

export async function downloadTorrent(magnet) {
    let tor = await streamable(magnet)
    if (tor) {
        return (tor.downloaded ? `downloading torrent ${tor.infoHash}` : `queued torrent ${tor.infoHash}`)
    } else {
        client.add(magnet, (torrent) => {
            const files = torrent.files
            let len = files.length
            files.forEach(async (file) => {
                let ext = getExt(file.name)
                if (ext == '.mkv' || ext == '.mp4' || ext == 'avi') {
                    let db = await insertMovie(file.name, ext)
                    if (db == 0) {
                        const stream = file.createReadStream()
                        const save = fs.createWriteStream(dest+file.name)
                        stream.on('end', async () => {
                            console.log('download finished')
                            let stat = await deleteTorrent(magnet)
                            console.log(stat)
                            len -= 1
                            if (!len)
                            process.exit
                        }).pipe(save)
                    } else {
                        let res = await deleteTorrent(magnet)
                        console.log(res)
                        console.log('movie already downloaded')
                        return ('movie already exists')
                    }                    
                }
            })
        })
        return ('initializing torrent...')
    }
}

export async function streamable(magnet) {
    let tor = client.get(magnet)
    return (tor ? tor : 0)
}

export default client