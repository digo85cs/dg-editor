// janelas-flutuantes.js — Config / Contas: arrastar + sempre à frente
// Extraído de app.js (bloco "Janelas flutuantes").

let dgFloatZ = 20000

export function trazerJanelaFrente(modalEl) {
  if (!modalEl) return
  dgFloatZ += 1
  modalEl.style.zIndex = String(dgFloatZ)
}

export function limparPosicaoFloat(modalEl) {
  const box = modalEl?.querySelector('[data-float-box]')
  if (!box) return
  box.style.left = ''
  box.style.top = ''
}

export function abrirJanelaFlutuante(modalEl) {
  if (!modalEl) return
  modalEl.classList.remove('hidden')
  trazerJanelaFrente(modalEl)
}

export function ligarJanelaFlutuante(modalEl) {
  if (!modalEl || modalEl.dataset.floatBound) return
  modalEl.dataset.floatBound = '1'
  const box = modalEl.querySelector('[data-float-box]')
  const handle = modalEl.querySelector('[data-float-handle]')
  if (!box || !handle) return

  modalEl.addEventListener('mousedown', () => trazerJanelaFrente(modalEl), true)

  let dragging = false
  let ox = 0
  let oy = 0

  function onMove(e) {
    if (!dragging) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = box.getBoundingClientRect()
    let left = e.clientX - ox
    let top = e.clientY - oy
    const minVisible = 48
    left = Math.min(Math.max(left, -rect.width + minVisible), vw - minVisible)
    top = Math.min(Math.max(top, 0), vh - minVisible)
    box.style.left = left + 'px'
    box.style.top = top + 'px'
  }

  function onUp() {
    if (!dragging) return
    dragging = false
    box.classList.remove('is-dragging')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, a, input, select, textarea')) return
    trazerJanelaFrente(modalEl)
    const rect = box.getBoundingClientRect()
    // Fixa posição absoluta a partir do layout atual
    box.style.left = rect.left + 'px'
    box.style.top = rect.top + 'px'
    ox = e.clientX - rect.left
    oy = e.clientY - rect.top
    dragging = true
    box.classList.add('is-dragging')
    handle.setPointerCapture?.(e.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })
}

export function iniciarJanelasFlutuantes() {
  ligarJanelaFlutuante(document.getElementById('modal-config'))
  ligarJanelaFlutuante(document.getElementById('modal-contas'))
}
