/**
 * Handlers IPC para operacoes de chat
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import { loadChat, appendChat, clearChat } from '../chatstore';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import type { IpcResult } from './types';

// ============================================================================
// HANDLERS DE CHAT
// ============================================================================

/**
 * Handler para carregar chat
 */
export async function handleChatLoad(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult & { mensagens?: unknown[]; erro?: string }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) return { ok: false, erro: r.erro };

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) return { ok: false, erro: seg.erro };

  try {
    const chat = loadChat(seg.abs);
    return { ok: true, mensagens: chat };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:load] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para limpar chat
 */
export async function handleChatClear(
  _event: Electron.IpcMainInvokeEvent,
  root: unknown
): Promise<IpcResult> {
  try {
    const r = exigirString(root, 'root');
    if (isErroPayload(r)) return { ok: false, erro: r.erro };
    const seg = caminhoSeguro(r, r);
    if (!seg.ok) return { ok: false, erro: seg.erro };
    clearChat(seg.abs);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:clear] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para anexar arquivo ao chat
 */
export async function handleChatAnexar(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown
): Promise<IpcResult & { anexo?: unknown; erro?: string }> {
  try {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nome = typeof o.nome === 'string' ? o.nome : 'anexo';
    const data = typeof o.data === 'string' ? o.data : '';
    const tipo = typeof o.tipo === 'string' ? o.tipo : '';

    if (!data) {
      return { ok: false, erro: 'sem dados' };
    }

    const { textoDeAnexo } = await import('../anexos-chat');
    const item = textoDeAnexo(nome, data);

    return {
      ok: true,
      anexo: {
        nome,
        tipo,
        ext: nome.split('.').pop() || '',
        tamanho: item.bytes,
        texto: item.texto,
        binario: item.binario,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    dglog(`[chat:anexar] erro: ${msg}`);
    return { ok: false, erro: msg };
  }
}

/**
 * Handler para enviar mensagem de chat
 * Extraido do index.ts principal
 */
export async function handleChatSend(
  event: Electron.IpcMainInvokeEvent,
  root: unknown,
  content: unknown,
  opts: unknown
): Promise<IpcResult & { message?: unknown }> {
  const r = exigirString(root, 'root');
  if (isErroPayload(r)) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: r.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const texto = exigirString(content, 'content');
  if (isErroPayload(texto)) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: texto.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const seg = caminhoSeguro(r, r);
  if (!seg.ok) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: seg.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const rootOk = seg.abs;
  const assistantMsg = {
    role: 'assistant' as const,
    content: '',
    at: Date.now(),
    provider: 'erro'
  };
  const textoPedido = texto.trim();
  if (!textoPedido) {
    assistantMsg.content = 'Digite uma mensagem antes de enviar.';
    return { ok: false, message: assistantMsg };
  }

  const options = opts && typeof opts === 'object' && !Array.isArray(opts)
    ? opts as Record<string, unknown>
    : {};
  const agenteSel = typeof options.agente === 'string' ? options.agente.slice(0, 100) : 'auto';
  const modoSel = typeof options.modo === 'string' ? options.modo : 'auto';
  const modoValido = ['auto', 'code', 'plan', 'ask', 'debug'].includes(modoSel) ? modoSel : 'auto';
  const autoAprovar = options.autoAprovar === true;
  const publicarDelta = (payload: { delta?: string; reset?: boolean }) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send('chat:delta', payload); } catch { /* janela fechada */ }
  };
  const publicar = async (
    contentOut: string,
    provider: string,
    extra: Record<string, unknown> = {},
    jaPersistido = false
  ) => {
    const message = { role: 'assistant' as const, content: contentOut, at: Date.now(), provider };
    if (!jaPersistido) appendChat(rootOk, message);
    try {
      const { gravarDossie } = await import('../dossie');
      const { gerarContinuidade, dossieDirDoApp } = await import('../bridge-adapta');
      await gravarDossie(loadChat(rootOk), { root: rootOk });
      gerarContinuidade(dossieDirDoApp());
    } catch (error) {
      dglog('[chat] nao foi possivel atualizar o dossie: ' + String(error));
    }
    return { ok: true, message, ...extra };
  };
  const persistirUsuario = () => {
    appendChat(rootOk, { role: 'user', content: textoPedido, at: Date.now() });
  };

  try {
    const { getCachedAnalysis } = await import('../analyzer');
    const { readRules } = await import('../dgrules');
    const { resolverRotaChat, decidirAutoAprovacao } = await import('../agent-router');
    const { enfileirarAgente } = await import('../agent/fila');
    const { blocoAnexos } = await import('../anexos-chat');
    const { regrasParaContexto } = await import('../regras-escopo');
    const rules = readRules(rootOk);
    const analysis = getCachedAnalysis(rootOk);
    const forceHibrido = /^\/hibrido\b/i.test(textoPedido);
    const forceOk = /\bconfirmo\b/i.test(textoPedido);
    const pedidoHibrido = forceHibrido
      ? textoPedido.replace(/^\/hibrido\b/i, '').trim() || textoPedido
      : textoPedido;
    const rota = resolverRotaChat(agenteSel, textoPedido);
    const chatLeve = rota.kind === 'chat' && agenteSel === 'auto' && !forceHibrido && modoValido !== 'code' && modoValido !== 'debug';
    let context = '';
    if (analysis) {
      context += `SISTEMA ABERTO: ${analysis.root}\nO QUE E: ${analysis.oQueE}\nSTACK: ${analysis.stack}\n`;
    }
    try {
      const arquivo = typeof options.arquivo === 'string' ? options.arquivo : '';
      context += regrasParaContexto(rootOk, arquivo ? [arquivo] : [], textoPedido, chatLeve ? 2200 : 6000);
    } catch {
      if (rules) context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules.slice(0, chatLeve ? 1800 : 12000)}\n`;
    }
    try {
      const { proporMemoria, textoMemoriasAceitas } = await import('../memorias');
      const pedidoMemoria = textoPedido.match(/^(?:lembre|memorize|guarde)(?:\s+que)?\s+(.{8,400})$/i);
      if (pedidoMemoria) proporMemoria(rootOk, pedidoMemoria[1]);
      const fatos = textoMemoriasAceitas(rootOk);
      if (fatos) context += '\nFATOS ACEITOS:\n' + fatos + '\n';
    } catch { /* memoria e opcional */ }
    if (!chatLeve) {
      try {
        const { contextoChatHibrido } = await import('../brain/hibrido');
        context += '\n' + contextoChatHibrido(rootOk, textoPedido) + '\n';
      } catch { /* briefing e opcional */ }
    }
    const anexos = blocoAnexos(options.anexos);
    if (anexos) context += '\n\n### ANEXOS DO TURNO\n' + anexos + '\n';
    context += '\nRota: ' + rota.dica + '\n';
    if (modoValido === 'debug') context += '\nMODO DEBUG: investigue causas provaveis, reproduza mentalmente o fluxo e priorize correcoes pequenas e verificaveis.\n';
    if (modoValido === 'code') context += '\nMODO CODE: priorize implementacao concreta, mantendo os padroes e testes existentes.\n';
    if (modoValido === 'ask') context += '\nMODO ASK: explique e responda sem propor alteracoes de arquivos.\n';

    const rodarAgente = async (idAgente: string, tarefa: 'chat' | 'codigo') => {
      const { executarAgente } = await import('../brain/agent');
      const resposta = await executarAgente(rootOk, textoPedido, {
        agente: idAgente,
        tarefa,
        modo: modoValido === 'plan' ? 'plan' : 'agent',
        proposeWrites: true,
        pastas: [rootOk],
        contextoExtra: context,
        onEvent: (ev) => {
          if (ev.tipo === 'texto-delta') publicarDelta({ delta: ev.texto });
        }
      });
      let contentOut = resposta?.texto || 'Sem resposta do agente.';
      const propostas = Array.isArray(resposta?.propostas) ? resposta.propostas : [];
      let autoAprovacao: { aplicada: boolean; motivo: string } = { aplicada: false, motivo: 'desligada' };
      if (autoAprovar && propostas.length) {
        const { predizerImpacto, analisarWorkspace } = await import('../brain/hibrido');
        const pred = predizerImpacto(textoPedido, analisarWorkspace(rootOk));
        const gate = decidirAutoAprovacao(pred.risco, pred.rota, propostas.length);
        autoAprovacao = { aplicada: gate.ok, motivo: gate.motivo };
        if (gate.ok) {
          for (const proposta of propostas) {
            try {
              await (await import('../agent/propostas')).aplicarPropostaComCheckpoint(proposta.id, [rootOk]);
            } catch (error) {
              autoAprovacao = { aplicada: false, motivo: error instanceof Error ? error.message : String(error) };
            }
          }
        } else {
          contentOut += '\n\nAprovacao automatica nao aplicada: ' + gate.motivo + '. As propostas seguem para revisao.';
        }
      }
      return publicar(contentOut, resposta?.modelo || 'agente:' + idAgente, { propostas, autoAprovacao }, true);
    };

    const resultado = await enfileirarAgente(async () => {
      if (agenteSel && agenteSel !== 'auto' && modoValido !== 'ask') {
        try {
          const { lerAgente } = await import('../brain/agentes');
          const agente = lerAgente(rootOk, agenteSel);
          if (agente || agenteSel.startsWith('free-')) {
            const idAgente = agente ? agente.id : agenteSel;
            const tarefa = modoValido === 'ask' ? 'chat' : 'codigo';
            return rodarAgente(idAgente, tarefa);
          }
        } catch (error) {
          dglog('[chat] agente selecionado falhou: ' + String(error));
        }
      }

      if (forceHibrido) {
        persistirUsuario();
        const { executarHibrido } = await import('../brain/hibrido');
        const hibrido = await executarHibrido(rootOk, pedidoHibrido, {
          pastaAberta: analysis?.root || rootOk,
          force: forceOk
        });
        return publicar(hibrido.texto, 'hibrido:' + (hibrido.modelo || 'core'), { hibrido: hibrido.briefing });
      }

      if (modoValido === 'plan' || modoValido === 'code' || modoValido === 'debug' || (rota.kind === 'agente' && rota.agente && modoValido !== 'ask')) {
        const idAgente = rota.kind === 'agente' && rota.agente
          ? rota.agente
          : modoValido === 'plan' ? 'free-auto' : 'free-coder';
        const tarefa = modoValido === 'ask' ? 'chat' : 'codigo';
        try { return await rodarAgente(idAgente, tarefa); }
        catch (error) { dglog('[chat] rota de codigo falhou; usando chat: ' + String(error)); }
      }

      persistirUsuario();
      const { modeloParaTarefa } = await import('../brain/modelos-catalogo');
      const { guardianPodeOperar } = await import('../guardian');
      const { ensureOllama } = await import('../ollama-keeper');
      const { streamOllamaChat, streamOpenAIChat } = await import('../brain/stream-chat');
      const { primeiroProvider, limitesPorTarefa } = await import('../brain/registry');
      const modeloChat = modeloParaTarefa(rootOk, 'chat');
      const tarefaLocal = guardianPodeOperar() ? 'chat' : 'chat-rapido';
      const modeloLocal = modeloParaTarefa(rootOk, tarefaLocal) || modeloChat;
      const provider = primeiroProvider('chat');
      const system = 'Voce e o DG Editor, assistente de analise de sistemas. Responda sempre em portugues brasileiro correto.';
      const user = (context ? 'Contexto:\n' + context + '\n\n' : '') + 'Pedido: ' + textoPedido;
      if (provider?.formato === 'openai' && provider.apiKeyEnv) {
        const key = String(process.env[provider.apiKeyEnv] || '').trim();
        if (key) {
          try {
            const resposta = (await streamOpenAIChat({
              baseUrl: provider.baseUrl,
              apiKey: key,
              model: provider.modelo,
              system,
              user,
              numPredict: provider.numPredict || 512,
              timeoutMs: provider.timeoutMs || 45_000,
              onDelta: (delta) => publicarDelta({ delta })
            })).trim();
            if (resposta) return publicar(resposta, provider.id + ':' + provider.modelo);
          } catch (error) {
            publicarDelta({ reset: true });
            dglog('[chat] provider online falhou; usando modelo local: ' + String(error));
          }
        }
      }
      if (!modeloLocal) throw new Error('Nenhum modelo de chat instalado');
      await ensureOllama();
      try {
        const limites = limitesPorTarefa('chat');
        const resposta = (await streamOllamaChat({
          model: modeloLocal,
          system,
          user,
          numPredict: limites.num_predict,
          timeoutMs: limites.timeoutMs,
          onDelta: (delta) => publicarDelta({ delta })
        })).trim();
        if (resposta) return publicar(resposta, 'ollama:' + modeloLocal);
      } catch (error) {
        publicarDelta({ reset: true });
        dglog('[chat] stream local falhou: ' + String(error));
      }
      const { askOllama } = await import('../brain/ollama');
      const resposta = await askOllama(textoPedido, context, 'chat');
      return publicar(resposta.text, resposta.provider + ':' + (resposta.model || modeloChat));
    });
    return resultado as IpcResult & { message?: unknown };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const friendly = /Nenhum modelo de chat/.test(errMsg)
      ? 'Nenhum modelo de chat instalado'
      : 'Nao consegui responder agora: ' + errMsg;
    const message = { role: 'assistant' as const, content: friendly, at: Date.now(), provider: 'erro' };
    appendChat(rootOk, message);
    try {
      const { gravarDossie } = await import('../dossie');
      await gravarDossie(loadChat(rootOk), { root: rootOk });
    } catch { /* o erro principal continua sendo retornado */ }
    return { ok: false, message };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Registra todos os handlers de chat
 */
export function registrarHandlersChat(): void {
  dglog('[ipc:chat] registrando handlers...');

  ipcMain.handle('chat:load', handleChatLoad);
  ipcMain.handle('chat:clear', handleChatClear);
  ipcMain.handle('chat:anexar', handleChatAnexar);
  ipcMain.handle('chat:send', handleChatSend);

  dglog('[ipc:chat] handlers registrados com sucesso');
}
