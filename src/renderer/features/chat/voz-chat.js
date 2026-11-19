// voz-chat.js — ditado por voz no composer: MediaRecorder → base64 →
// midia:voz-transcrever (Whisper local/CF) → texto no chat-input.
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

let gravando = false
let mediaRecorder = null
let stream = null
let chunks = []
let timerStatus = null

function raizAtual() {
  return state.pastaAtual || ''
}

function setOcupado(on) {
  const btn = $('btn-chat-voz')
  if (btn) {
    btn.classList.toggle('gravando', on)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    btn.title = on ? 'Parar e transcrever' : 'Ditar mensagem (Whisper local)'
  }
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function transcreverBlob(blob) {
  const raiz = raizAtual()
  if (!raiz) {
    mostrarToast('Abra uma pasta para usar o ditado.', 'aviso')
    return
  }
  mostrarToast('Transcrevendo áudio…', 'ok')
  try {
    const audio = await blobParaBase64(blob)
    const r = await window.api.invoke('midia:voz-transcrever', {
      raiz,
      audio,
      mime: blob.type || 'audio/webm'
    })
    if (!r?.ok || !r.texto) {
      mostrarToast('Transcrição falhou: ' + (r?.erro || 'sem resultado'), 'erro')
      return
    }
    const input = $('chat-input')
    if (input) {
      const atual = input.value.trim()
      input.value = atual ? atual + ' ' + r.texto : r.texto
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
    }
  } catch (e) {
    mostrarToast('Voz erro: ' + String(e).slice(0, 160), 'erro')
  }
}

async function iniciar() {
  if (gravando) return parar()
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    mostrarToast('Este ambiente não suporta gravação de voz.', 'erro')
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    mostrarToast('Permissão de microfone negada.', 'erro')
    return
  }
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : ''
  try {
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  } catch {
    mediaRecorder = new MediaRecorder(stream)
  }
  chunks = []
  mediaRecorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  mediaRecorder.onstop = async () => {
    gravando = false
    setOcupado(false)
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* */ }
    stream = null
    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
    chunks = []
    if (blob.size > 200) await transcreverBlob(blob)
  }
  mediaRecorder.start()
  gravando = true
  setOcupado(true)
  mostrarToast('Ouvindo… clique no microfone de novo para parar.', 'ok')
}

function parar() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop() } catch { /* */ }
  } else {
    gravando = false
    setOcupado(false)
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* */ }
    stream = null
  }
}

/** Liga o botao de voz do composer. Idempotente. */
export function ligarVozChat() {
  const btn = $('btn-chat-voz')
  if (!btn || btn.dataset.ligado) return
  btn.dataset.ligado = '1'
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    void iniciar()
  })
}

// Auto-init quando o DOM estiver pronto (modulo e importado pelo app.js).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ligarVozChat, { once: true })
  } else {
    ligarVozChat()
  }
}
void timerStatus
