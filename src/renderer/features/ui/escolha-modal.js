// escolha-modal.js — modal de reinício e diálogo de escolha (single/multi).
// Extraído de app.js. perguntarEscolha segue exposta em window.perguntarEscolha.

export function abrirModalReinicio(motivo) {
  var m = document.getElementById('modal-reinicio')
  if (!m) return
  var p = document.getElementById('reinicio-motivo')
  if (p)
    p.textContent =
      (motivo || 'Algumas alteracoes precisam de reinicio para serem aplicadas') +
      '. Deseja reiniciar agora?'
  m.classList.remove('hidden')
}

export function fecharModalReinicio() {
  var m = document.getElementById('modal-reinicio')
  if (m) m.classList.add('hidden')
}

export function perguntarEscolha(titulo, opcoes, config) {
  const multiplo = !!(config && config.multiplo)
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'escolha-overlay'
    const caixa = document.createElement('div')
    caixa.className = 'escolha-caixa'
    const h = document.createElement('h3')
    h.textContent = titulo
    h.style.cssText = 'margin:0 0 12px;font-size:15px;'
    caixa.appendChild(h)
    const selecionadas = new Set()
    opcoes.forEach((op) => {
      const btn = document.createElement('button')
      btn.textContent = op
      btn.className = 'btn-ghost'
      btn.style.cssText = 'display:block;width:100%;margin:6px 0;'
      if (multiplo) {
        btn.addEventListener('click', () => {
          if (selecionadas.has(op)) selecionadas.delete(op)
          else selecionadas.add(op)
          btn.style.background = selecionadas.has(op) ? 'var(--dg-active)' : ''
        })
      } else {
        btn.addEventListener('click', () => {
          overlay.remove()
          resolve([op])
        })
      }
      caixa.appendChild(btn)
    })
    if (multiplo) {
      const ok = document.createElement('button')
      ok.textContent = 'Confirmar'
      ok.className = 'btn-primary'
      ok.style.width = '100%'
      ok.style.marginTop = '12px'
      ok.addEventListener('click', () => {
        overlay.remove()
        resolve(Array.from(selecionadas))
      })
      caixa.appendChild(ok)
    }
    const cancelar = document.createElement('button')
    cancelar.textContent = 'Cancelar'
    cancelar.className = 'btn-ghost'
    cancelar.style.width = '100%'
    cancelar.addEventListener('click', () => {
      overlay.remove()
      resolve(null)
    })
    caixa.appendChild(cancelar)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(null)
      }
    })
    overlay.appendChild(caixa)
    document.body.appendChild(overlay)
  })
}

window.perguntarEscolha = perguntarEscolha
