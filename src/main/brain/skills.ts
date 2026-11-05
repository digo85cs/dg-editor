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

function parseMd(arquivo: string, bruto: string): Skill {
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
    }
  ]
  for (const p of padroes) {
    const dest = path.join(dir, p.nome)
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, p.conteudo, 'utf8')
  }
}
