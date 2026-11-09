import { ipcMain } from 'electron';
import { ollamaAlive, ollamaInstalado, startOllama } from '../ollama-keeper';
import { OLLAMA_URL } from '../brain/ollama';

export function registrarHandlersDeps(): void {
  ipcMain.handle('deps:status', async () => {
    const vivo = await ollamaAlive().catch(() => false);
    const instalado = ollamaInstalado();
    const llmApiKey = !!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
    let modelo = 'desconhecido';
    if (vivo) {
      try {
        const res = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const j = await res.json() as { models?: { name?: string }[] };
          const m = Array.isArray(j?.models) ? j.models[0]?.name : null;
          if (m) modelo = String(m);
        }
      } catch { /* ignora */ }
    }
    return { ok: true, ollama: vivo ? 'ativo' : (instalado ? 'offline' : 'nao-instalado'), instalado, vivo, llmApiKey, modelo, ollamaUrl: OLLAMA_URL };
  });

  ipcMain.handle('deps:ollama:start', async () => {
    const st = await startOllama().catch(() => ({ ativo: false, instalado: ollamaInstalado() }));
    return { ok: true, ...st };
  });
}
