import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listarAgentes } from '../brain/agentes'
import { selecionarMelhorAgente, resolverRotaChat, detectarIntencao } from '../agent-router'

const mockListarAgentes = vi.mocked(listarAgentes)

vi.mock('../brain/agentes', () => ({
  listarAgentes: vi.fn(() => [
    { id: 'dg-engenheiro', nome: 'DG Engenheiro', especialidade: 'codigo', skills: ['leitor-codigo', 'refatorador', 'debugger', 'testador'], arquivo: '' },
    { id: 'hibrido-core', nome: 'Hibrido Core', especialidade: 'geral', skills: ['leitor-codigo', 'documentador', 'analisador', 'refatorador'], arquivo: '' },
    { id: 'qoder', nome: 'Qoder', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
    { id: 'trae', nome: 'Trae', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
    { id: 'revisor', nome: 'Revisor', especialidade: 'revisao', skills: ['revisor-seguranca', 'leitor-codigo', 'testador'], arquivo: '' },
    { id: 'free-auto', nome: 'Auto Free', especialidade: 'gratuito', skills: ['leitor-codigo', 'documentador', 'analisador'], arquivo: '' }
  ])
}))

describe('selecionarMelhorAgente', () => {
  beforeEach(() => {
    mockListarAgentes.mockReturnValue([
      { id: 'dg-engenheiro', nome: 'DG Engenheiro', especialidade: 'codigo', skills: ['leitor-codigo', 'refatorador', 'debugger', 'testador'], arquivo: '' },
      { id: 'hibrido-core', nome: 'Hibrido Core', especialidade: 'geral', skills: ['leitor-codigo', 'documentador', 'analisador', 'refatorador'], arquivo: '' },
      { id: 'qoder', nome: 'Qoder', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
      { id: 'trae', nome: 'Trae', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
      { id: 'revisor', nome: 'Revisor', especialidade: 'revisao', skills: ['revisor-seguranca', 'leitor-codigo', 'testador'], arquivo: '' },
      { id: 'free-auto', nome: 'Auto Free', especialidade: 'gratuito', skills: ['leitor-codigo', 'documentador', 'analisador'], arquivo: '' }
    ])
  })

  it('escolhe dg-engenheiro para intencao codigo', () => {
    const melhor = selecionarMelhorAgente('/tmp/test', 'codigo', 'codigo')
    expect(melhor).toBe('dg-engenheiro')
  })

  it('escolhe hibrido-core para intencao geral', () => {
    const melhor = selecionarMelhorAgente('/tmp/test', 'geral', 'chat')
    expect(melhor).toBe('hibrido-core')
  })

  it('escolhe qoder/trae para codigo quando dg-engenheiro nao disponível', () => {
    mockListarAgentes.mockReturnValue([
      { id: 'qoder', nome: 'Qoder', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'debugger'], arquivo: '' },
      { id: 'trae', nome: 'Trae', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'debugger'], arquivo: '' }
    ])
    const melhor = selecionarMelhorAgente('/tmp/test', 'codigo', 'codigo')
    expect(['qoder', 'trae']).toContain(melhor)
  })

  it('preferencia por tarefa: codigo para codigo, hibrido-core para chat', () => {
    const cod = selecionarMelhorAgente('/tmp/test', 'codigo', 'codigo')
    const ger = selecionarMelhorAgente('/tmp/test', 'geral', 'chat')
    expect(cod).toBe('dg-engenheiro')
    expect(ger).toBe('hibrido-core')
  })

  it('free-* cai no final da lista', () => {
    mockListarAgentes.mockReturnValue([
      { id: 'free-auto', nome: 'Auto Free', especialidade: 'gratuito', skills: ['leitor-codigo', 'refatorador', 'debugger'], arquivo: '' },
      { id: 'dg-engenheiro', nome: 'DG Engenheiro', especialidade: 'codigo', skills: ['leitor-codigo', 'refatorador', 'debugger'], arquivo: '' }
    ])
    const melhor = selecionarMelhorAgente('/tmp/test', 'codigo', 'codigo')
    expect(melhor).toBe('dg-engenheiro')
  })
})

describe('resolverRotaChat com raiz', () => {
  beforeEach(() => {
    mockListarAgentes.mockReturnValue([
      { id: 'dg-engenheiro', nome: 'DG Engenheiro', especialidade: 'codigo', skills: ['leitor-codigo', 'refatorador', 'debugger', 'testador'], arquivo: '' },
      { id: 'hibrido-core', nome: 'Hibrido Core', especialidade: 'geral', skills: ['leitor-codigo', 'documentador', 'analisador', 'refatorador'], arquivo: '' },
      { id: 'qoder', nome: 'Qoder', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
      { id: 'trae', nome: 'Trae', especialidade: 'agente autonomo', skills: ['leitor-codigo', 'refatorador', 'editar-seguro', 'testador', 'debugger'], arquivo: '' },
      { id: 'revisor', nome: 'Revisor', especialidade: 'revisao', skills: ['revisor-seguranca', 'leitor-codigo', 'testador'], arquivo: '' },
      { id: 'free-auto', nome: 'Auto Free', especialidade: 'gratuito', skills: ['leitor-codigo', 'documentador', 'analisador'], arquivo: '' }
    ])
  })

  it('agente auto + raiz => escolhe melhor agente para codigo', () => {
    const r = resolverRotaChat('auto', 'refatorar o codigo do projeto', '/tmp/test')
    expect(r.kind).toBe('agente')
    expect(r.agente).toBe('dg-engenheiro')
    expect(r.tarefa).toBe('codigo')
  })

  it('agente auto + raiz => escolhe melhor agente para geral', () => {
    const r = resolverRotaChat('auto', 'me fale sobre arquitetura de software', '/tmp/test')
    expect(r.kind).toBe('agente')
    expect(r.agente).toBe('hibrido-core')
    expect(r.tarefa).toBe('codigo')
  })

  it('agente especificado respeita a escolha do usuario', () => {
    const r = resolverRotaChat('qoder', 'refatorar codigo', '/tmp/test')
    expect(r.kind).toBe('agente')
    expect(r.agente).toBe('qoder')
  })

  it('cumprimento curto fica no chat sem raiz', () => {
    const r = resolverRotaChat('auto', 'oi', '/tmp/test')
    expect(r.kind).toBe('chat')
  })
})

describe('detectarIntencao', () => {
  it('detecta codigo para pedidos de refatoracao', () => {
    expect(detectarIntencao('refatorar o codigo')).toBe('codigo')
  })
  it('detecta video para pedidos de video', () => {
    expect(detectarIntencao('gerar um video curta')).toBe('video')
  })
  it('detecta imagem para pedidos de imagem', () => {
    expect(detectarIntencao('criar uma imagem flux')).toBe('imagem')
  })
  it('detecta geral para pedidos genericos', () => {
    expect(detectarIntencao('me fale sobre o projeto')).toBe('geral')
  })
})
