/**
 * Agentes especializados em .dg-editor/agentes/*.md
 */
import fs from 'fs'
import path from 'path'
import { askOllama } from './ollama'
import { dglog } from '../dglog'

export interface AgenteDef {
  id: string
  nome: string
  especialidade: string
  system: string
  skills: string[]
  arquivo: string
}

function dirAgentes(raiz: string): string {
  return path.join(raiz, '.dg-editor', 'agentes')
}

function semBom(bruto: string): string {
  return bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto
}

function parseAgente(arquivo: string, brutoIn: string): AgenteDef {
  const bruto = semBom(brutoIn)
  const id = path.basename(arquivo, '.md')
  let nome = id
  let especialidade = id
  let skills: string[] = []
  let system = bruto
  const fm = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (fm) {
    const meta = fm[1]
    system = fm[2].trim()
    const n = meta.match(/nome:\s*(.+)/i)
    const e = meta.match(/especialidade:\s*(.+)/i)
    const s = meta.match(/skills:\s*(.+)/i)
    if (n) nome = n[1].trim()
    if (e) especialidade = e[1].trim()
    if (s) {
      skills = s[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean)
    }
  }
  return { id, nome, especialidade, system, skills, arquivo }
}

/** Valida que o agente tem campos obrigatórios preenchidos. */
export function validarAgente(a: AgenteDef): { ok: boolean; erros: string[] } {
  const erros: string[] = []
  if (!a.nome || a.nome === a.id) erros.push('nome não preenchido no frontmatter')
  if (!a.especialidade || a.especialidade === a.id) erros.push('especialidade não preenchida no frontmatter')
  if (!a.skills.length) erros.push('skills não informadas no frontmatter')
  if (!a.system.trim()) erros.push('system prompt vazio')
  return { ok: erros.length === 0, erros }
}

export function listarAgentes(raiz: string): AgenteDef[] {
  const dir = dirAgentes(raiz)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const abs = path.join(dir, f)
      const a = parseAgente(f, fs.readFileSync(abs, 'utf8'))
      a.arquivo = abs
      const v = validarAgente(a)
      if (!v.ok) {
        dglog('[agentes] aviso: ' + a.id + ' invalido — ' + v.erros.join(', '))
        return null
      }
      return a
    })
    .filter((a): a is AgenteDef => a !== null)
}

export function lerAgente(raiz: string, id: string): AgenteDef | null {
  return listarAgentes(raiz).find((a) => a.id === id || a.nome === id) || null
}

/** Cria um agente .md em .dg-editor/agentes (não sobrescreve). */
export function criarAgente(
  raiz: string,
  opts: { id?: string; nome: string; especialidade?: string; skills?: string[]; system?: string }
): { ok: boolean; id?: string; arquivo?: string; erro?: string } {
  const nome = String(opts.nome || '').trim()
  if (!nome) return { ok: false, erro: 'nome obrigatório' }
  const id =
    String(opts.id || nome)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'agente'
  const dir = dirAgentes(raiz)
  fs.mkdirSync(dir, { recursive: true })
  const arquivo = path.join(dir, id + '.md')
  if (fs.existsSync(arquivo)) return { ok: false, erro: 'já existe: ' + id }
  const especialidade = String(opts.especialidade || nome).trim()
  const skills = (opts.skills || []).map((s) => String(s).trim()).filter(Boolean)
  const system =
    String(opts.system || '').trim() ||
    'Você é o agente ' + nome + ' do DG Editor. Responda em português do Brasil, curto e técnico.'
  const corpo =
    '---\n' +
    'nome: ' +
    nome +
    '\n' +
    'especialidade: ' +
    especialidade +
    '\n' +
    'skills: ' +
    (skills.length ? skills.join(', ') : 'leitor-codigo') +
    '\n' +
    '---\n' +
    system +
    '\n'
  fs.writeFileSync(arquivo, corpo, 'utf8')
  return { ok: true, id, arquivo }
}

export async function invocarAgente(
  raiz: string,
  id: string,
  contexto: string,
  pedido: string
): Promise<{ ok: boolean; agente: string; texto: string; modelo?: string }> {
  const ag = lerAgente(raiz, id)
  if (!ag) return { ok: false, agente: id, texto: 'agente nao encontrado: ' + id }
  const prompt = pedido
  const ctx = (ag.system ? ag.system + '\n\n' : '') + (contexto || '')
  const r = await askOllama(prompt, ctx, ag.especialidade.includes('racioc') ? 'raciocinio' : 'codigo')
  return { ok: true, agente: ag.nome, texto: r.text, modelo: r.model }
}

