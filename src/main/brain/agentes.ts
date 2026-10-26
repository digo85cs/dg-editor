/**
 * Agentes especializados em .dg-editor/agentes/*.md
 */
import fs from 'fs'
import path from 'path'
import { askOllama } from './ollama'

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

function parseAgente(arquivo: string, bruto: string): AgenteDef {
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

export function listarAgentes(raiz: string): AgenteDef[] {
  const dir = dirAgentes(raiz)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const abs = path.join(dir, f)
      const a = parseAgente(f, fs.readFileSync(abs, 'utf8'))
      a.arquivo = abs
      return a
    })
}

export function lerAgente(raiz: string, id: string): AgenteDef | null {
  return listarAgentes(raiz).find((a) => a.id === id || a.nome === id) || null
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
  // Nao sobrescreve agentes ja presentes em disco (playbooks expandídos).
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
    }
  ]
  for (const p of padroes) {
    const dest = path.join(dir, p.nome)
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, p.conteudo, 'utf8')
  }
}
