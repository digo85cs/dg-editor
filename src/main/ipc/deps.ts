import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { access, stat, statfs } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { ollamaAlive, ollamaInstalado, startOllama } from '../ollama-keeper';
import { OLLAMA_URL } from '../brain/ollama';
import { CodigoErro, criarErro, type ErroApp } from '@shared/erros';
import { resolverRaizProjeto } from '../paths';

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

  ipcMain.handle('deps:diagnostico', async (_e, pastaAtual?: unknown) => {
    const root = resolverRaizProjeto();
    const pasta = typeof pastaAtual === 'string' && pastaAtual.trim() ? pastaAtual.trim() : null;
    const timeoutErro = criarErro(CodigoErro.ERR_UNKNOWN, 'Verificação excedeu o tempo limite.', 'Tente novamente.');
    const wrap = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch (err) {
        return (typeof fallback === 'object' && fallback ? { ...(fallback as object), ok: false, erro: criarErro(CodigoErro.ERR_UNKNOWN, 'Falha na verificação.', 'Tente novamente.', String(err instanceof Error ? err.message : err)) } : fallback) as T;
      }
    };

    const ollamaP = wrap(async () => {
      const vivo = await ollamaAlive().catch(() => false);
      const instalado = ollamaInstalado();
      const modelos: string[] = [];
      let modeloEscolhido = 'desconhecido';
      if (vivo) {
        try {
          const res = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(3500) });
          if (res.ok) {
            const j = await res.json() as { models?: { name?: string }[] };
            for (const m of (j.models || [])) if (m?.name) modelos.push(String(m.name));
            if (modelos[0]) modeloEscolhido = modelos[0];
          }
        } catch { /* ok parcial */ }
      }
      try {
        const { modeloParaTarefa } = await import('../brain/modelos-catalogo');
        const m = modeloParaTarefa(root, 'chat');
        if (m) modeloEscolhido = m;
      } catch { /* opcional */ }
      return { ativo: vivo, instalado, modelos, modeloEscolhido, ok: true as boolean, erro: undefined as ErroApp | undefined };
    }, { ativo: false, instalado: false, modelos: [] as string[], modeloEscolhido: 'desconhecido', ok: false, erro: timeoutErro });

    const discoP = wrap(async () => {
      const drive = process.platform === 'win32' ? (root.match(/^[A-Za-z]:/)?.[0] || 'C:') + '\\' : '/';
      const s = await statfs(drive);
      const livre = Math.floor((s.bavail * s.bsize) / (1024 * 1024));
      const min = 500;
      return { espacoLivreMB: livre, espacoMinimoMB: min, ok: livre >= min, erro: livre >= min ? undefined : criarErro(CodigoErro.ERR_UNKNOWN, 'Pouco espaço livre em disco.', 'Libere espaço e tente novamente.') };
    }, { espacoLivreMB: 0, espacoMinimoMB: 500, ok: false, erro: timeoutErro });

    const permP = wrap(async () => {
      if (!pasta) return { pastaAtual: null, ok: true, erro: undefined as ErroApp | undefined };
      try {
        await access(pasta, constants.R_OK);
        return { pastaAtual: pasta, ok: true, erro: undefined as ErroApp | undefined };
      } catch (e) {
        return { pastaAtual: pasta, ok: false, erro: criarErro(CodigoErro.ERR_FOLDER_PERMISSION, 'Sem permissão para acessar a pasta atual.', 'Escolha outro caminho.', String(e instanceof Error ? e.message : e)) };
      }
    }, { pastaAtual: pasta, ok: false, erro: timeoutErro });

    const encP = wrap(async () => new Promise<{ ok: boolean; achados: number; erro?: ErroApp }>((resolve) => {
      const script = path.join(root, 'scripts', 'verificar-encoding.mjs');
      const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += String(d)));
      child.stderr.on('data', (d) => (err += String(d)));
      child.on('error', (e) => resolve({ ok: false, achados: -1, erro: criarErro(CodigoErro.ERR_UNKNOWN, 'Não foi possível verificar encoding.', 'Confira scripts/verificar-encoding.mjs.', String(e.message || e)) }));
      child.on('close', (code) => {
        const m = (out + '\n' + err).match(/(\d+)\s+achado/);
        const achados = m ? Number(m[1]) : (code === 0 ? 0 : -1);
        resolve({ ok: code === 0 && achados === 0, achados });
      });
    }), { ok: false, achados: -1, erro: timeoutErro });

    const buildP = wrap(async () => {
      const pkgPath = path.join(root, 'package.json');
      const outPath = path.join(root, 'out', 'renderer', 'index.html');
      let versao = '0.0.0';
      try { const j = JSON.parse(await (await import('fs/promises')).readFile(pkgPath, 'utf8')) as { version?: string }; if (j.version) versao = j.version; } catch { /* */ }
      let timestamp = '';
      let ok = false;
      try { const st = await stat(outPath); timestamp = st.mtime.toISOString(); ok = true; } catch { timestamp = ''; ok = false; }
      return { ok, versao, timestamp, erro: ok ? undefined : criarErro(CodigoErro.ERR_UNKNOWN, 'Build não encontrado.', 'Execute npm run build.') };
    }, { ok: false, versao: '0.0.0', timestamp: '', erro: timeoutErro });

    const llmApiKey = !!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
    const pending = new Map<string, Promise<unknown>>([
      ['ollama', ollamaP], ['disco', discoP], ['permissaoPasta', permP], ['encoding', encP], ['build', buildP],
    ]);
    const out: Record<string, unknown> = { llmApiKey };
    const timer = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000));
    while (pending.size) {
      const tagged = Array.from(pending.entries()).map(([k, p]) => p.then((v) => ({ k, v } as const)));
      const raced = await Promise.race([Promise.race(tagged), timer]);
      if (raced === 'timeout') {
        for (const k of pending.keys()) out[k] = { ok: false, erro: timeoutErro };
        break;
      }
      out[raced.k] = raced.v;
      pending.delete(raced.k);
    }
    return out;
  });
}
