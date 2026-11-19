// Boot: token OpenClaw, sync de providers (OpenRouter) e botão "Iniciar Ollama".
import { mostrarToast } from './toast.js'
import { atualizarIndicadorDeps } from './deps-status.js'

const $ = (id) => document.getElementById(id)

/** Boot: OpenClaw token + OpenRouter (env/cofre) + status. */
export function iniciarStatusProviders(qaModoPromise) {
  void (async () => {
    const emQa = await qaModoPromise
    try {
      const oc = await window.api.invoke('openclaw:token-ensure')
      if (oc?.criado && !emQa) mostrarToast('Token OpenClaw criado automaticamente', 'ok')
    } catch { /* */ }
    try {
      await window.api.invoke('providers:sincronizar-env')
      let r = await window.api.invoke('providers:testar', { id: 'openrouter-north' })
      if (!r || r.ok === false) {
        r = await window.api.invoke('providers:testar', { id: 'openrouter-inkling' })
      }
      if (r && r.ok) {
        if (!emQa) mostrarToast('OpenRouter OK (' + (r.latenciaMs || '?') + ' ms)', 'ok')
        const sb = $('sb-ia')
        if (sb) {
          sb.textContent = 'IA: OpenRouter'
          sb.title = 'OpenRouter online'
        }
      } else if (!emQa) {
        // So avisa se NENHUM provider estiver disponivel — senao e falso alarme
        // (chat ja faz failover para o proximo provider configurado).
        let temDisponivel = false
        try {
          const fila = await window.api.invoke('providers:fila')
          temDisponivel = Array.isArray(fila?.fila) && fila.fila.some((p) => p.disponivel)
        } catch { /* se a checagem falhar, mantem o aviso */ temDisponivel = false }
        if (!temDisponivel) {
          const motivo = (r && r.erro) || 'chave inválida ou ausente'
          mostrarToast('OpenRouter: ' + motivo + ' — cole uma chave válida em Provedores IA', 'aviso')
        }
      }
    } catch (e) {
      /* silencioso se canal indisponível */
    }
  })()
}

export function ligarBotaoOllama() {
  $('btn-ollama-start')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    if (btn) { btn.disabled = true; btn.textContent = 'Iniciando…' }
    try {
      const r = await window.api.invoke('deps:ollama:start')
      if (r && r.ativo) {
        mostrarToast('Ollama iniciado.', 'ok')
      } else if (r && !r.instalado) {
        mostrarToast('Ollama não está instalado. Instale em ollama.com.', 'aviso')
      } else {
        mostrarToast('Não foi possível iniciar o Ollama. Tente "ollama serve" no terminal.', 'erro')
      }
    } catch (err) {
      mostrarToast('Falha ao iniciar Ollama: ' + String(err), 'erro')
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Iniciar Ollama' }
      try { atualizarIndicadorDeps(await window.api.invoke('deps:status')) } catch { /* */ }
    }
  })
}

/** Avisos transitórios de deps no boot (suprimidos em modo QA/e2e). */
export function avisarStatusDepsBoot(qaModoPromise) {
  void (async () => {
    try {
      const emQa = await qaModoPromise
      const st = await window.api.invoke('deps:status')
      if (st) {
        atualizarIndicadorDeps(st)
        if (!emQa && st.ollama === 'offline' && !st.llmApiKey && st.instalado) {
          mostrarToast('Ollama instalado, mas offline. Use "Iniciar Ollama" na barra de status ou rode "ollama serve".', 'aviso')
        } else if (!emQa && st.ollama === 'nao-instalado' && !st.llmApiKey) {
          mostrarToast('IA local: Ollama não instalado. Instale em ollama.com ou configure LLM_API_KEY.', 'aviso')
        }
      }
    } catch { /* ignora */ }
  })()
}
