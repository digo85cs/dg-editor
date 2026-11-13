/**
 * Skills locais em .dg-editor/skills/*.md
 * Frontmatter simples: titulo, gatilho
 */
import fs from 'fs'
import path from 'path'

export interface Skill {
  id: string
  titulo: string
  gatilho: string
  instrucao: string
  arquivo: string
}

function dirSkills(raiz: string): string {
  return path.join(raiz, '.dg-editor', 'skills')
}

function semBom(bruto: string): string {
  return bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto
}

function parseMd(arquivo: string, brutoIn: string): Skill {
  const bruto = semBom(brutoIn)
  const id = path.basename(arquivo, '.md')
  let titulo = id
  let gatilho = id
  let corpo = bruto
  const fm = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (fm) {
    const meta = fm[1]
    corpo = fm[2]
    const t = meta.match(/titulo:\s*(.+)/i)
    const g = meta.match(/gatilho:\s*(.+)/i)
    if (t) titulo = t[1].trim()
    if (g) gatilho = g[1].trim()
  }
  return { id, titulo, gatilho, instrucao: corpo.trim(), arquivo }
}

export function listarSkills(raiz: string): Skill[] {
  const dir = dirSkills(raiz)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const abs = path.join(dir, f)
      const s = parseMd(f, fs.readFileSync(abs, 'utf8'))
      s.arquivo = abs
      return s
    })
}

export function lerSkill(raiz: string, id: string): Skill | null {
  return listarSkills(raiz).find((s) => s.id === id || s.titulo === id) || null
}

/** Cria skill .md em .dg-editor/skills (não sobrescreve). */
export function criarSkill(
  raiz: string,
  opts: { id?: string; titulo: string; gatilho?: string; instrucao?: string }
): { ok: boolean; id?: string; arquivo?: string; erro?: string } {
  const titulo = String(opts.titulo || '').trim()
  if (!titulo) return { ok: false, erro: 'título obrigatório' }
  const id =
    String(opts.id || titulo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'skill'
  const dir = dirSkills(raiz)
  fs.mkdirSync(dir, { recursive: true })
  const arquivo = path.join(dir, id + '.md')
  if (fs.existsSync(arquivo)) return { ok: false, erro: 'já existe: ' + id }
  const gatilho = String(opts.gatilho || titulo).trim()
  const instrucao =
    String(opts.instrucao || '').trim() ||
    'Skill ' + titulo + ': siga o pedido do usuário com foco no gatilho "' + gatilho + '".'
  const corpo =
    '---\n' +
    'titulo: ' +
    titulo +
    '\n' +
    'gatilho: ' +
    gatilho +
    '\n' +
    '---\n' +
    instrucao +
    '\n'
  fs.writeFileSync(arquivo, corpo, 'utf8')
  return { ok: true, id, arquivo }
}

/** Escolhe skills cujo gatilho aparece na pergunta. */
export function skillsRelevantes(raiz: string, pergunta: string, limite = 2): Skill[] {
  const q = pergunta.toLowerCase()
  return listarSkills(raiz)
    .filter((s) => {
      const parts = s.gatilho.toLowerCase().split(/[,|;]/).map((x) => x.trim()).filter(Boolean)
      return parts.some((p) => q.includes(p))
    })
    .slice(0, limite)
}

/** Carrega skills pelo id/titulo declarado no agente. */
export function skillsPorIds(raiz: string, ids: string[]): Skill[] {
  const out: Skill[] = []
  const seen = new Set<string>()
  for (const id of ids || []) {
    const s = lerSkill(raiz, String(id).trim())
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      out.push(s)
    }
  }
  return out
}

export interface SkillPack {
  id: string
  pastas?: string[]
  skills: string[]
  sempre?: boolean
}

function caminhoPacks(raiz: string): string {
  return path.join(raiz, '.dg-editor', 'skill-packs.json')
}

