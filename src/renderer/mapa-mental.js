/**
 * Editor de mapa mental (estilo MindNode) sobre outline Markdown.
 * O texto indentado é a fonte de verdade; o SVG é gerado no processo principal.
 */
import { anunciar } from './features/ui/live-region.js'

const MODELO =
  ['- Ideia central', '  - Objetivo', '    - Resultado esperado', '  - Público', '  - Próximos passos'].join(
    '\n'
  ) + '\n'

function botao(rotulo, classe = 'btn-small') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = classe
  b.textContent = rotulo
  return b
}

/**
 * @param {{ raiz?: string }} [opcoes]
 */
export async function abrirMapaMental(opcoes = {}) {
  const raiz = opcoes.raiz || ''
  const modal = document.createElement('div')
  modal.className = 'modal mapa-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Mapa mental')

  const box = document.createElement('div')
  box.className = 'modal-box mapa-modal-box'

  const head = document.createElement('div')
  head.className = 'mapa-head'
  const titulo = document.createElement('h3')
  titulo.textContent = 'Mapa mental'
  const nome = document.createElement('input')
  nome.type = 'text'
  nome.className = 'campo-busca'
  nome.placeholder = 'Nome do mapa'
  nome.setAttribute('aria-label', 'Nome do mapa')
  nome.value = 'Mapa ' + new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
  const selecao = document.createElement('select')
  selecao.setAttribute('aria-label', 'Mapas salvos')
  const btnCarregar = botao('Carregar')
  const btnSalvar = botao('Salvar', 'btn-small btn-primary')
  const btnExportar = botao('Exportar PNG')
  const btnFechar = botao('Fechar', 'btn-small btn-ghost')
  head.append(titulo, nome, selecao, btnCarregar, btnSalvar, btnExportar, btnFechar)

  const grade = document.createElement('div')
  grade.className = 'mapa-grid'
  const editor = document.createElement('textarea')
  editor.className = 'mapa-editor'
  editor.setAttribute('aria-label', 'Outline do mapa mental em Markdown indentado')
  editor.spellcheck = false
  editor.value = MODELO
  const preview = document.createElement('div')
  preview.className = 'mapa-preview'
  preview.setAttribute('aria-label', 'Prévia do mapa mental')
  grade.append(editor, preview)

  const status = document.createElement('div')
  status.className = 'mapa-status muted'
  status.setAttribute('role', 'status')
  status.textContent = 'Digite o outline à esquerda — cada indentação cria um nível.'

  box.append(head, grade, status)
  modal.appendChild(box)
  document.body.appendChild(modal)

  let svgAtual = ''
  let dimensoes = { largura: 0, altura: 0 }
  let timer = null
  let seq = 0

  function avisar(msg, erro = false) {
    status.textContent = msg
    status.style.color = erro ? 'var(--dg-danger, #e5534b)' : ''
    anunciar(msg, { urgencia: erro ? 'assertivo' : 'educado' })
  }

  async function atualizarPreview() {
    const outline = editor.value
    const id = ++seq
    try {
      const r = await window.api.invoke('mapas:svg', { outline, titulo: nome.value.trim() || undefined })
      if (id !== seq) return
      if (!r?.ok) {
        svgAtual = ''
        dimensoes = { largura: 0, altura: 0 }
        preview.innerHTML = '<span class="muted">Outline vazio — adicione um tópico.</span>'
        avisar(r?.erro || 'Não foi possível renderizar o mapa.', true)
        return
      }
      svgAtual = r.svg
      dimensoes = { largura: r.largura, altura: r.altura }
      preview.innerHTML = r.svg
      avisar(
        r.nos +
          ' tópicos · profundidade ' +
          r.profundidade +
          ' · ' +
          r.largura +
          '×' +
          r.altura +
          ' px'
      )
    } catch (e) {
      if (id !== seq) return
      avisar('Falha ao renderizar: ' + String(e), true)
    }
  }

  function agendarPreview() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void atualizarPreview(), 220)
  }

  async function atualizarLista() {
    try {
      const r = await window.api.invoke('mapas:listar', { raiz })
      const mapas = r?.mapas || []
      selecao.innerHTML = ''
      const vazio = document.createElement('option')
      vazio.value = ''
      vazio.textContent = mapas.length ? '— mapas salvos —' : '— nenhum mapa salvo —'
      selecao.appendChild(vazio)
      for (const m of mapas) {
        const op = document.createElement('option')
        op.value = m.nome
        op.textContent = m.nome + ' (' + m.nos + ')'
        selecao.appendChild(op)
      }
    } catch {
      /* lista é opcional */
    }
  }

  editor.addEventListener('input', agendarPreview)
  nome.addEventListener('input', agendarPreview)

  btnSalvar.addEventListener('click', async () => {
    const r = await window.api.invoke('mapas:salvar', {
      raiz,
      nome: nome.value,
      outline: editor.value
    })
    if (!r?.ok) {
      avisar(r?.erro || 'Não foi possível salvar.', true)
      return
    }
    avisar('Salvo: ' + r.nome + ' · ' + r.nos + ' tópicos')
    anunciar('Mapa mental salvo em ' + r.nome)
    await atualizarLista()
    selecao.value = r.nome
  })

  btnCarregar.addEventListener('click', async () => {
    const alvo = String(selecao.value || '').trim()
    if (!alvo) {
      avisar('Escolha um mapa salvo para carregar.', true)
      return
    }
    const r = await window.api.invoke('mapas:carregar', { raiz, nome: alvo })
    if (!r?.ok) {
      avisar(r?.erro || 'Falha ao carregar.', true)
      return
    }
    editor.value = r.outline
    nome.value = r.nome
    await atualizarPreview()
  })

  selecao.addEventListener('change', () => {
    if (selecao.value) nome.value = selecao.value
  })

  btnExportar.addEventListener('click', async () => {
    if (!svgAtual) {
      avisar('Nada para exportar — ajuste o outline primeiro.', true)
      return
    }
    const escala = Math.min(1, 1900 / Math.max(dimensoes.largura, dimensoes.altura))
    const largura = Math.max(64, Math.round(dimensoes.largura * escala))
    const altura = Math.max(64, Math.round(dimensoes.altura * escala))
    const svgEscalado = svgAtual.replace(
      /^<svg /,
      '<svg style="width:100%;height:auto;display:block" '
    )
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}</style></head><body>' +
      svgEscalado +
      '</body></html>'
    avisar('Exportando PNG…')
    const nomeArquivo = (nome.value.trim() || 'mapa').replace(/[<>:"/\\|?*]+/g, '-')
    const r = await window.api.invoke('midia:html-imagem', {
      raiz,
      html,
      largura,
      altura,
      fundo: '#ffffff',
      saida: '.dg-editor/mapas/' + nomeArquivo + '.png'
    })
    if (!r?.ok) {
      avisar(r?.erro || 'Falha ao exportar PNG.', true)
      return
    }
    avisar('PNG gerado: ' + r.caminhoRel + ' · ' + Math.round(r.bytes / 1024) + ' KB')
    anunciar('Mapa mental exportado em PNG')
  })

  const fechar = () => {
    if (timer) clearTimeout(timer)
    modal.remove()
  }
  btnFechar.addEventListener('click', fechar)
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) fechar()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar()
  })

  await atualizarLista()
  await atualizarPreview()
  editor.focus()
  editor.setSelectionRange(editor.value.length, editor.value.length)
  return modal
}
