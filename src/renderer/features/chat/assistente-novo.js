/**
 * Assistente Novo — escolhe o que criar; precheck PATH + auto-envia no chat.
 */

const PROMPTS = {
  sistema:
    'Quero criar um SISTEMA (app) neste repositorio com ferramentas gratuitas (Ollama/OpenRouter free). ' +
    'Pergunte so o essencial (nome, stack preferida PHP/Node/estatico) e depois proponha a estrutura de pastas e arquivos iniciais. Nao use APIs pagas.',
  site:
    'Quero criar um SITE / landing page neste repositorio (HTML+CSS, sem frameworks pagos). ' +
    'Depois de gerar, diga como abrir o preview no Navegador do Bloco 3. Ferramentas: so locais/gratis.',
  imagem:
    'Quero gerar IMAGENS com ferramentas gratuitas (ComfyUI local na porta 8188). ' +
    'Abra o assistente de midia se preciso e peca um prompt de cena. Sem Midjourney/APIs pagas.',
  video:
    'Quero gerar ou montar VIDEO com ferramentas gratuitas (ComfyUI e/ou FFmpeg no PATH). ' +
    'Explique os passos e o que preciso ter instalado. Sem servicos pagos.',
  docs:
    'Quero criar DOCUMENTACAO (Markdown). Se Pandoc estiver no PATH, mencione conversao. ' +
    'Proponha um README ou guia curto em pt-BR.',
  chat: ''
}

const PRECHECK = {
  imagem: ['comfyui'],
  video: ['ffmpeg', 'comfyui'],
  docs: ['pandoc']
}

export function abrirAssistenteNovo() {
  const modal = document.getElementById('modal-assistente-novo')
  if (!modal) return
  modal.classList.remove('hidden')
}

export function fecharAssistenteNovo() {
  document.getElementById('modal-assistente-novo')?.classList.add('hidden')
}

async function precheckFerramentas(tipo) {
  const ids = PRECHECK[tipo]
  if (!ids || !ids.length) return { ok: true, avisos: [] }
  try {
    const r = await window.api.invoke('conectores:listar')
    const lista = Array.isArray(r?.conectores) ? r.conectores : []
    const avisos = []
    for (const id of ids) {
      const c = lista.find((x) => x.id === id)
      if (!c || !c.ativo) {
        avisos.push(
          id === 'comfyui'
            ? 'ComfyUI nao detectado (opcional — pode seguir so com orientacao)'
            : id === 'ffmpeg'
              ? 'FFmpeg nao esta no PATH (opcional)'
              : id === 'pandoc'
                ? 'Pandoc nao esta no PATH (Markdown ainda funciona)'
                : id + ' ausente'
        )
      }
    }
    return { ok: true, avisos }
  } catch {
    return { ok: true, avisos: [] }
  }
}

/**
 * @param {{
 *   focarChat: () => void,
 *   setChatText: (t: string) => void,
 *   enviarChat?: () => void,
 *   abrirFerramentas?: (id: string) => void,
 *   toggleRight?: (open: boolean) => void,
 *   ativarAba?: (pane: string) => void,
 *   abrirBrowser?: () => void,
 *   toast?: (m: string, t?: string) => void
 * }} deps
 */
export function ligarAssistenteNovo(deps) {
  const modal = document.getElementById('modal-assistente-novo')
  if (!modal || modal.dataset.wired === '1') return
  modal.dataset.wired = '1'

  document.getElementById('assistente-novo-fechar')?.addEventListener('click', () => fecharAssistenteNovo())
  modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharAssistenteNovo()
  })

  modal.querySelectorAll('[data-novo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void (async () => {
        const tipo = btn.getAttribute('data-novo') || 'chat'
        fecharAssistenteNovo()
        const check = await precheckFerramentas(tipo)
        if (check.avisos?.length) {
          deps.toast?.(check.avisos[0], 'aviso')
        }
        if (tipo === 'imagem' || tipo === 'video') {
          deps.toggleRight?.(true)
          deps.abrirFerramentas?.('automacoes')
        }
        if (tipo === 'site') {
          deps.toggleRight?.(true)
          deps.ativarAba?.('browser')
        }
        deps.focarChat?.()
        const prompt = PROMPTS[tipo] || ''
        if (prompt) {
          deps.setChatText?.(prompt)
          // auto-enviar apos breve tick (deixa o input pintar)
          setTimeout(() => {
            if (typeof deps.enviarChat === 'function') deps.enviarChat()
            else document.getElementById('chat-send')?.click()
          }, 60)
          deps.toast?.('Pedido enviado no chat (ferramentas gratis)', 'ok')
        } else {
          deps.setChatText?.('')
          deps.toast?.('Chat focado — digite seu pedido', 'ok')
          document.getElementById('chat-input')?.focus()
        }
      })()
    })
  })
}

export function ligarRightRail(deps) {
  const rail = document.getElementById('right-rail')
  if (!rail || rail.dataset.wired === '1') return
  rail.dataset.wired = '1'
  rail.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rail]')
    if (!btn) return
    const a = btn.getAttribute('data-rail')
    if (a === 'collapse') {
      const col = document.getElementById('app')?.classList.contains('right-collapsed')
      deps.toggleRight?.(!!col)
    } else if (a === 'novo') {
      deps.toggleRight?.(true)
      abrirAssistenteNovo()
    } else if (a === 'browser') {
      deps.toggleRight?.(true)
      deps.ativarAba?.('browser')
      deps.abrirBrowser?.()
    } else if (a === 'terminal') {
      deps.toggleRight?.(true)
      deps.ativarAba?.('terminal')
      deps.garantirTerminal?.()
    } else if (a === 'files') {
      deps.toggleRight?.(true)
      deps.ativarAba?.('files')
    }
  })
}