export function garantirSkillPacksPadrao(raiz: string): void {
  const dir = path.join(raiz, '.dg-editor')
  fs.mkdirSync(dir, { recursive: true })
  const dest = caminhoPacks(raiz)
  if (fs.existsSync(dest)) return
  const padrao = {
    packs: [
      {
        id: 'free',
        sempre: true,
        skills: ['free-mode', 'editar-seguro', 'leitor-codigo']
      },
      {
        id: 'web',
        pastas: ['src/renderer', 'src/main/mcp', 'public'],
        skills: ['navegador-embutido', 'editar-seguro']
      },
      {
        id: 'backend',
        pastas: ['src/main', 'src/preload'],
        skills: ['leitor-codigo', 'editar-seguro', 'debugger']
      }
    ] as SkillPack[]
  }
  fs.writeFileSync(dest, JSON.stringify(padrao, null, 2), 'utf8')
}

export function lerSkillPacks(raiz: string): SkillPack[] {
  garantirSkillPacksPadrao(raiz)
  try {
    const j = JSON.parse(fs.readFileSync(caminhoPacks(raiz), 'utf8')) as { packs?: SkillPack[] }
    return Array.isArray(j.packs) ? j.packs : []
  } catch {
    return []
  }
}

/** Packs ativos: sempre=true ou pasta do pack existe no projeto. */
export function skillsDosPacks(raiz: string): Skill[] {
  const packs = lerSkillPacks(raiz)
  const ids: string[] = []
  for (const p of packs) {
    const pastas = p.pastas || []
    const hit =
      p.sempre === true ||
      pastas.length === 0 ||
      pastas.some((rel) => fs.existsSync(path.join(raiz, rel)))
    if (hit) ids.push(...(p.skills || []))
  }
  return skillsPorIds(raiz, ids)
}

/**
 * Une skills do agente + packs por pasta + gatilhos da pergunta (sem duplicar).
 */
export function skillsAtivasParaTurno(
  raiz: string,
  pergunta: string,
  agenteSkills: string[] = [],
  limite = 8
): Skill[] {
  garantirSkillsPadrao(raiz)
  garantirSkillPacksPadrao(raiz)
  const mapa = new Map<string, Skill>()
  // Estilo Cursor sempre ativo (inventario/editar/corrigir/melhorar)
  for (const s of [
    ...skillsPorIds(raiz, ['estilo-cursor', ...agenteSkills]),
    ...skillsDosPacks(raiz),
    ...skillsRelevantes(raiz, pergunta, 3)
  ]) {
    if (!mapa.has(s.id)) mapa.set(s.id, s)
  }
  return [...mapa.values()].slice(0, limite)
}

