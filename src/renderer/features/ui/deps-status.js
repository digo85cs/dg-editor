// deps-status.js — indicadores de IA na statusbar/chat-header.
// Extraído de app.js (bloco "Guardião"): deps do Ollama, badge de provedor,
// chip de memória e badge real do modelo ativo.
import { state } from '../../state/app-state.js'
import { pastasPermitidas } from '../arquivos/index.js'

let depStatusCache = null

export function atualizarIndicadorDeps(st) {
  depStatusCache = st || depStatusCache
  const d = depStatusCache
  const btn = document.getElementById('btn-ollama-start')
  if (d && btn) {
    const mostrar = d.ollama === 'offline' && d.instalado && !d.llmApiKey
    btn.style.display = mostrar ? '' : 'none'
  }
  const sb = document.getElementById('sb-ia')
  if (!d) return
  let dep = 'IA: —'
  if (d.llmApiKey) dep = 'IA: API online'
  else if (d.ollama === 'ativo') dep = 'IA: Ollama ativo'
  else if (d.ollama === 'offline') dep = 'IA: Ollama offline'
  else dep = 'IA: local indisponível'
  if (sb) {
    sb.textContent = dep
    sb.title = dep + (d.modelo && d.modelo !== 'desconhecido' ? ' · ' + d.modelo : '')
  }
  const alvo = document.getElementById('chat-provider')
  if (alvo) {
    alvo.dataset.iaBase = dep
    alvo.textContent = dep
  }
}

export function atualizarBadgeProvedor(nome) {
  const sb = document.getElementById('sb-ia')
  const curto = String(nome || '').split('/')[0] || nome
  if (sb) {
    sb.textContent = 'IA: ' + curto
    sb.title = 'Provedor: ' + nome
  }
  const alvo = document.getElementById('chat-provider')
  if (alvo) {
    alvo.dataset.iaBase = 'IA: ' + nome
    alvo.textContent = 'IA: ' + nome
  }
}

export async function atualizarChipMemoria() {
  try {
    const raiz = (pastasPermitidas() || [])[0] || (state.pastasRecentes || [])[0]
    if (!raiz) return
    const fatos = await window.api.invoke('memoria:listar', raiz)
    const itens = (fatos && fatos.itens) || []
    const n = itens.filter((i) => i.status === 'aceita').length
    let chip = document.getElementById('chat-memoria-chip')
    const host = document.getElementById('chat-header') || document.getElementById('chat-provider')?.parentElement
    if (!host) return
    if (!chip) {
      chip = document.createElement('span')
      chip.id = 'chat-memoria-chip'
      chip.className = 'provider-badge'
      chip.style.marginLeft = '6px'
      const prov = document.getElementById('chat-provider')
      if (prov && prov.parentElement) prov.parentElement.appendChild(chip)
      else host.appendChild(chip)
    }
    if (n > 0) {
      chip.hidden = false
      chip.textContent = 'Memória:' + n
      chip.title = n + ' fato(s) aceito(s) no contexto automático'
    } else {
      chip.hidden = true
      chip.textContent = ''
    }
  } catch {
    /* opcional */
  }
}
window.dgAtualizarChipMemoria = atualizarChipMemoria

export async function atualizarBadgeProvedorReal(modeloForcado) {
  try {
    const ps = await window.api.invoke('brain:providers')
    const ativo = Array.isArray(ps) ? ps.find((p) => p.available) : null
    const nomeProv = ativo
      ? ativo.name === 'ollama'
        ? 'Ollama'
        : String(ativo.name || 'IA')
      : '—'
    let modelo = modeloForcado || ''
    let flagUpdate = false
    let motivoTarefa = ''
    if (!modelo) {
      try {
        const tarefaSel = document.getElementById('chat-mode-select')?.value || 'codigo'
        const tarefa =
          tarefaSel === 'plan' || tarefaSel === 'ask' ? 'chat' : tarefaSel === 'agent' ? 'codigo' : 'codigo'
        const mt = await window.api.invoke('modelos:para-tarefa', tarefa)
        if (mt?.modelo) {
          modelo = mt.modelo
          motivoTarefa = mt.motivo || ''
        }
      } catch {
        /* */
      }
      if (!modelo) {
        try {
          const r = await window.api.invoke('modelos:listar')
          modelo = (r && r.catalogo && r.catalogo.ativo) || ''
          const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
          flagUpdate = !!(m && m.atualizadoDisponivel)
        } catch {
          /* ignora */
        }
      } else {
        try {
          const r = await window.api.invoke('modelos:listar')
          const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
          flagUpdate = !!(m && m.atualizadoDisponivel)
        } catch {
          /* */
        }
      }
    } else {
      try {
        const r = await window.api.invoke('modelos:listar')
        const m = (r?.catalogo?.modelos || []).find((x) => x.id === modelo)
        flagUpdate = !!(m && m.atualizadoDisponivel)
      } catch {
        /* */
      }
    }
    let texto = modelo ? 'IA: ' + nomeProv + ' — ' + modelo : 'IA: ' + nomeProv
    if (flagUpdate) texto += ' ⚠ atualização disponível'
    let titleExtra = motivoTarefa || ''
    try {
      const cotas = await window.api.invoke('providers:cotas')
      const lista = cotas?.cotas || cotas?.itens || []
      const esgotados = Array.isArray(lista) ? lista.filter((c) => c.esgotado || c.remaining === 0).length : 0
      if (esgotados) {
        texto += ' · cota:' + esgotados + ' esgot.'
        titleExtra = (titleExtra ? titleExtra + ' · ' : '') + esgotados + ' provedor(es) em cooldown/cota'
      }
    } catch { /* opcional */ }
    try {
      const conn = await window.api.invoke('conectores:listar')
      const conectores = conn?.conectores || []
      const off = conectores.filter((c) => !c.ativo).length
      if (off) titleExtra = (titleExtra ? titleExtra + ' · ' : '') + off + ' conector(es) inativos'
    } catch { /* opcional */ }
    const alvo = document.getElementById('chat-provider')
    if (alvo) {
      alvo.dataset.iaBase = texto
      alvo.textContent = texto
      if (titleExtra) alvo.title = titleExtra
      if (depStatusCache) atualizarIndicadorDeps(depStatusCache)
    }
    void atualizarChipMemoria()
  } catch {
    /* ignora */
  }
}
