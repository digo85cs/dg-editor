import fs from 'fs'
import path from 'path'
import { garantirAgentesPadrao, criarAgente, validarAgente, listarAgentes, type AgenteDef } from '../brain/agentes'

export type AgenteSugerido = {
  id: string
  nome: string
  especialidade: string
  skills: string[]
  system: string
  motivo: string
}

export function detectarAgentesNecessarios(raiz: string): AgenteSugerido[] {
  const existentes = listarAgentes(raiz).map((a) => a.id)
  const sugestoes: AgenteSugerido[] = []

  const perfis: AgenteSugerido[] = [
    {
      id: 'devin-planner',
      nome: 'Devin Planner',
      especialidade: 'planejamento de tarefas complexas e decomposição em etapas',
      skills: ['planejador', 'analisador', 'documentador'],
      system: 'Voce e o Devin Planner do DG Editor. Decompoe pedidos complexos em etapas executaveis, identifica dependencias, estima esforco e define ordem de execucao. Responda em portugues do Brasil.',
      motivo: 'Agente de planejamento autonomo tipo Devin'
    },
    {
      id: 'devin-executor',
      nome: 'Devin Executor',
      especialidade: 'execucao de codigos, tools e comandos com verificacao de resultado',
      skills: ['executor', 'debugger', 'terminal'],
      system: 'Voce e o Devin Executor do DG Editor. Executa tarefas de codificacao usando tools locais, verifica resultados, corrige erros automaticamente e reporta o que foi feito. Responda em portugues do Brasil.',
      motivo: 'Agente de execucao autonomo tipo Devin'
    },
    {
      id: 'devin-validator',
      nome: 'Devin Validator',
      especialidade: 'validacao de codigo, testes, typecheck e build',
      skills: ['validador', 'testador', 'revisor-seguranca'],
      system: 'Voce e o Devin Validator do DG Editor. Valida que o codigo esta correto: roda typecheck, testes, build, verifica regressoes e nao aprova nada que falhe. Responda em portugues do Brasil.',
      motivo: 'Agente de validacao autonomo tipo Devin'
    },
    {
      id: 'auto-pesquisador',
      nome: 'Auto Pesquisador',
      especialidade: 'pesquisa oculta de melhorias e novidades para o DG Editor',
      skills: ['pesquisador', 'analisador', 'documentador'],
      system: 'Voce e o Auto Pesquisador do DG Editor. Busca melhorias de codigo, novos pacotes, padroes de arquitetura e correcoes. Nao revela fontes externas no corpo da resposta. Responda em portugues do Brasil.',
      motivo: 'Pesquisa oculta de melhorias'
    }
  ]

  for (const p of perfis) {
    if (!existentes.includes(p.id)) {
      sugestoes.push(p)
    }
  }
  return sugestoes
}

export function autoCriarAgentes(raiz: string): { criados: string[]; erros: string[] } {
  const criados: string[] = []
  const erros: string[] = []
  const sugestoes = detectarAgentesNecessarios(raiz)

  for (const s of sugestoes) {
    const r = criarAgente(raiz, {
      id: s.id,
      nome: s.nome,
      especialidade: s.especialidade,
      skills: s.skills,
      system: s.system
    })
    if (r.ok) {
      const a = lerAgenteValidado(raiz, s.id)
      if (a && a.ok) {
        criados.push(s.id)
      } else {
        erros.push(s.id + ': invalido apos criacao — ' + (a?.erros.join(', ') || 'desconhecido'))
      }
    } else {
      erros.push(s.id + ': ' + (r.erro || 'falha'))
    }
  }

  return { criados, erros }
}

function lerAgenteValidado(raiz: string, id: string): { ok: boolean; erros: string[] } | null {
  const { lerAgente } = require('../brain/agentes')
  const a = lerAgente(raiz, id)
  if (!a) return null
  return { ok: validarAgente(a).ok, erros: validarAgente(a).erros }
}

export function listarAgentesComValidacao(raiz: string): { validos: AgenteDef[]; invalidos: AgenteDef[] } {
  const todos = listarAgentes(raiz)
  const validos: AgenteDef[] = []
  const invalidos: AgenteDef[] = []
  for (const a of todos) {
    const v = validarAgente(a)
    if (v.ok) validos.push(a)
    else invalidos.push(a)
  }
  return { validos, invalidos }
}
