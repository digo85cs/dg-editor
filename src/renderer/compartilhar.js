/**
 * Compartilhamento local (estilo AirDrop): mostra a URL LAN, inicia/para o
 * servidor de upload e lista os arquivos recebidos no projeto.
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
export async function abrirCompartilhamento(opcoes = {}) {
  if (document.querySelector('.share-modal')) return null
  const raiz = opcoes.raiz || ''

  const modal = document.createElement('div')
  modal.className = 'modal share-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Compartilhar arquivos na rede local')

  const box = document.createElement('div')
  box.className = 'modal-box share-modal-box'

  const head = document.createElement('div')
  head.className = 'share-head'
  const titulo = document.createElement('h3')
  titulo.textContent = 'Receber arquivos do celular (rede local)'
  const btnFechar = botao('Fechar', 'btn-small btn-ghost')
  head.append(titulo, btnFechar)

  const descricao = document.createElement('p')
  descricao.className = 'muted'
  descricao.style.cssText = 'font-size:12px;margin:0 0 8px'
  descricao.textContent =
    'Abra a URL no celular (mesma rede Wi-Fi), escolha os arquivos e envie. Eles aparecem em .dg-editor/recebidos.'

  const url = document.createElement('div')
  url.className = 'share-url'
  url.setAttribute('aria-live', 'polite')
  url.textContent = 'Compartilhamento parado.'

  const barra = document.createElement('div')
  barra.className = 'share-barra'
  const btnIniciar = botao('Iniciar', 'btn-small btn-primary')
  const btnParar = botao('Parar')
  const btnCopiar = botao('Copiar endereço')
  const btnPasta = botao('Abrir pasta de recebidos')
  barra.append(btnIniciar, btnParar, btnCopiar, btnPasta)

  const status = document.createElement('div')
  status.className = 'share-status muted'
  status.setAttribute('role', 'status')
  status.textContent = 'O servidor fica ativo só enquanto o DG Editor estiver aberto.'

  const listaTitulo = document.createElement('h4')
  listaTitulo.textContent = 'Recebidos'
  const lista = document.createElement('div')
  lista.className = 'share-lista'

  box.append(head, descricao, url, barra, status, listaTitulo, lista)
  modal.appendChild(box)
  document.body.appendChild(modal)

  let ativo = false
  let endereco = ''
  let timer = null

  function avisar(msg, erro = false) {
    status.textContent = msg
    status.style.color = erro ? 'var(--dg-danger, #e5534b)' : ''
    anunciar(msg, { urgencia: erro ? 'assertivo' : 'educado' })
  }

  async function atualizarLista() {
    const r = await window.api.invoke('compartilhar:listar', { raiz })
    const itens = r?.recebidos || []
    lista.textContent = ''
    if (!itens.length) {
      const p = document.createElement('p')
      p.className = 'muted'
      p.textContent = 'Nenhum arquivo recebido ainda.'
      lista.appendChild(p)
      return
    }
    for (const item of itens) {
      const linha = document.createElement('div')
      linha.className = 'share-item'
      const info = document.createElement('span')
      info.textContent =
        item.nome + ' · ' + bytesTexto(item.bytes) + ' · ' + new Date(item.mtimeMs).toLocaleString('pt-BR')
      linha.appendChild(info)
      lista.appendChild(linha)
    }
  }

  async function atualizarEstado() {
    const r = await window.api.invoke('compartilhar:status', { raiz })
    ativo = !!r?.ativo
    endereco = r?.url || ''
    if (ativo) {
      url.textContent = endereco
      btnIniciar.disabled = true
      btnParar.disabled = false
      btnCopiar.disabled = false
      avisar('Compartilhamento ativo em ' + endereco)
    } else {
      url.textContent = 'Compartilhamento parado.'
      btnIniciar.disabled = false
      btnParar.disabled = true
      btnCopiar.disabled = true
    }
    await atualizarLista()
  }

  btnIniciar.addEventListener('click', async () => {
    btnIniciar.disabled = true
    avisar('Iniciando servidor…')
    const r = await window.api.invoke('compartilhar:iniciar', { raiz })
    if (!r?.ok) {
      avisar(r?.erro || 'Não foi possível iniciar.', true)
      btnIniciar.disabled = false
      return
    }
    anunciar('Servidor de recebimento iniciado')
    await atualizarEstado()
    if (!timer) timer = setInterval(() => void atualizarLista(), 2500)
  })

  btnParar.addEventListener('click', async () => {
    await window.api.invoke('compartilhar:parar')
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    anunciar('Compartilhamento encerrado')
    await atualizarEstado()
    avisar('Compartilhamento encerrado.')
  })

  btnCopiar.addEventListener('click', async () => {
    if (!endereco) return
    try {
      await navigator.clipboard.writeText(endereco)
      avisar('Endereço copiado: ' + endereco)
    } catch {
      avisar('Não foi possível copiar — selecione o endereço manualmente.', true)
    }
  })

  btnPasta.addEventListener('click', () => void window.api.invoke('compartilhar:abrir-pasta', { raiz }))

  const fechar = () => {
    if (timer) clearInterval(timer)
    timer = null
    modal.remove()
  }
  btnFechar.addEventListener('click', fechar)
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) fechar()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar()
  })

  await atualizarEstado()
  if (ativo && !timer) timer = setInterval(() => void atualizarLista(), 2500)
  btnIniciar.focus()
  return modal
}
