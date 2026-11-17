// anexos.js — anexos do composer do chat (preview + input file → base64).
// Extraído de app.js. Estado encapsulado; usar obterAnexosChat()/limparAnexosChat().

let chatAnexos = []

export function obterAnexosChat() {
  return chatAnexos
}

export function limparAnexosChat() {
  chatAnexos = []
  renderizarAnexosChat()
}

export function renderizarAnexosChat() {
  const bar = document.getElementById('chat-anexos-preview')
  if (!bar) return
  if (!chatAnexos.length) {
    bar.style.display = 'none'
    bar.innerHTML = ''
    return
  }
  bar.style.display = 'flex'
  bar.innerHTML = ''
  for (let i = 0; i < chatAnexos.length; i++) {
    const a = chatAnexos[i]
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--border);padding:4px 6px;border-radius:6px'
    const txt = document.createElement('span')
    txt.textContent = a.nome + (a.tamanho ? ' (' + Math.round(a.tamanho / 1024) + 'KB)' : '')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn-ghost'
    btn.textContent = '×'
    btn.onclick = () => {
      chatAnexos.splice(i, 1)
      renderizarAnexosChat()
    }
    el.appendChild(txt)
    el.appendChild(btn)
    bar.appendChild(el)
  }
}

/** Anexar: abre via popover de contexto (initChatIconContext). Chamar uma vez. */
export function ligarAnexosChat() {
  document.getElementById('chat-anexos-input')?.addEventListener('change', async (e) => {
    const input = e.target
    const files = Array.from(input.files || [])
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        const passo = 8192
        for (let i = 0; i < bytes.length; i += passo) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo))
        }
        const base64 = btoa(bin)
        chatAnexos.push({
          nome: f.name,
          tipo: f.type || '',
          tamanho: f.size,
          data: base64
        })
      } catch {}
    }
    input.value = ''
    renderizarAnexosChat()
  })
}
