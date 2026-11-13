/**
 * Handlers IPC para operacoes de chat
 * Extraido de src/main/index.ts
 */

import { ipcMain } from 'electron';
import { loadChat, appendChat, clearChat } from '../chatstore';
import { caminhoSeguro, exigirString, isErroPayload } from '../ipc-seguro';
import { dglog } from '../dglog';
import { calcularUso } from '../brain/custo-sessao';
import type { IpcResult, ChatSendResult } from './types';

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
async function executarChatSend(
  event: Electron.IpcMainInvokeEvent,
  root: unknown,
  content: unknown,
  opts: unknown
): Promise<ChatSendResult> {
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

  // === DETECAO DE ANEXOS DE IMAGEM (sem suporte a visão) ===
  const options = opts && typeof opts === 'object' && !Array.isArray(opts)
    ? opts as Record<string, unknown>
    : {};
  try {
    const anexosBruto = (options as Record<string, unknown>)?.anexos;
    if (Array.isArray(anexosBruto)) {
      const EXT_IMAGEM = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']);
      const imagens = anexosBruto.filter((a: unknown) => {
        if (!a || typeof a !== 'object') return false;
        const nome = String((a as Record<string, unknown>).nome || '');
        const tipo = String((a as Record<string, unknown>).tipo || '');
        const ext = nome.includes('.') ? nome.split('.').pop() || '' : '';
        return EXT_IMAGEM.has(ext.toLowerCase()) || /^image\//i.test(tipo);
      });
      if (imagens.length > 0) {
        const lista = imagens.map((a: Record<string, unknown>) => String(a.nome || 'imagem')).join(', ');
        const msgImagem = {
          role: 'assistant' as const,
          content:
            'O DG Editor nao suporta analise de imagens (visao nao disponível no modelo local). ' +
            'Anexo(s) nao processado(s): ' + lista +
            '. Descreva o problema em texto (o que a imagem mostra, erro, codigo ou comportamento) que eu tento resolver.',
          at: Date.now(),
          provider: 'erro'
        };
        appendChat(rootOk, msgImagem);
        return { ok: false, message: msgImagem };
      }
    }
  } catch {
    /* nao bloqueia o fluxo por falha na detecao de anexos */
  }

  // === MOCK DETERMINISTICO DE QA (DG_FAKE_LLM=1) ===
  // Nao toca rede nem Ollama; exercita stream, proposta, apply e undo no e2e.
  if (process.env.DG_FAKE_LLM === '1') {
    return responderChatFake(event, rootOk, textoPedido);
  }

  // === DEGRADACAO GRACIOSA: verifica se ha pelo menos um provedor disponível ===
  try {
    const { ollamaAlive } = await import('../ollama-keeper');
    const { lerChave } = await import('../brain/segredos-providers');
    const { filaPronta } = await import('../brain/registry');

    const ollamaVivo = await ollamaAlive().catch(() => false);
    let chaveOnline = false;
    try {
      const fila = filaPronta('chat');
      for (const p of fila) {
        if (p.tipo === 'online' && p.formato === 'openai') {
          let key = '';
          if (p.apiKeyRef) key = String(lerChave(p.id) || '').trim();
          if (!key && p.apiKeyEnv) key = String(process.env[p.apiKeyEnv] || '').trim();
          if (key) { chaveOnline = true; break; }
        }
      }
    } catch { /* fila vazia ou erro nao bloqueia */ }

    if (!ollamaVivo && !chaveOnline) {
      const msgNaoDisponivel = {
        role: 'assistant' as const,
        content: 'Nenhum provedor de IA disponível no momento. Configure uma chave API (OpenRouter/OpenAI) ou inicie o Ollama local, depois tente novamente.',
        at: Date.now(),
        provider: 'erro'
      };
      appendChat(rootOk, msgNaoDisponivel);
      try {
        const { gravarDossie } = await import('../dossie');
        await gravarDossie(loadChat(rootOk), { root: rootOk });
      } catch { /* */ }
      return { ok: false, message: msgNaoDisponivel, diagnostico: { provedores: 'indisponiveis', ollama: false, chaveOnline: false } };
    }
  } catch {
    /* segue se nao conseguir verificar — deixa o fluxo normal tentar */
  }

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
  /** Prompt efetivo do turno (atualizado apos montar o contexto) — base do uso estimado. */
  let contextoUso = textoPedido;
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
    // Streams deste app nao devolvem usage; estimativa ~4 chars/token (marcada como estimada).
    const usage = calcularUso(provider, contextoUso, contentOut);
    const message = { role: 'assistant' as const, content: contentOut, at: Date.now(), provider, usage };
    if (!jaPersistido) appendChat(rootOk, message);
    try {
      const { gravarDossie } = await import('../dossie');
      const { gerarContinuidade, dossieDirDoApp } = await import('../bridge-adapta');
      await gravarDossie(loadChat(rootOk), { root: rootOk });
      gerarContinuidade(dossieDirDoApp());
    } catch (error) {
      dglog('[chat] nao foi possivel atualizar o dossie: ' + String(error));
    }
    return { ok: true, message, ...extra, usage };
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
    contextoUso = context + '\n' + textoPedido;
   
    const rodarAgente = async (idAgente: string, tarefa: 'chat' | 'codigo', signal?: AbortSignal) => {
      process.env.DG_ROOT = rootOk;
      if (signal?.aborted) throw new Error('cancelado pelo usuario');
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
        onEvent,
        signal
      });
      let diagnostico: unknown;
      let contentOut = resposta?.texto || 'Sem resposta do agente.';
      const propostas = Array.isArray(resposta?.propostas) ? resposta.propostas : [];
      // Verify so quando houve edicao (propostas) — evita typecheck em todo turno (lentidao).
      if (
        !signal?.aborted &&
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
            signal,
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
    const resultado = await enfileirarAgente(rootOk, async (signal) => {
      if (signal?.aborted) throw new Error('cancelado pelo usuario');
      if (agenteSel && agenteSel !== 'auto' && modoValido !== 'ask') {
        try {
          const { lerAgente } = await import('../brain/agentes');
          const agente = lerAgente(rootOk, agenteSel);
          if (agente || agenteSel.startsWith('free-')) {
            const idAgente = agente ? agente.id : agenteSel;
            const tarefa = modoValido === 'ask' ? 'chat' : 'codigo';
            return rodarAgente(idAgente, tarefa, signal);
          }
        } catch (error) {
          dglog('[chat] agente selecionado falhou: ' + String(error));
        }
      }

      if (forceHibrido) {
        persistirUsuario();
        if (signal?.aborted) throw new Error('cancelado pelo usuario');
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
          if (signal?.aborted) throw new Error('cancelado pelo usuario');
          const { listarAgentes } = await import('../brain/agentes');
          const { orquestrarAgentes } = await import('../agent/orquestrador');
          const todos = listarAgentes(rootOk).map((a) => a.id);
          // Ordena: o idAgente selecionado primeiro, depois o resto
          const fila = [idAgente, ...todos.filter((id) => id !== idAgente)];
          try {
            const orc = await orquestrarAgentes(rootOk, textoPedido, fila, undefined, {
              pararNoPrimeiroSucesso: true,
              tarefa: modoValido
            });
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
          return await rodarAgente(idAgente, tarefa, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
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
      const tentativasProvedor: string[] = [];
      for (const provider of filaChat) {
        if (signal?.aborted) throw new Error('cancelado pelo usuario');
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
        tentativasProvedor.push(provider.id + ':' + provider.modelo);
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
            onDelta: (delta) => publicarDelta({ delta }),
            signal
          })).trim();
          if (resposta && resposta.length >= 8) {
            return publicar(resposta, provider.id + ':' + provider.modelo, {
              tentativas: [...tentativasProvedor]
            });
          }
        } catch (error) {
          publicarDelta({ reset: true });
          dglog('[chat] provider online falhou ' + provider.id + ': ' + String(error));
          if (!event.sender.isDestroyed()) {
            try {
              event.sender.send('chat:fallback', {
                de: provider.id + ':' + provider.modelo,
                motivo: String((error as Error)?.message || error).slice(0, 160)
              });
            } catch { /* janela fechada */ }
          }
        }
      }

      if (signal?.aborted) throw new Error('cancelado pelo usuario');
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
            onDelta: (delta) => publicarDelta({ delta }),
            signal
          })).trim();
          if (resposta && resposta.length >= 8) {
            return publicar(resposta, 'ollama:' + modeloLocal, {
              tentativas: [...tentativasProvedor, 'ollama:' + modeloLocal]
            });
          }
        } catch (error) {
          publicarDelta({ reset: true });
          dglog('[chat] stream local falhou: ' + String(error));
        }
        try {
          const { askOllama } = await import('../brain/ollama');
          const resposta = await askOllama(textoPedido, context, 'chat', {}, { signal });
          if (resposta?.text?.trim()) {
            const idProv = resposta.provider + ':' + (resposta.model || modeloChat);
            return publicar(resposta.text, idProv, {
              tentativas: [...tentativasProvedor, idProv]
            });
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          dglog('[chat] askOllama falhou: ' + String(error));
        }
      }

      if (signal?.aborted) throw new Error('cancelado pelo usuario');
      const { askOllama } = await import('../brain/ollama');
      const resposta = await askOllama(textoPedido, context, 'chat', {}, { signal });
      const idFinal = resposta.provider + ':' + (resposta.model || modeloChat);
      return publicar(resposta.text, idFinal, {
        tentativas: [...tentativasProvedor, idFinal]
      });
    });
    return resultado as ChatSendResult;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (/cancelad/i.test(errMsg)) {
      const message = {
        role: 'assistant' as const,
        content: 'Geracao interrompida a seu pedido.',
        at: Date.now(),
        provider: 'cancelado'
      };
      appendChat(rootOk, message);
      return { ok: false, message };
    }
    // Ultimo recurso absoluto: askOllama com modelo leve e sem contexto, para nunca ficar sem resposta.
    let textoUltimoRecurso: string | null = null
    try {
      const { askOllama } = await import('../brain/ollama')
      const r = await askOllama(textoPedido, '', 'chat', {}, { model: 'qwen2.5-coder:1.5b', numPredict: 300, timeoutMs: 60_000 })
      if (r?.text?.trim()) textoUltimoRecurso = r.text
    } catch { /* ultimo recurso também falhou */ }
    const conteudo = textoUltimoRecurso
      ? textoUltimoRecurso
      : (/Nenhum modelo de chat/.test(errMsg)
        ? 'Nenhum modelo de chat instalado'
        : 'Nao consegui responder agora: ' + errMsg)
    const message = { role: 'assistant' as const, content: conteudo, at: Date.now(), provider: 'erro' };
    appendChat(rootOk, message);
    try {
      const { gravarDossie } = await import('../dossie');
      await gravarDossie(loadChat(rootOk), { root: rootOk });
    } catch { /* o erro principal continua sendo retornado */ }
    return { ok: false, message };
  }
}

