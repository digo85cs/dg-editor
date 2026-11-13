import { ipcMain } from 'electron'
import { resolve } from 'path'
import {
  caminhoSeguro,
  exigirArrayStrings,
  exigirBoolean,
  exigirObjeto,
  exigirString,
  isErroPayload
} from '../ipc-seguro'
import { criarCheckpoint, listarCheckpoints, restaurarCheckpoint, ultimoCheckpoint } from './checkpoint'
import { registrarSimbolosIpc } from '../simbolos-ipc'
import { expandirMencoes } from './mencoes'
import { orquestrarAgentes } from './orquestrador'
import { cancelarFilaAgente, enfileirarAgente, statusFilaAgente } from './fila'
import { executarAgente } from '../brain/agent'
import { emSafeMode } from '../safe-mode'
import { criarAgente, listarAgentes } from '../brain/agentes'
import { statusAgentesExternos } from '../brain/agentesExternos'
import { getRaizVault } from '../vault/indice'
import { listarModos, salvarModos } from '../modes'
import { obterPermissoes, salvarPermissoes } from '../permissoes'
import { montarContextoProjeto } from './contexto-projeto'
import { montarContextoImplicito } from './contexto-implicito'
import {
  salvarPlano,
  lerPlano,
  limparPlano,
  marcarPasso,
  atualizarPassos,
  proximoPassoPendente,
  type PassoPlano
} from './plano'
import {
  aplicarPropostaComCheckpoint,
  listarPendentes,
  marcarRejeitado
} from './propostas'
import {
  listarHunksPendente,
  definirHunksPendente,
  previewPendente
} from '../openclaw/diffs'
import {
  rodarTypecheck,
  rodarTestes,
  listarDiagnosticosRecentes,
  registrarDiagnosticoManual
} from './diagnosticos'
import { gerarContinuidade, dossieDirDoApp } from '../bridge-adapta'

type AbaCtx = {
  path: string
  conteudo?: string
  ativa?: boolean
}

function parseAbas(raw: unknown): AbaCtx[] {
  if (!Array.isArray(raw)) return []
  const out: AbaCtx[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    if (typeof o.path !== 'string') continue
    out.push({
      path: o.path,
      conteudo: typeof o.conteudo === 'string' ? o.conteudo : undefined,
      ativa: o.ativa === true
    })
  }
  return out
}

type EscopoAgent = { raiz: string; pastas: string[] }

function validarEscopoAgent(raizRaw: unknown, pastasRaw: unknown): EscopoAgent | { ok: false; erro: string } {
  const raiz = exigirString(raizRaw, 'raiz')
  if (isErroPayload(raiz)) return raiz
  const pastas = exigirArrayStrings(pastasRaw, 'pastas')
  if (isErroPayload(pastas)) return pastas
  const permitidas = pastas.map((p) => p.trim()).filter(Boolean)
  if (!permitidas.length) return { ok: false, erro: 'nenhuma pasta aberta' }
  const segura = caminhoSeguro(raiz, permitidas)
  if (!segura.ok) return { ok: false, erro: segura.erro }
  return { raiz: segura.abs, pastas: permitidas }
}

function emitirProgresso(event: Electron.IpcMainInvokeEvent, ev: unknown): void {
  try {
    if (!event.sender.isDestroyed()) event.sender.send('agente:progresso', ev)
  } catch {
    /* a janela pode fechar durante a execução */
  }
}