export function garantirSkillsPadrao(raiz: string): void {
  const dir = dirSkills(raiz)
  fs.mkdirSync(dir, { recursive: true })
  const padroes: Array<{ nome: string; conteudo: string }> = [
    {
      nome: 'editar-seguro.md',
      conteudo: `---
titulo: Edicao segura
gatilho: editar, trocar, alterar, codigo_editar, MAX_ITER
---
Antes de editar codigo, use codigo_buscar/codigo_ler para localizar o simbolo.
Edite apenas com codigo_editar e ancora unica. Nunca reescreva o arquivo inteiro.`
    },
    {
      nome: 'arvore-projeto.md',
      conteudo: `---
titulo: Arvore do projeto
gatilho: arvore, arquivos, projeto_arvore, quantos arquivos
---
Para contar ou listar arquivos, chame a tool projeto_arvore e responda em linguagem natural com o numero.`
    },
    {
      nome: 'navegador-embutido.md',
      conteudo: `---
titulo: Navegador embutido
gatilho: navegador, painel web, login site, baixar pagina
---
Use as tools navegador_abrir, navegador_ler, navegador_clicar, navegador_preencher, navegador_baixar.
O usuario faz login MANUAL no painel Navegador (sessao persist:dgnav). Nao peca senha no chat.
Se o controle nao responder: peca para abrir Arquivo > Navegador no DG Editor.`
    },
    {
      nome: 'free-mode.md',
      conteudo: `---
titulo: Modo gratuito
gatilho: free, gratuito, local, ollama
---
Prefira modelos locais gratuitos (Ollama). Use agentes free quando solicitado.
Responda em portugues do Brasil e seja prático.`
    },
    {
      nome: 'prompt-melhorar.md',
      conteudo: `---
titulo: Melhorar prompt
gatilho: melhorar prompt, orientar prompt, refinar
---
Use o orientador de prompt para refinar. Preserve intenção e adicione contexto quando útil.`
    },
    {
      nome: 'anexos.md',
      conteudo: `---
titulo: Anexos
gatilho: anexar, imagem, pdf, audio, arquivo
---
Aceite imagens, áudios, PDFs, DOCX, XLSX, TXT, MD. Converta para contexto utilizável e responda com base neles.`
    },
    {
      nome: 'leitor-codigo.md',
      conteudo: `---
titulo: Leitor de codigo
gatilho: ler, codigo_ler, codigo_buscar, inspecionar
---
Antes de afirmar sobre o codigo, use codigo_buscar/codigo_ler. Cite arquivo e trecho real.`
    },
    {
      nome: 'refatorador.md',
      conteudo: `---
titulo: Refatorador
gatilho: refatorar, limpar, extrair, renomear
---
Prefira mudancas minimas com codigo_editar. Preserve comportamento e rode typecheck quando couber.`
    },
    {
      nome: 'testador.md',
      conteudo: `---
titulo: Testador
gatilho: teste, testar, cobertura, falha
---
Proponha teste que falha se o bug voltar. Evite asserts tautologicos.`
    },
    {
      nome: 'debugger.md',
      conteudo: `---
titulo: Debugger
gatilho: debug, bug, erro, stack, exception
---
Reproduza o sintoma, leia o trecho com tools e proponha o menor fix com evidencia.`
    },
    {
      nome: 'revisor-seguranca.md',
      conteudo: `---
titulo: Revisor de seguranca
gatilho: seguranca, xss, injecao, secret, credencial
---
Assume input hostil. Classifique risco. Nao aprove sem evidencia no codigo.`
    },
    {
      nome: 'documentador.md',
      conteudo: `---
titulo: Documentador
gatilho: documentar, README, comentario, docstring
---
Documente o que o codigo faz de verdade. Sem inventar APIs.`
    },
    {
      nome: 'analisador.md',
      conteudo: `---
titulo: Analisador
gatilho: analisar, diagnostico, auditoria, revisar
---
Mapeie causa, impacto e proximos passos curtos. Use tools para evidencias.`
    },
    {
      nome: 'terminal-local.md',
      conteudo: `---
titulo: Terminal local
gatilho: terminal, comando, shell, npm, git status
---
Use terminal_exec para comandos de leitura (status, test, build). Pedidos destrutivos exigem confirmacao do usuario.
Para achar projeto no PC (inventario), use disco_buscar — nunca Get-ChildItem C:\\ sem excluir Windows.`
    },
    {
      nome: 'inventario-disco.md',
      conteudo: `---
titulo: Inventario de disco
gatilho: inventario, Get-ChildItem, Test-Path, AutoPartz, partz, bloco A, app_quebrada, NÃO ENCONTRADO
---
Protocolo obrigatorio (estilo Cursor):
1. Chame disco_buscar com o padrao do nome (ex: partz|autopartz). Nao varra C:\\Windows.
2. Autopilot/Autoplay/WinSxS = falso positivo. Descarte e continue.
3. AutoPartz pode ser a pasta "AUTO PARTS APP" no OneDrive\\CURSOR.
4. No caminho util: disco_inspecionar + git status/log + Select-String nas rotas pedidas.
5. Complete TODOS os blocos (A/B/C/D) e as N linhas pedidas. Falta = NÃO ENCONTRADO. Nao invente.`
    },
    {
      nome: 'estilo-cursor.md',
      conteudo: `---
titulo: Estilo Cursor Agent
gatilho: inventariar, modificar, corrigir, melhorar, editar, analisar, implementar, validar, faca, execute, sempre
---
Espelhe o Cursor Agent em qualquer pedido (inventario, edicao, correcao, melhoria):
1. Tools no mesmo turno — resultado real, nao promessa.
2. Ler antes de editar (codigo_buscar/codigo_ler). Editar com codigo_editar; mostrar o que mudou.
3. Inventario/disco: disco_buscar/disco_inspecionar; nunca aceitar ruido Windows.
4. Checklist do usuario: complete tudo; falta = NÃO ENCONTRADO.
5. Resposta curta em pt-BR, um bloco limpo, um unico "copiar tudo" no UI.
6. Nao peca confirmacao para leitura/status/diagnostico.`
    },
    {
      nome: 'roteiro-shorts.md',
      conteudo: `---
titulo: Roteirista de shorts
gatilho: roteiro, short, reels, tiktok, gancho
---
Estruture em: gancho (0-3s), contexto, desenvolvimento, virada e CTA.
Escreva falas curtas, com uma ideia por frase. Informe a duracao alvo e o formato (9:16).
Nao prometa viralizacao; foque em clareza e retencao.`
    },
    {
      nome: 'thumbnail-design.md',
      conteudo: `---
titulo: Designer de thumbnail
gatilho: thumbnail, capa, miniatura, clique
---
Proponha 3 conceitos de capa 1280x720 com alto contraste, no maximo 3 palavras e um foco visual.
Use rostos/objetos grandes, fundo limpo e leitura em tela pequena. Descreva o prompt visual.`
    },
    {
      nome: 'legenda-automatica.md',
      conteudo: `---
titulo: Legenda automatica
gatilho: legenda, srt, transcricao, subtitulo
---
Transcreva com a tool de transcricao, revise nomes proprios e quebre linhas em ate 2 por tela.
Grave abaixo da area segura e preserve o audio original. Entregue o .srt junto do video.`
    },
    {
      nome: 'publicacao-social.md',
      conteudo: `---
titulo: Publicador social
gatilho: publicar, pacote, post, descricao, hashtag
---
Monte um pacote pronto: video final, capa, legenda curta, hashtags e horario sugerido.
Nao faca upload sozinho; entregue os arquivos e o texto para o usuario revisar antes.`
    },
    {
      nome: 'pacote-memes.md',
      conteudo: `---
titulo: Pacote de memes
gatilho: meme, memes, template, imgflip
---
Sincronize o banco local antes de listar. Legendas: no maximo 2 linhas curtas por campo.
Use imagem propria ou template do banco; nunca texto de odio ou difamacao.`
    },
    {
      nome: 'dublagem-parodia.md',
      conteudo: `---
titulo: Dublagem de parodia
gatilho: parodia, dublagem, locutor, personagem
---
Use apenas os arquetipos do banco de vozes (locutor, ancora, trailer, vila, heroina etc.).
Nunca clone voz de pessoa real nem sugira que a voz pertence a alguem.
Mantenha o aviso de arquetipo e deixe o usuario escolher a voz antes de narrar.`
    },
    {
      nome: 'capa-video.md',
      conteudo: `---
titulo: Capa de video
gatilho: capa do video, frame, poster
---
Extraia um frame representativo, evite movimento e texto cortado. Se preciso, melhore a nitidez
e escreva no maximo 3 palavras. Entregue a capa junto do video.`
    }
  ]
  for (const p of padroes) {
    const dest = path.join(dir, p.nome)
    // protocolos criticos sempre atualizam
    if (
      !fs.existsSync(dest) ||
      p.nome === 'inventario-disco.md' ||
      p.nome === 'estilo-cursor.md'
    ) {
      fs.writeFileSync(dest, p.conteudo, 'utf8')
    }
  }
}
