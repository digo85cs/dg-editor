/**
 * Dispatch de automacao — implementa comandos locais seguros da allowlist.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { resolve, normalize } from 'path'
import { homedir, freemem, totalmem, cpus, uptime, platform, arch } from 'os'
import type { ComandoAutomacao } from './allowlist'
import type { ContextoExecucao } from './guard'
import { executarOffice } from './office-com'
import { executarBrowser } from './browser-cdp'

function pathPermitidoLeitura(caminho: string): boolean {
  const abs = normalize(resolve(String(caminho || '')))
  const lower = abs.toLowerCase()
  if (lower.includes('\\windows\\system32') || lower.includes('\\windows\\syswow64')) return false
  return true
}

function pathPermitidoEscrita(caminho: string): boolean {
  const abs = normalize(resolve(String(caminho || '')))
  const lower = abs.toLowerCase()
  const user = (process.env.USERPROFILE || homedir()).toLowerCase()
  if (lower.startsWith(user)) return true
  if (/^[a-z]:\\users\\/i.test(abs)) return true
  if (lower.startsWith('d:\\')) return true
  if (lower.startsWith('c:\\dev\\')) return true
  return false
}

export async function executarComandoDominio(
  cmd: ComandoAutomacao,
  args: Record<string, unknown>,
  _ctx: ContextoExecucao
): Promise<{ ok: boolean; dados?: unknown; erro?: string; comandoExecutado: string }> {
  const dominio = String(cmd.dominio || '')
  const id = String(cmd.id || '')

  try {
    if (dominio === 'windows' && id === 'windows.sistema.info') {
      return {
        ok: true,
        comandoExecutado: id,
        dados: {
          platform: platform(),
          arch: arch(),
          cpus: cpus().length,
          freemem: freemem(),
          totalmem: totalmem(),
          uptimeSec: Math.round(uptime()),
          home: homedir()
        }
      }
    }

    if (dominio === 'windows' && id === 'windows.arquivo.listar') {
      const caminho = String(args.caminho || '')
      if (!caminho || !pathPermitidoLeitura(caminho)) {
        return { ok: false, erro: 'caminho nao permitido', comandoExecutado: id }
      }
      const abs = resolve(caminho)
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        return { ok: false, erro: 'diretorio inexistente', comandoExecutado: id }
      }
      const itens = readdirSync(abs, { withFileTypes: true })
        .slice(0, 200)
        .map((e) => ({ nome: e.name, dir: e.isDirectory() }))
      return { ok: true, comandoExecutado: id, dados: { caminho: abs, itens } }
    }

    if (dominio === 'windows' && id === 'windows.arquivo.ler') {
      const caminho = String(args.caminho || '')
      if (!caminho || !pathPermitidoLeitura(caminho)) {
        return { ok: false, erro: 'caminho nao permitido', comandoExecutado: id }
      }
      const abs = resolve(caminho)
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        return { ok: false, erro: 'arquivo inexistente', comandoExecutado: id }
      }
      const st = statSync(abs)
      if (st.size > 512 * 1024) {
        return { ok: false, erro: 'arquivo > 512KB — use o Editor', comandoExecutado: id }
      }
      return {
        ok: true,
        comandoExecutado: id,
        dados: { caminho: abs, conteudo: readFileSync(abs, 'utf8').slice(0, 200000) }
      }
    }

    if (dominio === 'windows' && id === 'windows.processo.listar') {
      return {
        ok: true,
        comandoExecutado: id,
        dados: {
          nota: 'Use o Guardião / Task Manager. Lista detalhada exige PowerShell no Terminal do Bloco 3.',
          filtro: args.filtro || null
        }
      }
    }

    if (dominio === 'dg-editor') {
      return {
        ok: true,
        comandoExecutado: id,
        dados: {
          mensagem:
            'Comando DG Editor roteado: use a UI (abrir arquivo / salvar / chat). IPC nativo cobre o fluxo.',
          id,
          args
        }
      }
    }

    if (dominio === 'browser') {
      return await executarBrowser(id, args)
    }

    if (dominio === 'office') {
      return await executarOffice(id, args)
    }

    // eco diagnostico
    if (id === 'ping' || id === 'echo' || id === 'status') {
      return {
        ok: true,
        comandoExecutado: id,
        dados: { echo: args, em: new Date().toISOString() }
      }
    }

    return {
      ok: false,
      erro:
        'Comando ainda nao implementado: ' +
        dominio +
        '/' +
        id +
        '. Preferir Agent/chat ou Terminal no Bloco 3.',
      comandoExecutado: id
    }
  } catch (e) {
    return {
      ok: false,
      erro: String((e as Error)?.message || e),
      comandoExecutado: id
    }
  }
}