const MOCK_CHAT_REL = 'qa-artifacts/mock-chat/alvo.txt';
const MOCK_CHAT_ANTES = 'linha original do mock QA\n';
const MOCK_CHAT_DEPOIS = 'linha alterada pelo mock QA\n';

/**
 * LLM falso deterministico (DG_FAKE_LLM=1).
 * Faz stream de deltas pelo canal real e, com [qa:proposta], cria uma proposta
 * aplicavel em qa-artifacts/mock-chat/alvo.txt — sem rede, sem Ollama.
 */
async function responderChatFake(
  event: Electron.IpcMainInvokeEvent,
  rootOk: string,
  textoPedido: string
): Promise<ChatSendResult> {
  const enviarDelta = (delta: string) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send('chat:delta', { delta }); } catch { /* janela fechada */ }
  };
  const enviarStatus = (texto: string) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send('agente:progresso', { tipo: 'status', texto }); } catch { /* janela fechada */ }
  };
  const { enfileirarAgente } = await import('../agent/fila');
  appendChat(rootOk, { role: 'user', content: textoPedido, at: Date.now() });
  try {
    return await enfileirarAgente(rootOk, async (signal) => {
      const pedacos = [
        'Resposta simulada do DG Editor (DG_FAKE_LLM). ',
        'Nenhum provedor externo foi chamado neste turno. ',
        'Cenario deterministico de QA.'
      ];
      let texto = '';
      enviarStatus('Planejando a resposta…');
      for (const pedaco of pedacos) {
        if (signal.aborted) break;
        await new Promise<void>((res) => {
          const t = setTimeout(fimEspera, 40);
          function fimEspera() {
            clearTimeout(t);
            signal.removeEventListener('abort', fimEspera);
            res();
          }
          signal.addEventListener('abort', fimEspera, { once: true });
        });
        if (signal.aborted) break;
        texto += pedaco;
        enviarDelta(pedaco);
      }
      if (signal.aborted) {
        const msg = {
          role: 'assistant' as const,
          content: 'Geracao interrompida a seu pedido.',
          at: Date.now(),
          provider: 'cancelado'
        };
        appendChat(rootOk, msg);
        return { ok: false, message: msg };
      }
      const propostas: Array<{ id: string; path: string; absPath: string; unifiedDiff: string }> = [];
      enviarStatus('Verificando o resultado…');
      if (/\[qa:proposta\]/i.test(textoPedido)) {
        try {
          const { mkdir, writeFile } = await import('fs/promises');
          const { join } = await import('path');
          const abs = join(rootOk, MOCK_CHAT_REL);
          await mkdir(join(rootOk, 'qa-artifacts', 'mock-chat'), { recursive: true });
          // Sempre volta ao original para o diff ser o mesmo a cada execucao.
          await writeFile(abs, MOCK_CHAT_ANTES, 'utf8');
          const { proporEscritaCompleta } = await import('../agent/propostas');
          const r = proporEscritaCompleta(rootOk, MOCK_CHAT_REL, MOCK_CHAT_DEPOIS, [rootOk]);
          if (r.ok && r.pendente) {
            propostas.push({
              id: r.pendente.id,
              path: r.pendente.path,
              absPath: r.pendente.absPath,
              unifiedDiff: r.pendente.unifiedDiff
            });
            texto += ' Proposta pronta em ' + MOCK_CHAT_REL + '.';
          } else {
            texto += ' Proposta nao criada: ' + r.texto;
          }
        } catch (e) {
          dglog('[chat:mock] proposta falhou: ' + String(e));
        }
      }
      const message = {
        role: 'assistant' as const,
        content: texto,
        at: Date.now(),
        provider: 'mock',
        usage: calcularUso('mock', textoPedido, texto)
      };
      appendChat(rootOk, message);
      return {
        ok: true,
        message,
        propostas,
        modo: 'agent',
        autoAprovacao: { aplicada: false, motivo: 'DG_FAKE_LLM' },
        usage: message.usage
      } as ChatSendResult;
    });
  } catch (e) {
    const message = {
      role: 'assistant' as const,
      content: 'Mock interrompido: ' + String((e as Error)?.message || e),
      at: Date.now(),
      provider: 'erro'
    };
    appendChat(rootOk, message);
    return { ok: false, message };
  }
}