export function registerAgentExtrasIpc(): void {
  ipcMain.handle('agente:checkpoint-criar', async (_e, arquivos: unknown, origem?: unknown, pastasRaw?: unknown) => {
    if (!Array.isArray(arquivos) || !arquivos.every((x) => typeof x === 'string')) {
      return { ok: false, erro: 'arquivos deve ser string[]' }
    }
    const pastas = exigirArrayStrings(pastasRaw, 'pastas')
    if (isErroPayload(pastas)) return pastas
    const raizes = pastas.map((p) => p.trim()).filter(Boolean)
    if (raizes.length) {
      const seguros: string[] = []
      for (const a of arquivos as string[]) {
        const seg = caminhoSeguro(a, raizes)
        if (!seg.ok) return { ok: false, erro: 'arquivo fora da raiz aberta: ' + a }
        seguros.push(seg.abs)
      }
      const ck = await criarCheckpoint(seguros, typeof origem === 'string' ? origem : 'manual')
      return { ok: true, checkpoint: ck }
    }
    const ck = await criarCheckpoint(arquivos as string[], typeof origem === 'string' ? origem : 'manual')
    return { ok: true, checkpoint: ck }
  })

  ipcMain.handle('agente:checkpoint-listar', (_e, limite?: unknown) => {
    const n = typeof limite === 'number' ? limite : 10
    return { ok: true, checkpoints: listarCheckpoints(n) }
  })

  ipcMain.handle('agente:checkpoint-restaurar', async (_e, id: unknown, pastasRaw?: unknown) => {
    const i = exigirString(id, 'id')
    if (isErroPayload(i)) return i
    const pastas = exigirArrayStrings(pastasRaw, 'pastas')
    if (isErroPayload(pastas)) return pastas
    const raizes = pastas.map((p) => p.trim()).filter(Boolean)
    return restaurarCheckpoint(i, raizes.length ? raizes : undefined)
  })

  ipcMain.handle('agente:checkpoint-desfazer', async (_e, pastasRaw?: unknown) => {
    const pastas = exigirArrayStrings(pastasRaw, 'pastas')
    if (isErroPayload(pastas)) return pastas
    const raizes = pastas.map((p) => p.trim()).filter(Boolean)
    const u = ultimoCheckpoint()
    if (!u) return { ok: false, erro: 'nenhum checkpoint pendente de desfazer' }
    const r = await restaurarCheckpoint(u.id, raizes.length ? raizes : undefined)
    return { ...r, checkpointId: u.id, origem: u.origem, arquivos: u.arquivos.map((a) => a.path) }
  })

  ipcMain.handle('dg:modes:listar', () => ({ ok: true, modos: listarModos() }))
  ipcMain.handle('dg:modes:salvar', (_e, modos) => salvarModos(modos as any))
  ipcMain.handle('dg:permissoes:obter', () => ({ ok: true, permissoes: obterPermissoes() }))
  ipcMain.handle('dg:permissoes:salvar', (_e, p) => salvarPermissoes(p as any))

  try { registrarSimbolosIpc() } catch(e) { console.warn('[simbolos-ipc]', e) }

  ipcMain.handle('contexto:projeto', async (_e, raiz: unknown, consulta?: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    const q = typeof consulta === 'string' ? consulta : undefined
    return { ok: true, texto: await montarContextoProjeto(r, q), vault: getRaizVault() }
  })

  ipcMain.handle(
    'agente:orquestrar',
    async (_e, raiz: unknown, pedido: unknown, filaIds?: unknown) => {
      if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
      const r = exigirString(raiz, 'raiz')
      if (isErroPayload(r)) return r
      const p = exigirString(pedido, 'pedido')
      if (isErroPayload(p)) return p
      const fila = Array.isArray(filaIds) ? filaIds.filter((x): x is string => typeof x === 'string') : undefined
      const exp = await expandirMencoes({ raiz: r, pergunta: p })
      return enfileirarAgente(r, async (signal) => {
        if (signal.aborted) throw new Error('cancelado pelo usuario')
        return orquestrarAgentes(r, exp.perguntaLimpa, fila, exp.contextoExtra || undefined)
      }).catch((err: any) => ({ ok: false, erro: String((err as Error).message || err) }))
    }
  )

  ipcMain.handle('agente:listar', (_e, raiz: unknown) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    return {
      ok: true,
      agentes: listarAgentes(r).map((a: any) => ({ id: a.id, nome: a.nome, especialidade: a.especialidade }))
    }
  })

  ipcMain.handle('agente:criar', (_e, raiz: unknown, payload: unknown = {}) => {
    const r = exigirString(raiz, 'raiz')
    if (isErroPayload(r)) return r
    const o = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    const nome = exigirString(o.nome, 'nome')
    if (isErroPayload(nome)) return nome
    const skillsRaw = typeof o.skills === 'string' ? o.skills : ''
    const skills = skillsRaw
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean)
    return criarAgente(r, {
      nome,
      especialidade: typeof o.especialidade === 'string' ? o.especialidade : undefined,
      skills,
      system: typeof o.system === 'string' ? o.system : undefined
    })
  })

  ipcMain.handle('agente:pedir', async (event, payload: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    const o = exigirObjeto(payload, 'pedido')
    if (isErroPayload(o)) return o
    const escopo = validarEscopoAgent(o.raiz, o.pastas)
    if ('ok' in escopo) return escopo
    const pergunta = exigirString(o.pergunta, 'pergunta')
    if (isErroPayload(pergunta)) return pergunta
    if (!pergunta.trim()) return { ok: false, erro: 'pedido vazio' }
    const modo = o.modo === undefined ? 'agent' : o.modo
    if (modo !== 'agent' && modo !== 'plan') return { ok: false, erro: 'modo invalido' }
    const proposeWrites = exigirBoolean(o.proposeWrites, 'proposeWrites', true)
    if (isErroPayload(proposeWrites)) return proposeWrites
    // Autonomia v1: verify ligado por padrao no modo agent
    const verificarApos = exigirBoolean(o.verificarApos, 'verificarApos', true)
    if (isErroPayload(verificarApos)) return verificarApos
    const incluirGit = exigirBoolean(o.incluirGit, 'incluirGit', true)
    if (isErroPayload(incluirGit)) return incluirGit

    const ativoRaw = typeof o.arquivoAtivo === 'string' ? o.arquivoAtivo : ''
    const ativoSeguro = ativoRaw ? caminhoSeguro(ativoRaw, escopo.pastas) : null
    if (ativoSeguro && !ativoSeguro.ok) return { ok: false, erro: ativoSeguro.erro }
    const arquivoAtivo = ativoSeguro?.ok ? ativoSeguro.abs : undefined
    const abas = parseAbas(o.abas)
      .filter((aba) => caminhoSeguro(aba.path, escopo.pastas).ok)
      .slice(0, 12)
    const selecao = typeof o.selecao === 'string' ? o.selecao.slice(0, 8000) : ''
    const errosEditor = typeof o.errosEditor === 'string' ? o.errosEditor.slice(0, 8000) : ''
    const expansao = await expandirMencoes({
      raiz: escopo.raiz,
      pergunta,
      selecao,
      arquivoAtivo,
      pastas: escopo.pastas
    })
    const contextoImplicito = await montarContextoImplicito({
      raiz: escopo.raiz,
      abas,
      incluirGit,
      incluirDiagnosticos: true,
      errosEditor
    })
    const contextoExtra = [expansao.contextoExtra, contextoImplicito].filter(Boolean).join('\n\n')
    const agente = typeof o.agente === 'string' && o.agente.trim() ? o.agente.trim() : undefined

    return enfileirarAgente(escopo.raiz, async (signal) => {
      const onEvent = (ev: unknown) => emitirProgresso(event, ev)
      let resposta = await executarAgente(escopo.raiz, expansao.perguntaLimpa, {
        modo,
        agente,
        proposeWrites,
        pastas: escopo.pastas,
        contextoExtra,
        onEvent,
        signal
      })
      let diagnostico
      const propostasAgente = Array.isArray(resposta?.propostas) ? resposta.propostas : []
      // Verify só com edição real — evita typecheck em todo turno (lentidão).
      if (verificarApos && modo === 'agent' && !signal.aborted && propostasAgente.length > 0) {
        const { rodarVerifyAposAgente } = await import('./verify-apos')
        const v = await rodarVerifyAposAgente({
          raiz: escopo.raiz,
          pastas: escopo.pastas,
          agente,
          contextoExtra,
          signal,
          onEvent,
          resposta
        })
        resposta = v.resposta
        diagnostico = v.diagnostico
      }
      if (modo === 'plan' && resposta.texto) {
        salvarPlano({
          texto: resposta.texto,
          raiz: escopo.raiz,
          salvoEm: new Date().toISOString(),
          agente
        })
      }
      return {
        ...resposta,
        ok: resposta.ok !== false,
        fila: statusFilaAgente(escopo.raiz),
        diagnostico,
        plano: modo === 'plan' ? lerPlano() : undefined
      }
    }).catch((err: unknown) => ({ ok: false, erro: String((err as Error)?.message || err) }))
  })

  ipcMain.handle('agente:plano-ler', () => ({ ok: true, plano: lerPlano() }))

  ipcMain.handle('agente:plano-salvar', (_e, payload: unknown) => {
    const o = exigirObjeto(payload, 'plano')
    if (isErroPayload(o)) return o
    const escopo = validarEscopoAgent(o.raiz, o.pastas)
    if ('ok' in escopo) return escopo
    const texto = exigirString(o.texto, 'texto')
    if (isErroPayload(texto)) return texto
    if (!texto.trim()) return { ok: false, erro: 'plano vazio' }
    const agente = typeof o.agente === 'string' ? o.agente : undefined
    salvarPlano({ texto, raiz: escopo.raiz, salvoEm: new Date().toISOString(), agente })
    return { ok: true, plano: lerPlano() }
  })

  ipcMain.handle('agente:plano-limpar', () => {
    limparPlano()
    return { ok: true }
  })

  ipcMain.handle('agente:plano-atualizar-passos', (_e, passosRaw: unknown) => {
    if (!Array.isArray(passosRaw)) return { ok: false, erro: 'passos deve ser uma lista' }
    const passos: PassoPlano[] = []
    for (const item of passosRaw.slice(0, 40)) {
      if (!item || typeof item !== 'object') return { ok: false, erro: 'passo invalido' }
      const p = item as Record<string, unknown>
      if (typeof p.id !== 'string' || typeof p.texto !== 'string' || typeof p.feito !== 'boolean') {
        return { ok: false, erro: 'passo deve ter id, texto e feito validos' }
      }
      passos.push({
        id: p.id.slice(0, 64),
        texto: p.texto.slice(0, 500),
        feito: p.feito,
        checkpointId: typeof p.checkpointId === 'string' ? p.checkpointId.slice(0, 128) : undefined
      })
    }
    const plano = atualizarPassos(passos)
    return plano ? { ok: true, plano } : { ok: false, erro: 'nenhum plano salvo' }
  })

  ipcMain.handle('agente:plano-marcar-passo', (_e, passoId: unknown, feitoRaw: unknown) => {
    const id = exigirString(passoId, 'passoId')
    if (isErroPayload(id)) return id
    const feito = exigirBoolean(feitoRaw, 'feito')
    if (isErroPayload(feito)) return feito
    const plano = marcarPasso(id, feito)
    return plano ? { ok: true, plano } : { ok: false, erro: 'passo nao encontrado' }
  })

  ipcMain.handle('agente:executar-plano', async (event, payload: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    const o = exigirObjeto(payload, 'plano')
    if (isErroPayload(o)) return o
    const escopo = validarEscopoAgent(o.raiz, o.pastas)
    if ('ok' in escopo) return escopo
    const soProximo = exigirBoolean(o.soProximo, 'soProximo', false)
    if (isErroPayload(soProximo)) return soProximo
    const plano = lerPlano()
    if (!plano?.passos?.length) return { ok: false, erro: 'nenhum plano salvo' }
    if (resolve(plano.raiz).toLowerCase() !== resolve(escopo.raiz).toLowerCase()) {
      return { ok: false, erro: 'o plano salvo pertence a outra pasta' }
    }
    const pendentes = plano.passos.filter((p) => !p.feito)
    const selecionados = soProximo ? [proximoPassoPendente()].filter((p): p is PassoPlano => !!p) : pendentes
    if (!selecionados.length) return { ok: false, erro: 'nao ha passos pendentes' }
    const contextoExtra = await montarContextoImplicito({ raiz: escopo.raiz, incluirGit: true })

    return enfileirarAgente(escopo.raiz, async (signal) => {
      const inicio = Date.now()
      const rastros: Awaited<ReturnType<typeof executarAgente>>['passos'] = []
      const propostas: NonNullable<Awaited<ReturnType<typeof executarAgente>>['propostas']> = []
      const textos: string[] = []
      let ultimo: Awaited<ReturnType<typeof executarAgente>> | undefined
      let passoExecutado: PassoPlano | undefined

      for (const passo of selecionados) {
        if (signal.aborted) return { ok: false, erro: 'execucao cancelada', passos: rastros, propostas }
        emitirProgresso(event, { tipo: 'status', texto: 'Executando passo: ' + passo.texto })
        const resposta = await executarAgente(
          escopo.raiz,
          'Execute este passo do plano salvo. Preserve o escopo e gere propostas para as alteracoes.\n\n' +
            'Plano:\n' + plano.texto.slice(0, 7000) + '\n\nPasso selecionado:\n' + passo.texto,
          {
            modo: 'agent',
            agente: plano.agente,
            proposeWrites: true,
            pastas: escopo.pastas,
            contextoExtra,
            onEvent: (ev) => emitirProgresso(event, ev),
            signal
          }
        )
        if (resposta.ok === false || signal.aborted) {
          return { ok: false, erro: 'o agente nao concluiu o passo', passos: [...rastros, ...resposta.passos], propostas: [...propostas, ...(resposta.propostas || [])] }
        }
        marcarPasso(passo.id, true)
        passoExecutado = passo
        ultimo = resposta
        rastros.push(...resposta.passos)
        propostas.push(...(resposta.propostas || []))
        textos.push('## ' + passo.texto + '\n\n' + resposta.texto)
        if (soProximo) break
      }

      return {
        ok: true,
        texto: textos.join('\n\n'),
        modelo: ultimo?.modelo,
        duracaoMs: Date.now() - inicio,
        passos: rastros,
        propostas,
        passoExecutado: soProximo ? passoExecutado : undefined,
        plano: lerPlano(),
        fila: statusFilaAgente(escopo.raiz)
      }
    }).catch((err: unknown) => ({ ok: false, erro: String((err as Error)?.message || err) }))
  })

  ipcMain.handle('agente:verificar', async (_e, payload: unknown) => {
    if (emSafeMode()) return { ok: false, erro: 'safe-mode' }
    const o = exigirObjeto(payload, 'verificacao')
    if (isErroPayload(o)) return o
    const escopo = validarEscopoAgent(o.raiz, o.pastas)
    if ('ok' in escopo) return escopo
    const modo = o.modo === undefined ? 'typecheck' : o.modo
    if (modo !== 'typecheck' && modo !== 'test') return { ok: false, erro: 'modo de verificacao invalido' }
    const diagnostico = modo === 'test' ? await rodarTestes(escopo.raiz) : await rodarTypecheck(escopo.raiz)
    return { ok: true, diagnostico }
  })

  ipcMain.handle('agente:diagnosticos', () => ({ ok: true, recentes: listarDiagnosticosRecentes() }))

  ipcMain.handle('agente:diagnostico-manual', (_e, textoRaw: unknown) => {
    const texto = exigirString(textoRaw, 'texto')
    if (isErroPayload(texto)) return texto
    if (!texto.trim()) return { ok: false, erro: 'diagnostico vazio' }
    return { ok: true, diagnostico: registrarDiagnosticoManual(texto) }
  })

  ipcMain.handle('agente:fila-status', () => ({ ok: true, ...statusFilaAgente() }))

  ipcMain.handle('agente:externos', async () => {
    try {
      return await statusAgentesExternos()
    } catch (e) {
      return { ok: false, agentes: [], ollama: { ok: false, modelos: [] }, erro: String((e as Error).message || e) }
    }
  })

  ipcMain.handle('agente:cancelar', () => cancelarFilaAgente())

  ipcMain.handle('propostas:listar', () => ({ ok: true, pendentes: listarPendentes() }))
  ipcMain.handle('agente:propostas', () => ({ ok: true, pendentes: listarPendentes() }))

  ipcMain.handle('propostas:hunks', (_e, id: unknown) => {
    return listarHunksPendente(typeof id === 'string' ? id : '')
  })

  ipcMain.handle('propostas:definir-hunks', (_e, id: unknown, indices: unknown) => {
    const nums = Array.isArray(indices) ? indices.filter((n): n is number => typeof n === 'number') : []
    return definirHunksPendente(typeof id === 'string' ? id : '', nums)
  })

  ipcMain.handle('propostas:preview', async (_e, id: unknown, pastas: unknown) => {
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    return previewPendente(typeof id === 'string' ? id : '', p)
  })

  ipcMain.handle('agente:aplicar-proposta', async (_e, id: unknown, pastas: unknown) => {
    const p = exigirArrayStrings(pastas, 'pastas')
    if (isErroPayload(p)) return p
    return aplicarPropostaComCheckpoint(typeof id === 'string' ? id : '', p)
  })

  ipcMain.handle('agente:rejeitar-proposta', (_e, id: unknown) => {
    const ok = marcarRejeitado(typeof id === 'string' ? id : '')
    return ok ? { ok: true } : { ok: false, erro: 'pendente inexistente' }
  })
}
