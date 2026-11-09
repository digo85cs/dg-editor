/** @param {{key:string,shiftKey?:boolean,preventDefault?:()=>void}} e */
export function deveEnviarPorEnter(e) {
  return !!e && e.key === 'Enter' && !e.shiftKey
}

export function iniciarComposer(inputEl, deps) {
  if (!inputEl) return { dispose() {} }
  const onKeydown = (e) => {
    if (deveEnviarPorEnter(e)) {
      e.preventDefault?.()
      deps?.onEnviar?.()
    }
  }
  inputEl.addEventListener('keydown', onKeydown)
  return { dispose() { inputEl.removeEventListener('keydown', onKeydown) } }
}
