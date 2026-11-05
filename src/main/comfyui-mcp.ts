import { ipcMain } from 'electron'
import http from 'http'

export function registrarComfyUIIpc() {
  ipcMain.handle('dg:comfyui:status', async (_e, host='127.0.0.1', port=8188) => {
    return new Promise((resolve) => {
      const req = http.get({host, port, path:'/system_stats', timeout:2000}, (res) => {
        let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({ok:res.statusCode===200, data:d}))
      })
      req.on('error',e=>resolve({ok:false, erro:String(e.message)}))
      req.on('timeout',()=>{req.destroy();resolve({ok:false,erro:'timeout'})})
    })
  })
}
