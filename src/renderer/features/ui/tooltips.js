// Tooltips ricos (hover com delay) para botões com title/data-tip.
export function initTooltipsRicos() {
  if (document.body.dataset.tipsWired === '1') return
  document.body.dataset.tipsWired = '1'
  let tip = document.getElementById('dg-rich-tip')
  if (!tip) {
    tip = document.createElement('div')
    tip.id = 'dg-rich-tip'
    tip.className = 'dg-tip'
    tip.setAttribute('role', 'tooltip')
    document.body.appendChild(tip)
  }
  let timer = 0
  const esconder = () => {
    tip.classList.remove('is-show')
  }
  const mostrar = (el, texto) => {
    if (!texto) return
    const r = el.getBoundingClientRect()
    tip.textContent = texto
    tip.classList.add('is-show')
    const naRail = !!el.closest('#activity-bar')
    requestAnimationFrame(() => {
      const h = tip.offsetHeight || 28
      const w = tip.offsetWidth || 120
      if (naRail) {
        tip.style.left = Math.min(window.innerWidth - w - 8, r.right + 10) + 'px'
        tip.style.top = Math.max(8, r.top + (r.height - h) / 2) + 'px'
      } else {
        tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left)) + 'px'
        let top = r.top - 8 - h
        if (top < 8) top = r.bottom + 8
        tip.style.top = top + 'px'
      }
    })
  }
  document.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const el = t.closest(
        'button[title], .btn-icon[title], .ab-btn[data-tip], .tool-nav-btn[title], .chat-ctx-btn[title], .mb-btn[title], .right-tab[title]'
      )
      if (!el) return
      const texto = el.getAttribute('data-tip') || el.getAttribute('title') || ''
      if (!texto) return
      clearTimeout(timer)
      timer = window.setTimeout(() => mostrar(el, texto), 380)
    },
    true
  )
  document.addEventListener('mouseout', (e) => {
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.closest('button[title], .btn-icon[title], .ab-btn[data-tip], .tool-nav-btn[title], .chat-ctx-btn[title]')) {
      clearTimeout(timer)
      esconder()
    }
  }, true)
  document.addEventListener('scroll', esconder, true)
}
