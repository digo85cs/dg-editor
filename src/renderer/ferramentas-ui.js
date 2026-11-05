/** Painel das cinco ferramentas, ligado so ao que o DG Editor ja executa. */
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
    memoria: 'Memória'
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
    corpo.appendChild(bloco('Pasta', ['Abra uma pasta no Explorer para ver os dados deste projeto.']))
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
    const ag = await seguro('agente:listar', raiz)
    const agentes = (ag && ag.agentes) || []
    corpo.appendChild(bloco(
      'Agentes que podem rodar',
      agentes.map((a) => a.nome + (a.especialidade ? ' — ' + a.especialidade : ''))
    ))
    const ir = document.createElement('button')
    ir.type = 'button'
    ir.className = 'tool-nav-btn'
    ir.textContent = 'Abrir a aba Agent'
    ir.addEventListener('click', () => {
      if (window.dgUi && window.dgUi.ativarAbaCentro) window.dgUi.ativarAbaCentro('agent')
    })
    corpo.appendChild(ir)
  }

  async function pintarArtefatos() {
    corpo.textContent = ''
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
    const r = await seguro('skills:listar', raiz)
    const skills = (r && r.skills) || []
    corpo.appendChild(bloco(
      'Instruções em .dg-editor/skills',
      skills.map((s) => s.titulo + (s.gatilho ? ' — quando: ' + s.gatilho : ''))
    ))
  }

  async function pintarConectores() {
    corpo.textContent = ''
    const oll = await seguro('brain:ollama-status')
    const ollamaLinha = oll && oll.installed === false
      ? 'Ollama não está instalado.'
      : oll && oll.reachable
        ? 'Ollama no ar. Modelos vistos: ' + ((oll.models && oll.models.length) || 0)
        : 'Ollama instalado, mas parado.'
    corpo.appendChild(bloco('IA local', [ollamaLinha]))
    const st = await seguro('mcp:status')
    const tools = await seguro('mcp:tools')
    const nomes = (tools && tools.tools) || []
    corpo.appendChild(bloco(
      st && st.ativo ? 'MCP ligado' : 'MCP',
      nomes.length
        ? nomes.map((t) => t.name + (t.description ? ' — ' + String(t.description).slice(0, 80) : ''))
        : [tools && tools.erro ? String(tools.erro) : 'Nenhuma ferramenta MCP respondeu.']
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
    nota.textContent = 'So entra no chat depois de aceito.'
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
}