export function garantirAgentesPadrao(raiz: string): void {
  const dir = dirAgentes(raiz)
  fs.mkdirSync(dir, { recursive: true })
  // Nao sobrescreve agentes ja presentes em disco (playbooks expandÃ­dos).
  const padroes = [
    {
      nome: 'revisor.md',
      conteudo: `---
nome: Revisor
especialidade: revisão de mudança antes de merge
skills: leitor-codigo, refatorador, testador
---
Voce e o agente Revisor do DG Editor. Revise codigo com foco em bugs, tipos e clareza.
Responda em portugues do Brasil, curto e tecnico.`
    },
    {
      nome: 'arquiteto.md',
      conteudo: `---
nome: Arquiteto
especialidade: decisão estrutural
skills: leitor-codigo, refatorador, documentador
---
Voce e o agente Arquiteto do DG Editor. Pense em estrutura, fronteiras de modulo e riscos.
Responda em portugues do Brasil.`
    },
    {
      nome: 'seguranca.md',
      conteudo: `---
nome: Seguranca
especialidade: auditoria de segurança
skills: revisor-seguranca, leitor-codigo, documentador
---
Assume input hostil. Classifique por severidade. Nunca aprove sem evidencia no codigo.`
    },
    {
      nome: 'testador.md',
      conteudo: `---
nome: Testador
especialidade: estratégia de teste
skills: testador, leitor-codigo, debugger
---
Priorize teste que falha quando o codigo quebra. Rejeite teste que sempre passa.`
    },
    {
      nome: 'dg-engenheiro.md',
      conteudo: `---
nome: DG Engenheiro
especialidade: orquestração interna
skills: leitor-codigo, refatorador, testador, debugger, revisor-seguranca, documentador, arvore-projeto, editar-seguro
---
Voce e o engenheiro interno do DG Editor. Trabalha so com tools e skills locais. Antes de editar, le. Antes de pronto, typecheck.`
    },
    {
      nome: 'hibrido-core.md',
      conteudo: `---
nome: Hibrido Core
especialidade: predição técnica + geração segura no DG Editor
skills: leitor-codigo, arvore-projeto, editar-seguro, debugger, testador, documentador
---
Voce e o Agente Hibrido Core do DG Editor.
FASE 1 (briefing): respeite predicao de risco/rota; se stack nao verificada, leia com tools antes de afirmar.
FASE 2 — REGRAS DE GERACAO:
- Nao invente APIs, libs ou estado de arquivo nao lido (use tools MCP).
- Codigo limpo, tipado quando couber, sem placeholders.
- "Servidor" significa SEMPRE a pasta aberta do projeto (root atual). Nao existe servidor remoto salvo se o usuario nomear um host.
- "Programas instalados" na pasta: dependencias do package.json, node_modules, devDependencies, runtime Node/Python local, modelos Ollama instalados.
- CONFIRMACAO — NUNCA pedir para leitura. Executar direto: ls/dir/Get-ChildItem, npm ls/pip list, --version, grep/cat, git status/log/diff, ps/Get-Process, ollama list/ps, curl GET.
- CONFIRMACAO — PEDIR SOMENTE para escrita/destrutivo: install/remove, rm/del, git push --force/reset --hard, systemctl stop/restart, reboot, firewall, escrita em /etc. Explicar risco em UMA frase e aguardar "sim".
- NUNCA anunciar uma acao e nao executar. Se decidiu agir, execute no MESMO turno e mostre o resultado real.
- Frases como "Sim, posso acessar..." sem execucao sao PROIBIDAS.
- NUNCA incluir o nome do modelo ("ollama:...", "llama...", "qwen...") no corpo da resposta. Isso e metadado interno de log.
Anti-alucinacao: nunca invente API/arquivo nao lido. Responda em pt-BR, direto.`
    },
    {
      nome: 'free-auto.md',
      conteudo: `---
nome: Auto Free
especialidade: raciocínio geral gratuito
skills: leitor-codigo, documentador, analisador
---
Voce e o agente Auto Free do DG Editor. Otimizado para uso gratuito com modelos locais.
Responda em portugues do Brasil, direto e prático.`
    },
    {
      nome: 'free-coder.md',
      conteudo: `---
nome: Coder Free
especialidade: codificação gratuita
skills: leitor-codigo, refatorador, editar-seguro, testador
---
Voce e o agente Coder Free. Foque em código limpo, mudanças mínimas e seguras.
Responda em portugues do Brasil, técnico e conciso.`
    },
    {
      nome: 'free-assist.md',
      conteudo: `---
nome: Assist Free
especialidade: assistência geral gratuita
skills: leitor-codigo, documentador, analisador
---
Voce e o agente Assist Free. Auxilie com explicações claras e passos acionáveis.
Responda em portugues do Brasil.`
    },
    {
      nome: 'free-architect.md',
      conteudo: `---
nome: Architect Free
especialidade: arquitetura e design
skills: leitor-codigo, refatorador, documentador
---
Voce e o agente Architect Free. Foque em estrutura, módulos, fronteiras e riscos.
Responda em portugues do Brasil.`
    },
    {
      nome: 'free-debugger.md',
      conteudo: `---
nome: Debugger Free
especialidade: depuração e correção
skills: leitor-codigo, debugger, testador
---
Voce e o agente Debugger Free. Investigue passo a passo e proponha correções mínimas.
Responda em portugues do Brasil.`
    },
    {
      nome: 'free-reviewer.md',
      conteudo: `---
nome: Reviewer Free
especialidade: revisão de código
skills: leitor-codigo, revisor-seguranca, testador
---
Voce e o agente Reviewer Free. Revise com foco em bugs, tipos e segurança.
Responda em portugues do Brasil.`
    }
  ]
  for (const p of padroes) {
    const dest = path.join(dir, p.nome)
    // hibrido-core + free-* sempre atualizam (skills/presets mudam com o produto)
    const forcar =
      p.nome === 'hibrido-core.md' || p.nome.startsWith('free-')
    if (forcar || !fs.existsSync(dest)) {
      fs.writeFileSync(dest, p.conteudo, 'utf8')
    }
  }
}