// ============================================================================
// FUNCAO DE REGISTRO
// ============================================================================

/**
 * Emite um evento de fim de turno para o renderer anunciar o resultado no
 * leitor de tela — inclusive quando o turno é iniciado por IPC direto.
 */
function emitirFimDoTurno(event: Electron.IpcMainInvokeEvent, r: ChatSendResult): void {
  if (event.sender.isDestroyed()) return;
  try {
    event.sender.send('agente:progresso', {
      tipo: 'fim',
      ok: r?.ok === true,
      provider: r?.message?.provider || '',
      cancelado: r?.message?.provider === 'cancelado'
    });
  } catch {
    /* janela fechada */
  }
}

export async function handleChatSend(
  event: Electron.IpcMainInvokeEvent,
  root: unknown,
  content: unknown,
  opts: unknown
): Promise<ChatSendResult> {
  const resultado = await executarChatSend(event, root, content, opts);
  emitirFimDoTurno(event, resultado);
  return resultado;
}

/**
 * Registra todos os handlers de chat
 */
export function registrarHandlersChat(): void {
  dglog('[ipc:chat] registrando handlers...');

  ipcMain.handle('chat:load', handleChatLoad);
  ipcMain.handle('chat:clear', handleChatClear);
  ipcMain.handle('chat:anexar', handleChatAnexar);
  ipcMain.handle('chat:send', handleChatSend);
  ipcMain.handle('chat:cancelar', async () => {
    const { cancelarFilaAgente } = await import('../agent/fila');
    return cancelarFilaAgente();
  });

  dglog('[ipc:chat] handlers registrados com sucesso');
}
