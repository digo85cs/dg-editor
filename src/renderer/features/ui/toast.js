// toast.js — toast DOM simples (acima do composer, auto-dismiss 5s).
// Extraído de app.js; `window.dgToast` é atribuído pelo app.js para módulos legados.

export function mostrarToast(mensagem, tipo = 'aviso') {
  let host = document.getElementById('dg-toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'dg-toast-host'
    host.setAttribute('aria-live', 'polite')
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'dg-toast ' + (tipo === 'erro' ? 'erro' : tipo === 'ok' ? 'ok' : 'aviso')
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status')
  el.textContent = String(mensagem || '')
  host.appendChild(el)
  requestAnimationFrame(() => {
    el.classList.add('is-show')
  })
  setTimeout(() => {
    el.classList.remove('is-show')
    setTimeout(() => el.remove(), 250)
  }, 5000)
  return el
}
