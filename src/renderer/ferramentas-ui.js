/** Painel das cinco ferramentas, ligado so ao que o DG Editor ja executa. */
import { pastasPermitidas } from './features/arquivos/index.js'
import { pintarMidia } from './midia-ui.js'

export function ligarFerramentas(pastaFn) {
  const nav = document.getElementById('tool-nav')
  const painel = document.getElementById('tool-panel')
  const titulo = document.getElementById('tool-titulo')
  const corpo = document.getElementById('tool-corpo')
  const scroll = document.querySelector('.sidebar-scroll')
  if (!nav || !painel || !titulo || !corpo || !scroll) return

  const titulos = {
    automacoes: 'Automações',
    artefatos: 'Artefatos',
    skills: 'Skills',
    conectores: 'Conectores',
    memoria: 'Memória',
    midia: 'Estúdio de mídia'
  }

  function pasta() {
    try { return pastaFn() || '' } catch { return '' }
  }

  function bloco(nome, linhas) {
    const box = document.createElement('section')
    box.className = 'tool-bloco'
    const h = document.createElement('h4')
    h.textContent = nome
    box.appendChild(h)
    if (!linhas.length) {
      const p = document.createElement('p')
      p.className = 'tool-vazio'
      p.textContent = 'Nada por aqui ainda.'
      box.appendChild(p)
      return box
    }
    const ul = document.createElement('ul')
    for (const linha of linhas) {
      const li = document.createElement('li')
      li.textContent = linha
      ul.appendChild(li)
    }
    box.appendChild(ul)
    return box
  }

  function pedirPasta() {
    corpo.appendChild(bloco('Repositório', ['Abra um repositório no Explorer para ver os dados deste projeto.']))
  }

  function formCriar(titulo, campos, onSalvar) {
    const box = document.createElement('section')
    box.className = 'tool-bloco'
    const h = document.createElement('h4')
    h.textContent = titulo
    box.appendChild(h)
    const form = document.createElement('div')
    form.className = 'tool-criar-form'
    const refs = {}
    for (const c of campos) {
      const el = c.tipo === 'textarea' ? document.createElement('textarea') : document.createElement('input')
      if (c.tipo === 'textarea') el.rows = c.rows || 3
      else el.type = 'text'
      el.placeholder = c.placeholder || c.label
      el.setAttribute('aria-label', c.label)
      refs[c.key] = el
      form.appendChild(el)
    }
    const acoes = document.createElement('div')
    acoes.className = 'tool-criar-acoes'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn-small btn-primary'
    btn.textContent = 'Criar'
    btn.addEventListener('click', async () => {
      const vals = {}
      for (const k of Object.keys(refs)) vals[k] = String(refs[k].value || '').trim()
      btn.disabled = true
      try {
        await onSalvar(vals)
      } finally {
        btn.disabled = false
      }
    })
    acoes.appendChild(btn)
    form.appendChild(acoes)
    box.appendChild(form)
    return box
  }

  async function seguro(channel, ...args) {
    try {
      return await window.api.invoke(channel, ...args)
    } catch (e) {
      return { ok: false, erro: String(e && e.message ? e.message : e) }
    }
  }

  async function abrir(id) {
    const ja = nav.querySelector('.tool-nav-btn.ativo')
    if (ja && ja.dataset.tool === id && !painel.hidden) {
      fechar()
      return
    }
    nav.querySelectorAll('.tool-nav-btn').forEach((b) => b.classList.toggle('ativo', b.dataset.tool === id))
    painel.hidden = false
    scroll.classList.add('tool-aberto')
    titulo.textContent = titulos[id] || id
    corpo.textContent = 'Carregando...'
    const raiz = pasta()
    if (id === 'automacoes') await pintarAutomacoes(raiz)
    else if (id === 'artefatos') await pintarArtefatos()
    else if (id === 'skills') await pintarSkills(raiz)
    else if (id === 'conectores') await pintarConectores()
    else if (id === 'memoria') await pintarMemoria(raiz)
    else if (id === 'midia') await pintarMidia(corpo, raiz)
  }

  function fechar() {
    painel.hidden = true
    scroll.classList.remove('tool-aberto')
    nav.querySelectorAll('.tool-nav-btn').forEach((b) => b.classList.remove('ativo'))
    corpo.textContent = ''
  }

  async function pintarAutomacoes(raiz) {
    corpo.textContent = ''
    const fila = await seguro('agente:fila-status')
    corpo.appendChild(bloco('Fila do agente', [
      fila && fila.ocupado ? 'Um trabalho está em andamento.' : 'Fila livre.',
      'Na espera: ' + (fila && typeof fila.tamanho === 'number' ? fila.tamanho : 0)
    ]))
    const plano = await seguro('agente:plano-ler')
    const passos = (plano && plano.plano && plano.plano.passos) || []
    corpo.appendChild(bloco(
      'Plano salvo',
      passos.length
        ? passos.slice(0, 12).map((p) => (p.feito ? 'Feito: ' : 'Pendente: ') + p.texto)
        : []
    ))
    if (!raiz) {
      pedirPasta()
      return
    }
    corpo.appendChild(
      formCriar(
        'Criar agente',
        [
          { key: 'nome', label: 'Nome', placeholder: 'Nome do agente' },
          { key: 'especialidade', label: 'Especialidade', placeholder: 'Ex.: revisão de PRs' },
          { key: 'skills', label: 'Skills', placeholder: 'skills separadas por vírgula' },
          { key: 'system', label: 'Instruções', tipo: 'textarea', placeholder: 'Como o agente deve agir…' }
        ],
        async (vals) => {
          if (!vals.nome) {
            if (window.dgToast) window.dgToast('Informe o nome do agente', 'aviso')
            return
          }
          const r = await seguro('agente:criar', raiz, vals)
          if (r && r.ok) {
            if (window.dgToast) window.dgToast('Agente criado: ' + (r.id || vals.nome), 'ok')
            await pintarAutomacoes(raiz)
          } else if (window.dgToast) window.dgToast((r && r.erro) || 'Falha ao criar', 'erro')
        }
      )
    )
    const ag = await seguro('agente:listar', raiz)
    const agentes = (ag && ag.agentes) || []
    corpo.appendChild(bloco(
      'Agentes que podem rodar',
      agentes.map((a) => a.nome + (a.especialidade ? ' — ' + a.especialidade : ''))
    ))
    const ext = await seguro('agente:externos')
    const agentesExt = (ext && ext.agentes) || []
    corpo.appendChild(bloco(
      'Agentes externos gratuitos (QCoder / OpenHands / Trae)',
      agentesExt.length
        ? agentesExt.map(
            (a) =>
              (a.pronto ? '[OK] ' : '[—] ') +
              a.nome +
              ' — ' +
              a.detalhe +
              (a.pronto ? '' : ' · instalar: ' + a.instalar)
          )
        : ['Não foi possível verificar agora.']
    ))
    const ir = document.createElement('button')
    ir.type = 'button'
    ir.className = 'tool-nav-btn'
    ir.textContent = 'Abrir a aba Agent'
    ir.title = 'Focar o painel de execução do agente'
    ir.addEventListener('click', () => {
      if (window.dgUi?.focarPainelIa) window.dgUi.focarPainelIa('agent')
      else if (window.dgUi?.ativarAbaCentro) window.dgUi.ativarAbaCentro('agent')
    })
    corpo.appendChild(ir)

    // Assistente ComfyUI (imagem / vídeo)
    const media = document.createElement('section')
    media.className = 'tool-bloco tool-comfy'
    media.innerHTML =
      '<h4>Assistente de mídia (ComfyUI)</h4>' +
      '<p class="muted" style="margin:0 0 8px;font-size:12px">Imagem/vídeo ilimitados no ComfyUI local (CPU). O servidor inicia sozinho; vídeos curtos levam minutos em CPU.</p>' +
      '<label class="muted" style="display:block;font-size:11px;margin-bottom:4px">Prompt' +
      '<textarea id="comfy-prompt" rows="3" class="whereis-input" style="width:100%;margin-top:4px;resize:vertical" placeholder="Descreva a cena…"></textarea></label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">' +
      '<button type="button" class="btn-small" id="comfy-status" title="Checar se o ComfyUI está no ar">Status</button>' +
      '<button type="button" class="btn-small" id="comfy-docs" title="Ver passos de uso">Como usar</button>' +
      '<button type="button" class="btn-small btn-primary" id="comfy-gerar-img" title="Enfileirar geração de imagem">Gerar imagem</button>' +
      '<button type="button" class="btn-small btn-primary" id="comfy-gerar-vid" title="Enfileirar geração de vídeo">Gerar vídeo</button>' +
      '</div>' +
      '<p id="comfy-msg" class="muted" style="font-size:11px;margin:0"></p>'
    corpo.appendChild(media)
    const msg = () => media.querySelector('#comfy-msg')
    const promptEl = () => /** @type {HTMLTextAreaElement|null} */ (media.querySelector('#comfy-prompt'))
    media.querySelector('#comfy-status')?.addEventListener('click', async () => {
      const r = await seguro('dg:comfyui:status')
      const el = msg()
      if (el) {
        el.textContent = r?.online
          ? 'ComfyUI online · ' + (r.versao || '') + ' · modelos: ' + ((r.modelos?.checkpoints || []).join(', ') || 'nenhum')
          : (r?.instalado ? 'ComfyUI instalado, servidor parado.' : 'ComfyUI não instalado.') + ' ' + (r?.erro || '')
      }
      if (window.dgToast) window.dgToast(r?.online ? 'ComfyUI online' : 'ComfyUI offline', r?.online ? 'ok' : 'erro')
    })
    media.querySelector('#comfy-docs')?.addEventListener('click', async () => {
      const r = await seguro('dg:comfyui:docs')
      const el = msg()
      if (el) el.textContent = (r?.passos || []).join(' ')
      if (r?.url && window.api?.invoke) {
        try { await window.api.invoke('navegador:abrir', r.url) } catch { /* */ }
      }
    })
    const gerar = async (modo) => {
      const prompt = promptEl()?.value?.trim() || ''
      if (!prompt) {
        if (window.dgToast) window.dgToast('Digite o prompt', 'aviso')
        return
      }
      const el = msg()
      if (el) el.textContent = modo === 'video' ? 'Gerando vídeo no ComfyUI (CPU)… pode levar minutos.' : 'Gerando imagem no ComfyUI…'
      const r = await seguro('dg:comfyui:gerar', { raiz, prompt, modo })
      if (el) {
        el.textContent = r?.ok
          ? 'Salvo em ' + (r.caminhoRel || r.caminho || '') + (r.aviso ? ' · ' + r.aviso : '')
          : (r?.erro || 'Falha')
      }
      if (window.dgToast) window.dgToast(r?.ok ? 'Gerado no ComfyUI' : (r?.erro || 'Falha'), r?.ok ? 'ok' : 'erro')
    }
    media.querySelector('#comfy-gerar-img')?.addEventListener('click', () => void gerar('imagem'))
    media.querySelector('#comfy-gerar-vid')?.addEventListener('click', () => void gerar('video'))
  }

  async function pintarArtefatos() {
    corpo.textContent = ''
    corpo.appendChild(
      formCriar(
        'Novo checkpoint',
        [{ key: 'origem', label: 'Rótulo', placeholder: 'Ex.: antes do refactor' }],
        async (vals) => {
          const raiz = pasta()
          if (!raiz) {
            if (window.dgToast) window.dgToast('Abra um repositório antes', 'aviso')
            return
          }
          const r = await seguro('agente:checkpoint-criar', [], vals.origem || 'manual-ui', pastasPermitidas())
          if (r && r.ok !== false) {
            if (window.dgToast) window.dgToast('Checkpoint criado', 'ok')
            await pintarArtefatos()
          } else if (window.dgToast) window.dgToast((r && r.erro) || 'Falha no checkpoint', 'erro')
        }
      )
    )
    const prop = await seguro('propostas:listar')
    const pendentes = (prop && prop.pendentes) || []
    corpo.appendChild(bloco(
      'Propostas de edição',
      pendentes.map((p) => (p.path || p.id || 'proposta') + (p.origem ? ' (' + p.origem + ')' : ''))
    ))
    const ck = await seguro('agente:checkpoint-listar', 12)
    const lista = (ck && ck.checkpoints) || []
    corpo.appendChild(bloco(
      'Checkpoints',
      lista.map((c) => {
        const n = Array.isArray(c.arquivos) ? c.arquivos.length : 0
        return (c.origem || 'checkpoint') + ' · ' + n + ' arquivo(s) · ' + (c.criadoEm || c.id)
      })
    ))
  }

  async function pintarSkills(raiz) {
    corpo.textContent = ''
    if (!raiz) {
      pedirPasta()
      return
    }
    corpo.appendChild(
      formCriar(
        'Criar skill',
        [
          { key: 'titulo', label: 'Título', placeholder: 'Nome da skill' },
          { key: 'gatilho', label: 'Gatilho', placeholder: 'palavras que ativam a skill' },
          { key: 'instrucao', label: 'Instrução', tipo: 'textarea', placeholder: 'O que a skill deve fazer…' }
        ],
        async (vals) => {
          if (!vals.titulo) {
            if (window.dgToast) window.dgToast('Informe o título', 'aviso')
            return
          }
          const r = await seguro('skills:criar', raiz, vals)
          if (r && r.ok) {
            if (window.dgToast) window.dgToast('Skill criada: ' + (r.id || vals.titulo), 'ok')
            await pintarSkills(raiz)
          } else if (window.dgToast) window.dgToast((r && r.erro) || 'Falha ao criar', 'erro')
        }
      )
    )
    const r = await seguro('skills:listar', raiz)
    const skills = (r && r.skills) || []
    const caixa = document.createElement('section')
    caixa.className = 'tool-bloco'
    const h = document.createElement('h4')
    h.textContent = 'Skills em .dg-editor/skills'
    caixa.appendChild(h)
    if (!skills.length) {
      const p = document.createElement('p')
      p.className = 'tool-vazio'
      p.textContent = 'Nenhuma skill encontrada.'
      caixa.appendChild(p)
    }
    caixa.classList.add('tool-skills-lista')
    for (const sk of skills) {
      const linha = document.createElement('div')
      linha.className = 'tool-acao-linha tool-skill-row'
      const info = document.createElement('div')
      info.className = 'tool-acao-info'
      const titulo = document.createElement('div')
      titulo.className = 'tool-skill-titulo'
      titulo.textContent = sk.titulo || sk.id
      info.appendChild(titulo)
      if (sk.gatilho) {
        const gat = document.createElement('div')
        gat.className = 'tool-skill-meta muted'
        gat.textContent = 'Quando: ' + sk.gatilho
        info.appendChild(gat)
      }
      const usar = document.createElement('button')
      usar.type = 'button'
      usar.className = 'btn-small'
      usar.textContent = 'Usar'
      usar.title = 'Ativar skill no próximo turno do chat'
      usar.addEventListener('click', () => {
        if (window.dgChatUsarSkill) window.dgChatUsarSkill(sk.id || sk.titulo, sk.titulo || sk.id)
        else {
          try { localStorage.setItem('dg-chat-skill', sk.id || sk.titulo) } catch {}
        }
      })
      linha.appendChild(info)
      linha.appendChild(usar)
      caixa.appendChild(linha)
    }
    corpo.appendChild(caixa)
  }

  async function pintarConectores() {
    corpo.textContent = ''
    corpo.appendChild(
      formCriar(
        'Novo conector (nota local)',
        [
          { key: 'nome', label: 'Nome', placeholder: 'Ex.: API interna' },
          { key: 'detalhe', label: 'Detalhe', placeholder: 'URL ou descrição' }
        ],
        async (vals) => {
          if (!vals.nome) {
            if (window.dgToast) window.dgToast('Informe o nome', 'aviso')
            return
          }
          try {
            const key = 'dg-conectores-custom'
            const prev = JSON.parse(localStorage.getItem(key) || '[]')
            prev.unshift({ id: 'custom-' + Date.now(), nome: vals.nome, detalhe: vals.detalhe || '', ativo: false })
            localStorage.setItem(key, JSON.stringify(prev.slice(0, 40)))
            if (window.dgToast) window.dgToast('Conector anotado: ' + vals.nome, 'ok')
            await pintarConectores()
          } catch (e) {
            if (window.dgToast) window.dgToast(String(e), 'erro')
          }
        }
      )
    )
    try {
      const custom = JSON.parse(localStorage.getItem('dg-conectores-custom') || '[]')
      if (Array.isArray(custom) && custom.length) {
        corpo.appendChild(
          bloco(
            'Conectores anotados',
            custom.slice(0, 12).map((c) => c.nome + (c.detalhe ? ' — ' + c.detalhe : ''))
          )
        )
      }
    } catch { /* ignore */ }
    const oll = await seguro('brain:ollama-status')
    const ollamaLinha = oll && oll.installed === false
      ? 'Ollama não está instalado.'
      : oll && oll.reachable
        ? 'Ollama no ar. Modelos vistos: ' + ((oll.models && oll.models.length) || 0)
        : 'Ollama instalado, mas parado.'
    const iaBox = bloco('IA local', [ollamaLinha])
    if (oll && !oll.reachable && oll.installed !== false) {
      const start = document.createElement('button')
      start.type = 'button'
      start.className = 'tool-nav-btn'
      start.textContent = 'Iniciar Ollama'
      start.addEventListener('click', async () => {
        start.disabled = true
        start.textContent = 'Iniciando...'
        await seguro('deps:ollama:start')
        await pintarConectores()
      })
      iaBox.appendChild(start)
    }
    corpo.appendChild(iaBox)

    const conn = await seguro('conectores:listar')
    const conectores = (conn && conn.conectores) || []
    const caixa = document.createElement('section')
    caixa.className = 'tool-bloco'
    const h = document.createElement('h4')
    h.textContent = 'Conectores do DG Editor'
    caixa.appendChild(h)
    if (!conectores.length) {
      const p = document.createElement('p')
      p.className = 'tool-vazio'
      p.textContent = conn && conn.erro ? String(conn.erro) : 'Nenhum conector listado.'
      caixa.appendChild(p)
    }
    for (const c of conectores) {
      const linha = document.createElement('div')
      linha.className = 'tool-acao-linha'
      const info = document.createElement('div')
      info.className = 'tool-acao-info'
      info.textContent = (c.ativo ? '● ' : '○ ') + c.nome + ' — ' + c.detalhe
      const testar = document.createElement('button')
      testar.type = 'button'
      testar.className = 'tool-nav-btn'
      testar.textContent = 'Testar'
      testar.addEventListener('click', async () => {
        testar.disabled = true
        testar.textContent = '...'
        let msg = 'sem resposta'
        try {
          if (c.id === 'ollama' || /ollama/i.test(c.nome || '')) {
            const st = await seguro('brain:ollama-status')
            msg = st && st.reachable ? 'OK — Ollama no ar' : 'Falha — Ollama parado'
          } else if (c.tipo === 'mcp' || c.id === 'mcp') {
            const st = await seguro('mcp:status')
            msg = st && st.ativo ? 'OK — MCP ativo' : 'Falha — MCP inativo'
          } else {
            const again = await seguro('conectores:listar')
            const hit = ((again && again.conectores) || []).find((x) => x.id === c.id)
            msg = hit && hit.ativo ? 'OK — ' + (hit.detalhe || 'ativo') : 'Falha — ' + ((hit && hit.detalhe) || 'inativo')
          }
        } catch (e) {
          msg = 'Erro: ' + String(e && e.message ? e.message : e)
        }
        if (window.dgToast) window.dgToast(c.nome + ': ' + msg, /OK/i.test(msg) ? 'ok' : 'erro')
        testar.disabled = false
        testar.textContent = 'Testar'
        await pintarConectores()
      })
      const docs = document.createElement('button')
      docs.type = 'button'
      docs.className = 'tool-nav-btn'
      docs.textContent = 'Docs'
      docs.title = 'Abrir documentação relacionada'
      docs.addEventListener('click', () => {
        const mapa = {
          ollama: 'docs/ollama-mcp.md',
          mcp: 'docs/ollama-mcp.md',
          cursor: 'docs/PROVIDERS.md',
          codex: 'docs/PROVIDERS.md',
          adapta: 'docs/adapta.md'
        }
        const arq = mapa[c.id] || (c.usa ? null : 'docs/PROVIDERS.md')
        const raiz = pasta()
        if (arq && raiz && window.dgUi) {
          // best-effort: abrir no editor se existir caminho relativo
          const full = raiz.replace(/[\/]+$/, '') + '\\' + arq.replace(/\//g, '\\')
          void window.api.invoke('arquivo:existe', full, [raiz]).then((ex) => {
            if (ex && ex.ok && ex.existe && typeof window.abrirArquivoNaAba === 'function') {
              void window.abrirArquivoNaAba(full)
            } else if (window.dgToast) window.dgToast('Docs: ' + arq, 'aviso')
          })
        } else if (window.dgToast) window.dgToast((c.usa ? 'Canal: ' + c.usa : 'Sem docs mapeados'), 'aviso')
      })
      linha.appendChild(info)
      linha.appendChild(testar)
      linha.appendChild(docs)
      caixa.appendChild(linha)
    }
    corpo.appendChild(caixa)

    const st = await seguro('mcp:status')
    const tools = await seguro('mcp:tools')
    const nomes = (tools && tools.tools) || []
    const mcpBox = document.createElement('section')
    mcpBox.className = 'tool-bloco'
    const mcpTitulo = document.createElement('h4')
    mcpTitulo.textContent =
      st && st.habilitado === false
        ? 'MCP desligado'
        : st && st.ativo
          ? 'MCP ligado'
          : 'MCP'
    mcpBox.appendChild(mcpTitulo)
    const mcpAcoes = document.createElement('div')
    mcpAcoes.className = 'tool-acao-linha'
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'tool-nav-btn'
    toggle.textContent = st && st.habilitado === false ? 'Ativar MCP' : 'Desativar MCP'
    toggle.addEventListener('click', async () => {
      const novo = !(st && st.habilitado !== false)
      const r = await seguro('mcp:set-habilitado', novo)
      if (window.dgToast) {
        window.dgToast(
          r && r.ok ? (novo ? 'MCP ativado' : 'MCP desativado') : 'Falha: ' + ((r && r.erro) || ''),
          r && r.ok ? 'ok' : 'erro'
        )
      }
      await pintarConectores()
    })
    const smoke = document.createElement('button')
    smoke.type = 'button'
    smoke.className = 'tool-nav-btn'
    smoke.textContent = 'Smoke MCP'
    smoke.addEventListener('click', async () => {
      smoke.disabled = true
      smoke.textContent = '...'
      const r = await seguro('mcp:smoke')
      const msg =
        r && r.ok
          ? 'OK — ' + (r.tools || 0) + ' tools'
          : 'Falha — ' + ((r && r.erro) || 'sem tools')
      if (window.dgToast) window.dgToast(msg, r && r.ok ? 'ok' : 'erro')
      smoke.disabled = false
      smoke.textContent = 'Smoke MCP'
      await pintarConectores()
    })
    mcpAcoes.appendChild(toggle)
    mcpAcoes.appendChild(smoke)
    mcpBox.appendChild(mcpAcoes)
    const lista = document.createElement('p')
    lista.className = 'tool-vazio'
    lista.textContent = nomes.length
      ? nomes.map((t) => t.name).slice(0, 24).join(', ')
      : tools && tools.erro
        ? String(tools.erro)
        : 'Nenhuma ferramenta MCP respondeu.'
    mcpBox.appendChild(lista)
    corpo.appendChild(mcpBox)
    const skills = await seguro('skills:listar', pasta())
    const listaSkills = (skills && skills.skills) || []
    corpo.appendChild(bloco(
      'Skills locais',
      listaSkills.length ? listaSkills.map((s) => s.titulo || s.id) : ['Nenhuma skill em .dg-editor/skills']
    ))
  }

  async function pintarMemoria(raiz) {
    corpo.textContent = ''
    if (!raiz) {
      pedirPasta()
      return
    }
    const mem = await seguro('memoria:status', raiz)
    corpo.appendChild(bloco('Índice da conversa', [
      mem && mem.ok
        ? mem.turnos + ' trechos guardados' + (mem.modelo ? ' (' + mem.modelo + ')' : '')
        : 'Sem índice ainda.'
    ]))
    const fatos = await seguro('memoria:listar', raiz)
    const itens = (fatos && fatos.itens) || []
    const caixa = document.createElement('section')
    caixa.className = 'tool-bloco'
    const tituloFatos = document.createElement('h4')
    tituloFatos.textContent = 'Fatos do projeto'
    caixa.appendChild(tituloFatos)
    const nota = document.createElement('p')
    nota.className = 'tool-vazio'
    const aceitasN = itens.filter((i) => i.status === 'aceita').length
    const pendN = itens.filter((i) => i.status !== 'aceita').length
    nota.textContent =
      'Só entra no chat depois de aceito. Agora: ' +
      aceitasN +
      ' no contexto automático · ' +
      pendN +
      ' pendente(s).'
    caixa.appendChild(nota)
    if (!itens.length) {
      const vazio = document.createElement('p')
      vazio.className = 'tool-vazio'
      vazio.textContent = 'Nenhum fato ainda.'
      caixa.appendChild(vazio)
    }
    for (const item of itens) {
      const linha = document.createElement('p')
      linha.textContent = (item.status === 'aceita' ? 'Aceito: ' : 'Pendente: ') + item.texto
      caixa.appendChild(linha)
      if (item.status !== 'aceita') {
        const aceitar = document.createElement('button')
        aceitar.type = 'button'
        aceitar.className = 'tool-nav-btn'
        aceitar.textContent = 'Aceitar'
        aceitar.addEventListener('click', async () => {
          await seguro('memoria:decidir', raiz, item.id, true)
          if (window.dgToast) window.dgToast('Memória aceita — entra no próximo turno', 'ok')
          if (typeof window.dgAtualizarChipMemoria === 'function') {
            void window.dgAtualizarChipMemoria()
          }
          await pintarMemoria(raiz)
        })
        caixa.appendChild(aceitar)
      }
      const apagar = document.createElement('button')
      apagar.type = 'button'
      apagar.className = 'tool-nav-btn'
      apagar.textContent = 'Apagar'
      apagar.addEventListener('click', async () => {
        await seguro('memoria:decidir', raiz, item.id, false)
        if (typeof window.dgAtualizarChipMemoria === 'function') {
          void window.dgAtualizarChipMemoria()
        }
        await pintarMemoria(raiz)
      })
      caixa.appendChild(apagar)
    }
    const campo = document.createElement('textarea')
    campo.rows = 2
    campo.placeholder = 'Um fato curto deste projeto'
    const guardar = document.createElement('button')
    guardar.type = 'button'
    guardar.className = 'tool-nav-btn'
    guardar.textContent = 'Guardar como pendente'
    guardar.addEventListener('click', async () => {
      const t = campo.value.trim()
      if (t.length < 8) return
      await seguro('memoria:propor', raiz, t)
      campo.value = ''
      await pintarMemoria(raiz)
    })
    caixa.appendChild(campo)
    caixa.appendChild(guardar)
    corpo.appendChild(caixa)
    const chats = await seguro('chat:listar', raiz)
    const lista = (chats && (chats.chats || chats.lista)) || []
    corpo.appendChild(bloco(
      'Conversas salvas',
      Array.isArray(lista) ? lista.slice(0, 12).map((c) => c.titulo || c.id) : []
    ))
    const snap = await seguro('dossie:snapshot')
    const cam = await seguro('dossie:caminho')
    const linhas = []
    if (snap && typeof snap.totalMensagens === 'number') {
      linhas.push(snap.totalMensagens + ' mensagens no dossiê')
    }
    if (typeof cam === 'string' && cam) linhas.push(cam)
    else if (cam && cam.caminho) linhas.push(String(cam.caminho))
    corpo.appendChild(bloco('Dossiê de continuidade', linhas))
  }

  nav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tool-nav-btn')
    if (!btn || !nav.contains(btn)) return
    void abrir(btn.dataset.tool)
  })
  document.getElementById('tool-voltar')?.addEventListener('click', fechar)

  // Atalho para menu, paleta de comandos e agente abrirem uma ferramenta.
  window.dgAbrirFerramenta = (id) => abrir(String(id || ''))
  window.dgEstudioMidia = () => abrir('midia')
}
