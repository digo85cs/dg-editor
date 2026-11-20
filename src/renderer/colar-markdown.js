/**
 * Prévia de "colar como Markdown" quando não há editor de texto ativo.
 * Mostra o resultado convertido e permite copiar de volta para o clipboard.
 */
import { anunciar } from './features/ui/live-region.js'

export function abrirColarMarkdown(markdown, origem = 'html') {
  const modal = document.createElement('div')
  modal.className = 'modal colar-md-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Colar como Markdown')

  const box = document.createElement('div')
  box.className = 'modal-box colar-md-box'

  const titulo = document.createElement('h3')
  titulo.textContent = 'Colar como Markdown'
  const info = document.createElement('p')
  info.className = 'muted colar-md-info'
  info.textContent =
    origem === 'html'
      ? 'HTML da área de transferência convertido em Markdown.'
      : 'A área de transferência tinha apenas texto — mantido como está.'

  const area = document.createElement('textarea')
  area.className = 'colar-md-area'
  area.readOnly = true
  area.value = String(markdown || '')
  area.setAttribute('aria-label', 'Markdown gerado')
  area.rows = 14

  const rodape = document.createElement('div')
  rodape.className = 'colar-md-acoes'
  const btnCopiar = document.createElement('button')
  btnCopiar.type = 'button'
  btnCopiar.className = 'btn-small btn-primary'
  btnCopiar.textContent = 'Copiar Markdown'
  const btnFechar = document.createElement('button')
  btnFechar.type = 'button'
  btnFechar.className = 'btn-small btn-ghost'
  btnFechar.textContent = 'Fechar'
  rodape.append(btnCopiar, btnFechar)

  btnCopiar.addEventListener('click', async () => {
    try {
      const r = await window.api.invoke('clipboard:gravar', { texto: area.value })
      if (!r?.ok) throw new Error(r?.erro || 'falha ao copiar')
      btnCopiar.textContent = 'Copiado'
      anunciar('Markdown copiado para a área de transferência')
      setTimeout(() => {
        btnCopiar.textContent = 'Copiar Markdown'
      }, 1600)
    } catch {
      area.select()
      document.execCommand?.('copy')
    }
  })
  btnFechar.addEventListener('click', () => modal.remove())

  box.append(titulo, info, area, rodape)
  modal.appendChild(box)
  document.body.appendChild(modal)
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) modal.remove()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') modal.remove()
  })
  area.focus()
  area.select()
  return modal
}
