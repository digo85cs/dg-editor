/**
 * Análise de engenharia reversa local (inspirada no REA, MIT).
 * 100% offline e gratuito: binários PE/ELF/Mach-O, ASAR/Electron, JAR/APK e web.
 */
import { anunciar } from './features/ui/live-region.js'

function botao(rotulo, classe = 'btn-small') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = classe
  b.textContent = rotulo
  return b
}

function bytesTexto(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'
}

/**
 * @param {{ raiz?: string }} [opcoes]
 */
export async function abrirReversa(opcoes = {}) {
  if (document.querySelector('.reversa-modal')) return null
  const raiz = opcoes.raiz || ''

  const modal = document.createElement('div')
  modal.className = 'modal reversa-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Engenharia reversa local')

  const box = document.createElement('div')
  box.className = 'modal-box reversa-modal-box'

  const head = document.createElement('div')
  head.className = 'reversa-head'
  const titulo = document.createElement('h3')
  titulo.textContent = 'Engenharia reversa local (REA)'
  const btnFechar = botao('Fechar', 'btn-small btn-ghost')
  head.append(titulo, btnFechar)

  const aviso = document.createElement('p')
  aviso.className = 'muted'
  aviso.style.cssText = 'font-size:11px;margin:0 0 8px'
  aviso.textContent =
    'Análise estática offline. Use apenas em arquivos e sistemas que você possui ou tem autorização para inspecionar. Não contorna DRM nem proteções técnicas.'

  const alvo = document.createElement('input')
  alvo.type = 'text'
  alvo.className = 'reversa-alvo'
  alvo.placeholder = 'Caminho do arquivo/pasta no projeto ou https://…'
  alvo.style.cssText =
    'font-size:12px;padding:7px 9px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);width:100%;box-sizing:border-box;margin-bottom:6px'

  const barra = document.createElement('div')
  barra.className = 'reversa-barra'
  const btnEscolher = botao('Escolher arquivo')
  const btnAnalisar = botao('Analisar', 'btn-small btn-primary')
  const btnPasta = botao('Abrir relatórios')
  barra.append(btnEscolher, btnAnalisar, btnPasta)

  const status = document.createElement('div')
  status.className = 'reversa-status muted'
  status.setAttribute('role', 'status')
  status.textContent = 'Pronto.'

  const ferramentas = document.createElement('div')
  ferramentas.className = 'reversa-ferramentas muted'

  const resultado = document.createElement('div')
  resultado.className = 'reversa-resultado'

  const listaTitulo = document.createElement('h4')
  listaTitulo.textContent = 'Relatórios salvos (.dg-editor/reversa)'
  const lista = document.createElement('div')
  lista.className = 'reversa-lista'

  box.append(head, aviso, alvo, barra, status, ferramentas, resultado, listaTitulo, lista)
  modal.appendChild(box)
  document.body.appendChild(modal)

  function avisar(msg, erro = false) {
    status.textContent = msg
    status.style.color = erro ? 'var(--dg-danger, #e5534b)' : ''
  }

  function mostrarFerramentas(f) {
    ferramentas.textContent = ''
    if (!f) return
    const nomes = Object.keys(f)
    const prontas = nomes.filter((n) => f[n]?.ok)
    ferramentas.textContent =
      'Ferramentas gratuitas: ' +
      (prontas.length ? prontas.join(', ') : 'nenhuma externa detectada') +
      (nomes.includes('ghidra') ? ' · Ghidra ' + (f.ghidra.ok ? 'ok' : 'ausente') : '')
  }

  function linhaEvidencia(e) {
    const div = document.createElement('div')
    div.className = 'reversa-ev'
    const tipo = document.createElement('span')
    tipo.className = 'reversa-ev-tipo'
    tipo.textContent = e.tipo
    const valor = document.createElement('span')
    valor.className = 'reversa-ev-valor'
    valor.textContent = e.valor.length > 220 ? e.valor.slice(0, 220) + '…' : e.valor
    div.append(tipo, valor)
    return div
  }

  function mostrarResultado(r) {
    resultado.textContent = ''
    if (!r) return
    const p = document.createElement('p')
    p.style.cssText = 'font-size:12px;margin:0 0 6px'
    p.textContent = (r.resumo || r.erro || 'sem resumo') + (r.caminhoRel ? ' · relatório: ' + r.caminhoRel : '')
    resultado.appendChild(p)
    const ev = document.createElement('details')
    const sum = document.createElement('summary')
    sum.textContent = 'Evidências (' + (r.evidencias || []).length + ')'
    sum.style.cursor = 'pointer'
    ev.appendChild(sum)
    const corpoEv = document.createElement('div')
    corpoEv.className = 'reversa-ev-lista'
    for (const e of (r.evidencias || []).slice(0, 300)) corpoEv.appendChild(linhaEvidencia(e))
    ev.appendChild(corpoEv)
    resultado.appendChild(ev)
    if (r.limitacoes?.length) {
      const lim = document.createElement('div')
      lim.className = 'reversa-limitacoes muted'
      lim.textContent = 'Limitações: ' + r.limitacoes.join(' · ')
      resultado.appendChild(lim)
    }
    if (/\.asar$/i.test(alvo.value.trim())) {
      const btn = botao('Extrair conteúdo do ASAR')
      btn.addEventListener('click', async () => {
        btn.disabled = true
        avisar('Extraindo ASAR…')
        const x = await window.api.invoke('reversa:asar', { raiz, arquivo: alvo.value.trim() })
        btn.disabled = false
        if (!x?.ok) return avisar(x?.erro || 'falha ao extrair', true)
        avisar('Extraído: ' + x.destinoRel + ' · ' + x.arquivos + ' arquivo(s)')
        anunciar('ASAR extraído')
      })
      resultado.appendChild(btn)
    }
  }

  async function atualizarLista() {
    lista.textContent = ''
    const r = await window.api.invoke('reversa:relatorios', { raiz })
    const itens = r?.relatorios || []
    if (!itens.length) {
      const p = document.createElement('p')
      p.className = 'muted'
      p.textContent = 'Nenhum relatório ainda.'
      lista.appendChild(p)
      return
    }
    for (const item of itens.slice(0, 12)) {
      const linha = document.createElement('div')
      linha.className = 'reversa-item'
      const info = document.createElement('span')
      info.textContent =
        item.nome + ' · ' + bytesTexto(item.bytes) + ' · ' + new Date(item.mtimeMs).toLocaleString('pt-BR')
      linha.appendChild(info)
      lista.appendChild(linha)
    }
  }

  async function analisar() {
    const valor = alvo.value.trim()
    if (!valor) return avisar('Informe um arquivo, pasta ou URL.', true)
    btnAnalisar.disabled = true
    avisar('Analisando… isso pode levar alguns segundos.')
    resultado.textContent = ''
    try {
      const r = await window.api.invoke('reversa:analisar', { raiz, alvo: valor })
      if (!r?.ok) {
        avisar(r?.erro || 'falha na análise', true)
        return
      }
      mostrarResultado(r)
      avisar('Análise concluída · ' + (r.tipo || '?') + ' · ' + (r.evidencias || []).length + ' evidência(s)')
      anunciar('Análise de engenharia reversa concluída')
      await atualizarLista()
    } catch (e) {
      avisar('Falha: ' + String(e), true)
    } finally {
      btnAnalisar.disabled = false
    }
  }

  btnEscolher.addEventListener('click', async () => {
    const r = await window.api.invoke('reversa:escolher')
    if (r?.ok && r.caminho) alvo.value = r.caminho
  })
  btnAnalisar.addEventListener('click', () => void analisar())
  btnPasta.addEventListener('click', () => void window.api.invoke('reversa:abrir-pasta', { raiz }))
  alvo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void analisar()
  })

  const fechar = () => modal.remove()
  btnFechar.addEventListener('click', fechar)
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) fechar()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar()
  })

  const st = await window.api.invoke('reversa:status')
  mostrarFerramentas(st?.ferramentas)
  await atualizarLista()
  alvo.focus()
  return modal
}
