// skill-chip.js — skill ativa do chat (localStorage + chip no header).
// Extraído de app.js. focarPainelIa é injetado via configurarSkillChip().
import { mostrarToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

let focarPainelIa = null

/** Registra callback do app.js. Chamar uma vez no boot. */
export function configurarSkillChip(deps) {
  if (deps && typeof deps.focarPainelIa === 'function') focarPainelIa = deps.focarPainelIa
}

export function skillAtivaChat() {
  try { return localStorage.getItem('dg-chat-skill') || '' } catch { return '' }
}

export function definirSkillChat(id, titulo) {
  try {
    if (id) localStorage.setItem('dg-chat-skill', id)
    else localStorage.removeItem('dg-chat-skill')
    if (titulo) localStorage.setItem('dg-chat-skill-titulo', titulo)
    else localStorage.removeItem('dg-chat-skill-titulo')
  } catch {}
  atualizarChipSkillChat()
  if (id) {
    focarPainelIa?.('chat')
    mostrarToast('Skill ativa: ' + (titulo || id), 'ok')
  }
}

export function atualizarChipSkillChat() {
  const meta = $('chat-header-meta')
  if (!meta) return
  let chip = document.getElementById('chat-skill-chip')
  const id = skillAtivaChat()
  let titulo = ''
  try { titulo = localStorage.getItem('dg-chat-skill-titulo') || id } catch { titulo = id }
  if (!id) {
    if (chip) chip.remove()
    return
  }
  if (!chip) {
    chip = document.createElement('button')
    chip.type = 'button'
    chip.id = 'chat-skill-chip'
    chip.className = 'chat-skill-chip'
    chip.title = 'Clique para remover a skill do proximo turno'
    chip.addEventListener('click', () => definirSkillChat('', ''))
    meta.appendChild(chip)
  }
  chip.textContent = 'Skill: ' + titulo + ' ×'
}

window.dgChatUsarSkill = definirSkillChat
