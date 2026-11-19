/**
 * Painel "Auto" (aba direita): permissoes do agente, agendador,
 * credenciais do vault e MCP externos do projeto.
 * Todos os canais IPC ja sao permitidos no preload.
 */
import { state } from '../../state/app-state.js'
import { mostrarToast } from './toast.js'

const $ = (id) => document.getElementById(id)
const api = () => window.api

let iniciado = false

function el(tag, cls, texto) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (texto != null) e.textContent = texto
  return e
}

function btnRotulo(txt, onClick, titulo) {
  const b = el('button', 'btn-icon auto-mini', txt)
  b.type = 'button'
  if (titulo) b.title = titulo
  b.addEventListener('click', onClick)
  return b
}

async function carregarPermissoes() {
  const box = $('auto-perms')
  if (!box) return
  box.textContent = ''
  try {
    const r = await api().invoke('dg:permissoes:obter')
    const p = r?.permissoes || {}
    const itens = [
      ['leitura', 'Leitura', 'permitirLeitura'],
      ['edicao', 'Edição', 'permitirEdicao'],
      ['bash', 'Terminal', 'permitirBash'],
      ['mcp', 'MCP externo', 'permitirMcp']
    ]
    for (const [id, rotulo, chave] of itens) {
      const label = el('label', 'auto-perm')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = p[chave] !== false
      cb.addEventListener('change', async () => {
        cb.disabled = true
        try {
          await api().invoke('dg:permissoes:salvar', { ...p, [chave]: cb.checked })
        } catch { cb.checked = !cb.checked }
        cb.disabled = false
      })
      label.append(cb, document.createTextNode(' ' + rotulo))
      box.append(label)
    }
  } catch {
    box.append(el('p', 'muted', 'Permissões indisponíveis.'))
  }
}

async function carregarAgendador() {
  const box = $('auto-agenda-lista')
  if (!box) return
  box.textContent = ''
  try {
    const r = await api().invoke('agendador:listar')
    const itens = r?.itens || []
    if (!itens.length) {
      box.append(el('p', 'muted', 'Nenhum job. Use o formulário acima ou /agendar no chat.'))
      return
    }
    for (const j of itens) {
      const linha = el('div', 'auto-item' + (j.ativo ? '' : ' off'))
      linha.append(
        el('span', 'auto-item-txt',
          (j.ativo ? '● ' : '○ ') + j.cadaMin + 'min — ' + String(j.prompt || '').slice(0, 80))
      )
      linha.append(btnRotulo(j.ativo ? 'pausar' : 'ativar', async () => {
        await api().invoke('agendador:alternar', { id: j.id })
        void carregarAgendador()
      }, 'Alternar job'))
      linha.append(btnRotulo('remover', async () => {
        await api().invoke('agendador:remover', { id: j.id })
        void carregarAgendador()
      }, 'Remover job'))
      box.append(linha)
    }
  } catch {
    box.append(el('p', 'muted', 'Agendador indisponível.'))
  }
}

async function carregarCredenciais() {
  const box = $('auto-cred-lista')
  if (!box) return
  box.textContent = ''
  try {
    const r = await api().invoke('credenciais:listar')
    const itens = r?.itens || []
    if (!itens.length) {
      box.append(el('p', 'muted', 'Nenhuma credencial. Salve acima ou use /credenciais no chat.'))
      return
    }
    for (const id of itens) {
      const linha = el('div', 'auto-item')
      linha.append(el('span', 'auto-item-txt', '🔑 ' + id))
      linha.append(btnRotulo('remover', async () => {
        await api().invoke('credenciais:remover', { id })
        void carregarCredenciais()
      }, 'Remover credencial'))
      box.append(linha)
    }
  } catch {
    box.append(el('p', 'muted', 'Vault indisponível.'))
  }
}

async function carregarMcps() {
  const box = $('auto-mcp-lista')
  if (!box) return
  box.textContent = ''
  const raiz = state.pastaAtual || ''
  if (!raiz) {
    box.append(el('p', 'muted', 'Abra uma pasta para ver os MCP do projeto.'))
    return
  }
  try {
    const r = await api().invoke('mcp:catalogo', raiz)
    const itens = r?.itens || []
    if (!itens.length) {
      box.append(el('p', 'muted', 'Catálogo MCP vazio.'))
      return
    }
    for (const s of itens.slice(0, 20)) {
      const linha = el('div', 'auto-item' + (s.ativo ? '' : ' off'))
      linha.append(
        el('span', 'auto-item-txt', (s.ativo ? '● ' : '○ ') + (s.id || '') + ' — ' + (s.nome || '') +
          (s.descricao ? ' · ' + String(s.descricao).slice(0, 60) : ''))
      )
      if (!s.ativo) {
        linha.append(btnRotulo('instalar', async () => {
          const rr = await api().invoke('mcp:instalar', { raiz, id: s.id })
          if (!rr?.ok) mostrarToast('Falha: ' + (rr?.erro || 'erro'), 'erro')
          void carregarMcps()
        }, 'Instalar MCP no projeto'))
      }
      box.append(linha)
    }
  } catch {
    box.append(el('p', 'muted', 'MCP indisponível.'))
  }
}

function ligarBotoes() {
  const add = $('auto-agenda-add')
  if (add && !add.dataset.ligado) {
    add.dataset.ligado = '1'
    add.addEventListener('click', async () => {
      const min = Number($('auto-agenda-min')?.value)
      const prompt = String($('auto-agenda-prompt')?.value || '').trim()
      const raiz = state.pastaAtual || ''
      if (!Number.isFinite(min) || min < 5 || !prompt || !raiz) {
        mostrarToast('Informe intervalo (≥5min), prompt e abra uma pasta.', 'aviso')
        return
      }
      const r = await api().invoke('agendador:adicionar', { prompt, cadaMin: min, raiz })
      if (r?.ok) {
        $('auto-agenda-prompt').value = ''
        void carregarAgendador()
      } else mostrarToast('Falha: ' + (r?.erro || 'erro'), 'erro')
    })
  }
  const cred = $('auto-cred-add')
  if (cred && !cred.dataset.ligado) {
    cred.dataset.ligado = '1'
    cred.addEventListener('click', async () => {
      const id = String($('auto-cred-id')?.value || '').trim()
      const valor = String($('auto-cred-valor')?.value || '')
      if (!id || !valor) {
        mostrarToast('Informe id e chave.', 'aviso')
        return
      }
      const r = await api().invoke('credenciais:definir', { id, chave: valor })
      if (r?.ok) {
        $('auto-cred-id').value = ''
        $('auto-cred-valor').value = ''
        void carregarCredenciais()
      } else mostrarToast('Falha: ' + (r?.erro || 'erro'), 'erro')
    })
  }
}

/** Chamado ao ativar a aba "Auto". Carrega tudo e liga botoes uma vez. */
export async function carregarPainelAuto() {
  ligarBotoes()
  await Promise.allSettled([carregarPermissoes(), carregarAgendador(), carregarCredenciais(), carregarMcps()])
  iniciado = true
}

export function painelAutoIniciado() {
  return iniciado
}
