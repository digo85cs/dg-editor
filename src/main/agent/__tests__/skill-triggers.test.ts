import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { skillsParaTarefa, blocoSkillsContexto } from '../skill-triggers'

const raiz = mkdtempSync(join(tmpdir(), 'dg-skills-'))
const dir = join(raiz, '.dg-editor', 'skills')
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, 'video.md'),
  '---\nname: video\ntriggers: vídeo, video, render, ffmpeg\n---\nUse ffmpeg para renderizar.',
  'utf8'
)
writeFileSync(join(dir, 'sem-trigger.md'), '# Sem frontmatter\n', 'utf8')

afterAll(() => {
  try { rmSync(raiz, { recursive: true, force: true }) } catch { /* */ }
})

describe('skill-triggers', () => {
  it('casa trigger por palavra-chave', () => {
    const r = skillsParaTarefa(raiz, 'preciso renderizar um vídeo de apresentação')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].nome).toBe('video')
  })

  it('nao casa quando nada relevante', () => {
    expect(skillsParaTarefa(raiz, 'arruma o typo no readme')).toHaveLength(0)
  })

  it('bloco de contexto inclui conteudo da skill', () => {
    const b = blocoSkillsContexto(raiz, 'faz um video institucional')
    expect(b).toContain('Skill: video')
    expect(b).toContain('ffmpeg')
  })
})
