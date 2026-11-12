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

  const { resolverRaizChat, definirRaizWorkspace } = await import('../workspace-raiz');
  const raizResolvida = resolverRaizChat(r);
  if (!raizResolvida.ok) {
    return {
      ok: false,
      message: {
        role: 'assistant' as const,
        content: raizResolvida.erro,
        at: Date.now(),
        provider: 'erro'
      }
    };
  }
  const seg = caminhoSeguro(raizResolvida.abs, raizResolvida.abs);
  if (!seg.ok) {
    return {
      ok: false,
      message: { role: 'assistant' as const, content: seg.erro, at: Date.now(), provider: 'erro' }
    };
  }

  const rootOk = seg.abs;
  definirRaizWorkspace(rootOk);
  process.env.DG_ROOT = rootOk;
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
  const modoValido = ['auto', 'code', 'plan', 'ask', 'debug', 'agent'].includes(modoSel)
    ? modoSel
    : 'auto';
  const autoAprovar = options.autoAprovar === true;
  const verificarAposOpt =
    options.verificarApos === false
      ? false
      : options.verificarApos === true
        ? true
        : modoValido !== 'plan' && modoValido !== 'ask';
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
    const rota = resolverRotaChat(agenteSel, textoPedido, rootOk);
    // Estilo Cursor: ask = so texto; cumprimento curto = chat leve; resto = agente com tools.
    const chatLeve =
      modoValido === 'ask' ||
      (rota.kind === 'chat' &&
        agenteSel === 'auto' &&
        !forceHibrido &&
        modoValido !== 'code' &&
        modoValido !== 'debug' &&
        modoValido !== 'agent');
    let context = '';
    // Ancora obrigatoria: SEMPRE a pasta do repositorio ligado no Bloco 1
    context +=
      '### REPOSITORIO ATIVO (obrigatorio)\n' +
      'Pasta: ' +
      rootOk +
      '\nResponda e analise SOMENTE este repositorio. Nao invente outro projeto. ' +
      'Se precisar de arquivos, use tools nesta pasta.\n';
    if (analysis) {
      context +=
        `SISTEMA ABERTO: ${analysis.root || rootOk}\nO QUE E: ${analysis.oQueE}\nSTACK: ${analysis.stack}\n`;
    } else {
      context += 'SISTEMA ABERTO: ' + rootOk + ' (analise em cache ainda nao gerada)\n';
    }
    try {
      const { mapaCompacto } = await import('../mapa-projeto');
      const mapa = mapaCompacto(rootOk, chatLeve ? 1400 : 2200);
      if (mapa) context += '\n### MAPA DO REPOSITORIO\n' + mapa + '\n';
    } catch {
      /* mapa opcional */
    }
    try {
      const { blocoMemoriaProjeto } = await import('../autonomia-tools');
      context += blocoMemoriaProjeto(rootOk);
    } catch {
      /* memoria projeto opcional */
    }
    try {
      const { analisarWorkspace } = await import('../brain/hibrido');
      const snap = analisarWorkspace(rootOk, rootOk);
      context +=
        'TOPO: ' +
        (snap.topNivel || []).slice(0, 20).join(', ') +
        '\nGIT: ' +
        snap.branch +
        '@' +
        snap.commit +
        (snap.treeSujo ? ' (sujo)' : '') +
        '\n';
    } catch {
      /* snapshot opcional */
    }
    try {
      const arquivo = typeof options.arquivo === 'string' ? options.arquivo : '';
      context += regrasParaContexto(rootOk, arquivo ? [arquivo] : [], textoPedido, chatLeve ? 2200 : 6000);
    } catch {
      if (rules) context += `\nREGRAS DO PROJETO (.dgrules - respeite):\n${rules.slice(0, chatLeve ? 1800 : 12000)}\n`;
    }
    try {
      const { obterRegrasAtivas } = await import('../regras-gerais');
      const rg = obterRegrasAtivas();
      if (rg) context += '\nREGRAS GERAIS:\n' + rg + '\n';
    } catch { /* opcional */ }
    try {
      const { proporMemoria, textoMemoriasAceitas } = await import('../memorias');
      const pedidoMemoria = textoPedido.match(/^(?:lembre|memorize|guarde)(?:\s+que)?\s+(.{8,400})$/i);
      if (pedidoMemoria) proporMemoria(rootOk, pedidoMemoria[1]);
      const fatos = textoMemoriasAceitas(rootOk);
      if (fatos) context += '\nFATOS ACEITOS:\n' + fatos + '\n';
    } catch { /* memoria e opcional */ }
    // Briefing do repo sempre — inclusive modo ask/leve (sem isso o chat "nao sabe" a pasta)
    try {
      const { contextoChatHibrido } = await import('../brain/hibrido');
      context += '\n' + contextoChatHibrido(rootOk, textoPedido) + '\n';
    } catch { /* briefing e opcional */ }
    const anexos = blocoAnexos(options.anexos);
    if (anexos) context += '\n\n### ANEXOS DO TURNO\n' + anexos + '\n';
    context += '\nRota: ' + rota.dica + '\n';
    const skillId = typeof options.skill === 'string' ? options.skill.slice(0, 120) : ''
    if (skillId) {
      try {
        const { lerSkill } = await import('../brain/skills')
        const sk = lerSkill(rootOk, skillId)
        if (sk?.instrucao) {
          context += '\nSKILL ATIVA (' + sk.titulo + '):\n' + sk.instrucao.slice(0, 4000) + '\n'
        } else {
          context += '\nSKILL ATIVA: ' + skillId + '\n'
        }
      } catch {
        context += '\nSKILL ATIVA: ' + skillId + '\n'
      }
    }
    context +=
      '\nCOMPORTAMENTO (espelho Cursor — obrigatorio em inventariar/modificar/corrigir/melhorar/editar): ' +
      'tools no mesmo turno; ler antes de editar; resultado real; checklist completo; ' +
      'falso positivo Windows = descartar; falta = NÃO ENCONTRADO; resposta curta em um bloco limpo. ' +
      'Nao diga que vai fazer — faca.\n';
    if (modoValido === 'debug') context += '\nMODO DEBUG: investigue causas provaveis, reproduza mentalmente o fluxo e priorize correcoes pequenas e verificaveis.\n';
    if (modoValido === 'code' || modoValido === 'agent') {
      context +=
        '\nMODO AGENT: encadeie explorar → editar → validar no mesmo turno sem pedir confirmacao a cada passo. ' +
        'Implementacao concreta, padroes e testes existentes. Pare so em risco alto.\n'
    }
    if (modoValido === 'ask') context += '\nMODO ASK: explique e responda sem propor alteracoes de arquivos.\n';
   
    const rodarAgente = async (idAgente: string, tarefa: 'chat' | 'codigo') => {
      process.env.DG_ROOT = rootOk;
      try {
        const { garantirMcpNaRaiz } = await import('../mcp/client');
        await garantirMcpNaRaiz(rootOk);
      } catch {
        /* MCP opcional — agente tenta de novo */
      }
      const arquivoAtivo = typeof options.arquivo === 'string' ? options.arquivo : '';
      let perguntaAgente = textoPedido;
      let contextoAgente = context;
      try {
        const { expandirMencoes } = await import('../agent/mencoes');
        const expansao = await expandirMencoes({
          raiz: rootOk,
          pergunta: textoPedido,
          arquivoAtivo: arquivoAtivo || undefined,
          pastas: [rootOk]
        });
        perguntaAgente = expansao.perguntaLimpa || textoPedido;
        if (expansao.contextoExtra) {
          contextoAgente += '\n\n### MENÇÕES\n' + expansao.contextoExtra + '\n';
        }
      } catch (error) {
        dglog('[chat] mencoes: ' + String(error));
      }
      const { executarAgente } = await import('../brain/agent');
      const onEvent = (ev: { tipo?: string; texto?: string; [k: string]: unknown }) => {
        if (ev.tipo === 'texto-delta' && ev.texto) publicarDelta({ delta: ev.texto });
        if (!event.sender.isDestroyed()) {
          try {
            event.sender.send('agente:progresso', { ...ev, raiz: rootOk });
          } catch { /* janela fechada */ }
        }
      };
      let resposta = await executarAgente(rootOk, perguntaAgente, {
        agente: idAgente,
        tarefa,
        modo: modoValido === 'plan' ? 'plan' : 'agent',
        proposeWrites: true,
        pastas: [rootOk],
        contextoExtra: contextoAgente,
        onEvent
      });
      let diagnostico: unknown;
      let contentOut = resposta?.texto || 'Sem resposta do agente.';
      const propostas = Array.isArray(resposta?.propostas) ? resposta.propostas : [];
      // Verify so quando houve edicao (propostas) — evita typecheck em todo turno (lentidao).
      if (
        verificarAposOpt &&
        modoValido !== 'plan' &&
        modoValido !== 'ask' &&
        propostas.length > 0
      ) {
        try {
          const { rodarVerifyAposAgente } = await import('../agent/verify-apos');
          const v = await rodarVerifyAposAgente({
            raiz: rootOk,
            pastas: [rootOk],
            agente: idAgente,
            contextoExtra: contextoAgente,
            onEvent: onEvent as (ev: unknown) => void,
            resposta
          });
          resposta = v.resposta;
          diagnostico = v.diagnostico;
          contentOut = resposta?.texto || contentOut;
        } catch (error) {
          dglog('[chat] verify-apos: ' + String(error));
        }
      }
      let planoSalvo: unknown = undefined;
      if (modoValido === 'plan' && resposta?.texto) {
        try {
          const { salvarPlano, lerPlano } = await import('../agent/plano');
          salvarPlano({
            texto: resposta.texto,
            raiz: rootOk,
            salvoEm: new Date().toISOString(),
            agente: idAgente
          });
          planoSalvo = lerPlano();
        } catch (error) {
          dglog('[chat] falha ao salvar plano: ' + String(error));
        }
      } else {
        try {
          const { lerPlano } = await import('../agent/plano');
          planoSalvo = lerPlano();
        } catch {
          /* */
        }
      }
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
      return publicar(
        contentOut,
        resposta?.modelo || 'agente:' + idAgente,
        { propostas, autoAprovacao, plano: planoSalvo, modo: modoValido, diagnostico },
        true
      );
    };

    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agente:progresso', {
          tipo: 'status',
          texto: 'Na fila do Agent — preparando…',
          raiz: rootOk
        })
      }
    } catch {
      /* */
    }
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

      // Estilo Cursor: qualquer pedido acionavel usa agente + tools.
      // Quando agenteSel === 'auto', usa o MELHOR agente para a tarefa com fallback
      // automatico para o proximo se o primeiro travar/demorar (orquestrador).
      if (
        modoValido !== 'ask' &&
        (modoValido === 'plan' ||
          modoValido === 'code' ||
          modoValido === 'agent' ||
          modoValido === 'debug' ||
          modoValido === 'auto' ||
          (rota.kind === 'agente' && !!rota.agente))
      ) {
        const idAgente =
          rota.kind === 'agente' && rota.agente
            ? rota.agente
            : modoValido === 'plan'
              ? 'hibrido-core'
              : modoValido === 'debug'
                ? 'kilo-debug'
                : 'dg-engenheiro';
        const tarefa = modoValido === 'ask' ? 'chat' : 'codigo';

        // Selecao automatica: fila com o melhor agente primeiro + fallback automatico.
        if (agenteSel === 'auto' && rootOk) {
          const { listarAgentes } = await import('../brain/agentes');
          const { orquestrarAgentes } = await import('../agent/orquestrador');
          const todos = listarAgentes(rootOk).map((a) => a.id);
          // Ordena: o idAgente selecionado primeiro, depois o resto
          const fila = [idAgente, ...todos.filter((id) => id !== idAgente)];
          try {
            const orc = await orquestrarAgentes(rootOk, textoPedido, fila);
            const ultimo = orc.passos[orc.passos.length - 1];
            const respostaTexto = orc.textoFinal || (ultimo ? ultimo.texto : '');
            const modeloUsado = orc.passos.map((p) => p.modelo).filter(Boolean).pop() || 'agente-auto';
            return publicar(respostaTexto || 'Sem resposta do agente.', 'agente-auto:' + modeloUsado, {
              propostas: [],
              autoAprovacao: { ok: false, motivo: 'sem propostas via orquestrador' },
              modo: modoValido,
              diagnostico: { orquestrador: true, passos: orc.passos.length },
            });
          } catch (error) {
            dglog('[chat] orquestrador falhou; fallback chat: ' + String(error));
          }
        }

        try {
          return await rodarAgente(idAgente, tarefa);
        } catch (error) {
          dglog('[chat] rota agente falhou; usando chat: ' + String(error));
        }
      }

      persistirUsuario();
      const { modeloParaTarefa } = await import('../brain/modelos-catalogo');
      const { guardianPodeOperar } = await import('../guardian');
      const { ensureOllama } = await import('../ollama-keeper');
      const { streamOllamaChat, streamOpenAIChat } = await import('../brain/stream-chat');
      const { filaPronta, limitesPorTarefa } = await import('../brain/registry');
      const { lerChave } = await import('../brain/segredos-providers');
      const tarefaLocal = guardianPodeOperar() ? 'chat' : 'chat-rapido';
      let modeloChat = modeloParaTarefa(rootOk, 'chat');
      let modeloLocal = modeloParaTarefa(rootOk, tarefaLocal) || modeloChat;
      const system =
        'Voce e o DG Editor. Responda SEMPRE em portugues do Brasil, de forma COMPLETA, precisa e direta ao pedido. ' +
        'O repositorio ativo esta no contexto (pasta, mapa, git). Responda SOBRE ESSE projeto — nao ignore a pasta. ' +
        'Priorize qualidade: nao invente passos irrelevantes, nao despeje inventario do Windows, nao corte no meio. ' +
        'Se o pedido exigir acao no projeto, diga para sair do modo Ask — o padrao do DG e executar com tools como o Cursor.';
      const user =
        (context ? 'Contexto do repositorio:\n' + context + '\n\n' : '') +
        'Pedido (sobre a pasta ' +
        rootOk +
        '): ' +
        textoPedido;

      // Qualidade: melhores ONLINE primeiro; Ollama local so como ultimo recurso
      let filaChat: Array<{ id: string; tipo: string; formato: string; modelo: string; baseUrl: string; apiKeyEnv?: string; apiKeyRef?: string; numPredict: number; timeoutMs: number }> = [];
      try {
        filaChat = filaPronta('chat');
      } catch (e) {
        dglog('[chat] filaPronta vazia: ' + String(e));
      }
      for (const provider of filaChat) {
        if (provider.tipo === 'local' || provider.formato === 'ollama') continue;
        if (provider.formato !== 'openai') continue;
        if (/:free\b/i.test(provider.modelo)) continue;
        let key = '';
        try {
          if (provider.apiKeyRef) key = String(lerChave(provider.id) || '').trim();
        } catch {
          /* segue */
        }
        if (!key && provider.apiKeyEnv) key = String(process.env[provider.apiKeyEnv] || '').trim();
        if (!key) continue;
        try {
          const limites = limitesPorTarefa('chat');
          const resposta = (await streamOpenAIChat({
            baseUrl: provider.baseUrl,
            apiKey: key,
            model: provider.modelo,
            system,
            user,
            numPredict: Math.max(provider.numPredict || 1024, limites.num_predict, 1024),
            timeoutMs: Math.max(provider.timeoutMs || 45_000, 90_000),
            onDelta: (delta) => publicarDelta({ delta })
          })).trim();
          if (resposta && resposta.length >= 8) {
            return publicar(resposta, provider.id + ':' + provider.modelo);
          }
        } catch (error) {
          publicarDelta({ reset: true });
          dglog('[chat] provider online falhou ' + provider.id + ': ' + String(error));
        }
      }

      const ollamaOk = await ensureOllama();
      if (!modeloLocal || !ollamaOk) {
        try {
          const { detectarModelosLocais } = await import('../brain/modelos-catalogo');
          await detectarModelosLocais(rootOk);
        } catch (e) {
          dglog('[chat] detectarModelosLocais: ' + String(e));
        }
        modeloChat = modeloParaTarefa(rootOk, 'chat');
        modeloLocal = modeloParaTarefa(rootOk, tarefaLocal) || modeloChat || 'qwen2.5-coder:1.5b';
      }
      if (!modeloLocal) modeloLocal = 'qwen2.5-coder:1.5b';
      if (ollamaOk) {
        try {
          const limites = limitesPorTarefa(tarefaLocal === 'chat-rapido' ? 'chat-rapido' : 'chat');
          const resposta = (await streamOllamaChat({
            model: modeloLocal,
            system,
            user,
            numPredict: Math.max(limites.num_predict, 1024),
            timeoutMs: limites.timeoutMs,
            onDelta: (delta) => publicarDelta({ delta })
          })).trim();
          if (resposta && resposta.length >= 8) {
            return publicar(resposta, 'ollama:' + modeloLocal);
          }
        } catch (error) {
          publicarDelta({ reset: true });
          dglog('[chat] stream local falhou: ' + String(error));
        }
        try {
          const { askOllama } = await import('../brain/ollama');
          const resposta = await askOllama(textoPedido, context, 'chat');
          if (resposta?.text?.trim()) {
            return publicar(resposta.text, resposta.provider + ':' + (resposta.model || modeloChat));
          }
        } catch (error) {
          dglog('[chat] askOllama falhou: ' + String(error));
        }
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
