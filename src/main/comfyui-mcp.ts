import { ipcMain } from 'electron'
import { gerarImagemComfy, gerarVideoComfy, iniciarComfy, pararComfy, statusComfy } from './midia/comfyui'

function texto(v: unknown, max = 2000): string {
  return String(v || '').trim().slice(0, max)
}

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function registrarComfyUIIpc() {
  ipcMain.handle('dg:comfyui:status', async () => {
    return statusComfy()
  })

  ipcMain.handle('dg:comfyui:iniciar', async () => {
    return iniciarComfy()
  })

  ipcMain.handle('dg:comfyui:parar', async () => {
    return pararComfy()
  })

  ipcMain.handle('dg:comfyui:gerar', async (_e, payload: Record<string, unknown> = {}) => {
    const raiz = texto(payload.raiz)
    if (!raiz) return { ok: false, erro: 'Abra um repositório para salvar a mídia.' }
    const prompt = texto(payload.prompt)
    if (!prompt) return { ok: false, erro: 'Informe o prompt' }
    const modo = payload.modo === 'video' ? 'video' : 'imagem'
    if (modo === 'video') {
      return gerarVideoComfy(raiz, {
        prompt,
        negocio: texto(payload.negativo) || undefined,
        largura: numero(payload.largura),
        altura: numero(payload.altura),
        quadros: numero(payload.quadros),
        fps: numero(payload.fps),
        passos: numero(payload.passos),
        seed: numero(payload.seed),
        saida: texto(payload.saida) || undefined
      })
    }
    return gerarImagemComfy(raiz, {
      prompt,
      negocio: texto(payload.negativo) || undefined,
      largura: numero(payload.largura),
      altura: numero(payload.altura),
      passos: numero(payload.passos),
      seed: numero(payload.seed),
      saida: texto(payload.saida) || undefined
    })
  })

  ipcMain.handle('dg:comfyui:docs', async () => {
    return {
      ok: true,
      url: 'http://127.0.0.1:8188',
      passos: [
        '1. Clique em "Iniciar ComfyUI" no Estúdio de mídia (o DG Editor sobe o servidor em CPU).',
        '2. Escolha imagem (SD 1.5 + LCM, ~6 passos) ou vídeo (AnimateDiff, 8–32 quadros).',
        '3. Digite o prompt e gere: a saída fica em .dg-editor/midia do repositório.',
        '4. Imagem/vídeo são ilimitados e gratuitos; o tempo depende da CPU.'
      ]
    }
  })
}
