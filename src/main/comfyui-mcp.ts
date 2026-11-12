import { ipcMain } from 'electron'
import http from 'http'

type HostPort = { host: string; port: number }

function parseHostPort(host?: string, port?: number): HostPort {
  return {
    host: (host && String(host).trim()) || '127.0.0.1',
    port: typeof port === 'number' && port > 0 ? port : 8188
  }
}

function httpJson(
  opts: HostPort & { path: string; method?: string; body?: string },
  timeoutMs = 4000
): Promise<{ ok: boolean; status?: number; data?: string; erro?: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: opts.host,
        port: opts.port,
        path: opts.path,
        method: opts.method || 'GET',
        headers: opts.body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(opts.body) }
          : undefined,
        timeout: timeoutMs
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () =>
          resolve({ ok: (res.statusCode || 500) < 400, status: res.statusCode, data: d })
        )
      }
    )
    req.on('error', (e) => resolve({ ok: false, erro: String(e.message || e) }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, erro: 'timeout' })
    })
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

/** Workflow mínimo placeholder (usuário deve ter nós Wan/SD no ComfyUI). */
function workflowTextoSimples(prompt: string, modo: 'imagem' | 'video') {
  const p = String(prompt || 'cena').slice(0, 500)
  return {
    // Metadados DG — o ComfyUI real precisa de workflow importado pelo usuário
    dg: {
      modo,
      prompt: p,
      nota: 'Envie um workflow real via UI do ComfyUI se este placeholder for rejeitado.'
    },
    3: {
      class_type: 'CLIPTextEncode',
      inputs: { text: p, clip: ['4', 1] }
    },
    4: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: modo === 'video' ? 'wan_placeholder.safetensors' : 'sdxl_placeholder.safetensors' }
    }
  }
}

export function registrarComfyUIIpc() {
  ipcMain.handle('dg:comfyui:status', async (_e, host = '127.0.0.1', port = 8188) => {
    const hp = parseHostPort(host, port)
    const r = await httpJson({ ...hp, path: '/system_stats' }, 2000)
    return {
      ok: !!r.ok,
      host: hp.host,
      port: hp.port,
      docs: 'http://' + hp.host + ':' + hp.port,
      erro: r.erro,
      data: r.data
    }
  })

  ipcMain.handle('dg:comfyui:gerar', async (
      _e,
      payload: { prompt?: string; modo?: 'imagem' | 'video'; host?: string; port?: number } = {}
    ) => {
      const hp = parseHostPort(payload.host, payload.port)
      const modo = payload.modo === 'video' ? 'video' : 'imagem'
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) return { ok: false, erro: 'Informe o prompt' }

      const st = await httpJson({ ...hp, path: '/system_stats' }, 2000)
      if (!st.ok) {
        return {
          ok: false,
          erro:
            'ComfyUI offline em ' +
            hp.host +
            ':' +
            hp.port +
            '. Abra o ComfyUI local e tente de novo. ' +
            (st.erro || '')
        }
      }

      const body = JSON.stringify({
        prompt: workflowTextoSimples(prompt, modo),
        client_id: 'dg-editor'
      })
      const r = await httpJson({ ...hp, path: '/prompt', method: 'POST', body }, 8000)
      if (!r.ok) {
        return {
          ok: false,
          erro:
            'Falha ao enfileirar no ComfyUI. Importe um workflow Wan/SDXL na interface do ComfyUI. ' +
            (r.erro || r.data || ''),
          status: r.status
        }
      }
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(r.data || '{}')
      } catch {
        /* */
      }
      return {
        ok: true,
        prompt_id: parsed.prompt_id || null,
        modo,
        docs: 'http://' + hp.host + ':' + hp.port,
        mensagem: 'Pedido enviado ao ComfyUI. Acompanhe a geração na UI do ComfyUI.'
      }
    }
  )

  ipcMain.handle('dg:comfyui:docs', async (_e, host = '127.0.0.1', port = 8188) => {
    const hp = parseHostPort(host, port)
    return {
      ok: true,
      url: 'http://' + hp.host + ':' + hp.port,
      passos: [
        '1. Instale e inicie o ComfyUI (porta 8188).',
        '2. Importe um workflow de imagem (SDXL/Flux) ou vídeo (Wan).',
        '3. No DG Editor → Automações → Assistente de vídeo/imagem, digite o prompt e clique Gerar.',
        '4. Acompanhe o progresso na janela do ComfyUI.'
      ]
    }
  })
}
