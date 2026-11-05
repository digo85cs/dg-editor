/**
 * Registro central de comandos (plugável).
 * Novos módulos chamam registrarComando sem tocar na UI da paleta.
 */
/** @type {Map<string, { id: string, titulo: string, atalho?: string, fn: () => void }>} */
const registry = new Map()

export function registrarComando(cmd) {
  if (!cmd || !cmd.id || typeof cmd.fn !== 'function') return
  registry.set(cmd.id, {
    id: cmd.id,
    titulo: cmd.titulo || cmd.id,
    atalho: cmd.atalho,
    fn: cmd.fn
  })
}

export function listarComandosLocais() {
  return [...registry.values()].map((c) => ({
    id: c.id,
    titulo: c.titulo,
    atalho: c.atalho
  }))
}

export function executarComandoLocal(id) {
  const c = registry.get(id)
  if (!c) return false
  c.fn()
  return true
}

export function obterComando(id) {
  return registry.get(id) || null
}
