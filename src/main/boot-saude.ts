import { dglog } from './dglog'

// Boot de saude das IAs (Fase 2): garante Ollama vivo no boot e loga o estado
export async function bootSaudeIAs(): Promise<{ ollama: boolean; modelos: number; chavesSync?: number }> {
  // Herda User env no Windows (Electron às vezes sobe sem elas)
  try {
    if (process.platform === 'win32') {
      const { execSync } = await import('child_process')
      const raw = execSync(
        "[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json -Compress",
        { shell: 'powershell.exe', encoding: 'utf8', windowsHide: true, timeout: 8000 }
      )
      const mapa = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(mapa || {})) {
        if (!process.env[k] && typeof v === 'string' && v.length) process.env[k] = v
      }
    }
  } catch (e) {
    dglog('[boot-saude] sync User env falhou: ' + String(e))
  }

  let chavesSync = 0
  try {
    const { sincronizarChavesDoAmbiente } = await import('./brain/providers-sync-env')
    const r = sincronizarChavesDoAmbiente()
    chavesSync = r.gravadas.length
    dglog('[boot-saude] chaves sync env→cofre: ' + chavesSync + ' novas; ja=' + r.jaTinham.length)
  } catch (e) {
    dglog('[boot-saude] sync chaves falhou: ' + String(e))
  }

  const { ensureOllama } = await import('./ollama-keeper')
  const ok = await ensureOllama()
  let modelos = 0
  if (ok) {
    try {
      const { getBrain } = await import('./brain/module')
      const status = await getBrain().getOllamaStatus()
      modelos = status.models.length
      try {
        const { resolverRaizProjeto } = await import('./paths')
        const { detectarModelosLocais } = await import('./brain/modelos-catalogo')
        await detectarModelosLocais(resolverRaizProjeto())
      } catch { /* ignora sync catalogo */ }
    } catch { /* ignora */ }
  }
  dglog('[boot-saude] Ollama: ' + (ok ? 'no ar' : 'INDISPONIVEL') + ' - modelos: ' + modelos)
  return { ollama: ok, modelos, chavesSync }
}
