// imagem.js — preview e edição básica de imagens (redimensionar, recorte,
// reset, download PNG). Extraído de app.js.
import { mostrarToast } from '../ui/toast.js'
import { pastasPermitidas } from '../arquivos/index.js'

const $ = (id) => document.getElementById(id)

/** @type {{ src: string, caminho: string } | null} */
let imgEditEstado = null

function imgEditInfo(msg) {
  const el = $('img-edit-info')
  if (el) el.textContent = msg || ''
}

function imgEditCanvas() {
  return /** @type {HTMLCanvasElement|null} */ ($('img-edit-canvas'))
}

function imgEditMostrarCanvas(show) {
  const canvas = imgEditCanvas()
  const img = $('image-preview-img')
  if (!canvas || !img) return
  canvas.hidden = !show
  img.style.display = show ? 'none' : ''
}

function imgEditSyncInputs() {
  const canvas = imgEditCanvas()
  const w = $('img-edit-w')
  const h = $('img-edit-h')
  if (!canvas || !w || !h) return
  w.value = String(canvas.width || '')
  h.value = String(canvas.height || '')
  imgEditInfo(canvas.width + '×' + canvas.height + ' px')
}

function imgEditCarregarDataUrl(dataUrl) {
  const canvas = imgEditCanvas()
  const img = $('image-preview-img')
  if (!canvas || !img) return
  const im = new Image()
  im.onload = () => {
    canvas.width = im.naturalWidth
    canvas.height = im.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    ctx?.drawImage(im, 0, 0)
    img.src = dataUrl
    imgEditMostrarCanvas(true)
    imgEditSyncInputs()
  }
  im.src = dataUrl
}

function imgEditResize() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const nw = Math.max(16, Math.min(8192, parseInt(String($('img-edit-w')?.value || '0'), 10) || 0))
  const nh = Math.max(16, Math.min(8192, parseInt(String($('img-edit-h')?.value || '0'), 10) || 0))
  if (!nw || !nh) {
    mostrarToast('Informe largura e altura', 'aviso')
    return
  }
  const tmp = document.createElement('canvas')
  tmp.width = nw
  tmp.height = nh
  tmp.getContext('2d')?.drawImage(canvas, 0, 0, nw, nh)
  canvas.width = nw
  canvas.height = nh
  canvas.getContext('2d')?.drawImage(tmp, 0, 0)
  imgEditSyncInputs()
  mostrarToast('Redimensionado para ' + nw + '×' + nh, 'ok')
}

function imgEditCropCentro() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const fator = 0.8
  const cw = Math.max(16, Math.floor(canvas.width * fator))
  const ch = Math.max(16, Math.floor(canvas.height * fator))
  const sx = Math.floor((canvas.width - cw) / 2)
  const sy = Math.floor((canvas.height - ch) / 2)
  const tmp = document.createElement('canvas')
  tmp.width = cw
  tmp.height = ch
  tmp.getContext('2d')?.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch)
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')?.drawImage(tmp, 0, 0)
  imgEditSyncInputs()
  mostrarToast('Recorte central aplicado', 'ok')
}

function imgEditReset() {
  if (!imgEditEstado?.src) return
  imgEditCarregarDataUrl(imgEditEstado.src)
  mostrarToast('Imagem original restaurada', 'ok')
}

function imgEditDownload() {
  const canvas = imgEditCanvas()
  if (!canvas) return
  const a = document.createElement('a')
  const base = (imgEditEstado?.caminho || 'imagem').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'imagem'
  a.download = base + '-edit.png'
  a.href = canvas.toDataURL('image/png')
  a.click()
  mostrarToast('PNG baixado', 'ok')
}

function initEditorImagem() {
  if (document.body.dataset.imgEditWired === '1') return
  document.body.dataset.imgEditWired = '1'
  $('img-edit-resize')?.addEventListener('click', () => imgEditResize())
  $('img-edit-crop')?.addEventListener('click', () => imgEditCropCentro())
  $('img-edit-reset')?.addEventListener('click', () => imgEditReset())
  $('img-edit-download')?.addEventListener('click', () => imgEditDownload())
}

export async function mostrarImagem(caminho) {
  const host = $('editor-host')
  const box = $('image-preview')
  const img = $('image-preview-img')
  const mount = $('editor-mount')
  if (!box || !img) return
  initEditorImagem()
  const r = await window.api.invoke('arquivo:ler-base64', caminho, pastasPermitidas())
  if (!r?.ok || !r.dataUrl) {
    alert('Não foi possível abrir imagem: ' + (r?.erro || 'erro'))
    return
  }
  imgEditEstado = { src: r.dataUrl, caminho: String(caminho || '') }
  imgEditCarregarDataUrl(r.dataUrl)
  box.classList.remove('hidden')
  box.setAttribute('aria-hidden', 'false')
  mount?.classList.add('hidden')
  $('editor-empty')?.classList.add('hidden')
  host?.classList.add('modo-imagem')
}

export function esconderImagem() {
  const box = $('image-preview')
  const mount = $('editor-mount')
  box?.classList.add('hidden')
  box?.setAttribute('aria-hidden', 'true')
  mount?.classList.remove('hidden')
  $('editor-host')?.classList.remove('modo-imagem')
  imgEditEstado = null
  imgEditMostrarCanvas(false)
}
