/**
 * Slash commands locais (/refatorar, /corrigir, /testar, /documentar)
 */
const SLASH_COMMANDS = [
  { cmd: '/refatorar', desc: 'Refatorar código selecionado/arquivo', prompt: 'Refatore o código mantendo comportamento, melhorando legibilidade.' },
  { cmd: '/corrigir', desc: 'Corrigir bugs/erros', prompt: 'Corrija bugs e erros. Explique brevemente as correções.' },
  { cmd: '/testar', desc: 'Gerar testes', prompt: 'Gere testes unitários apropriados para o código.' },
  { cmd: '/documentar', desc: 'Adicionar documentação', prompt: 'Adicione comentários e documentação clara.' },
  { cmd: '/explicar', desc: 'Explicar código', prompt: 'Explique o código de forma clara e didática.' },
  { cmd: '/otimizar', desc: 'Otimizar performance', prompt: 'Otimize sem alterar comportamento. Foque em melhorias práticas.' },
]

export function handleSlashCommand(input, callback) {
  const text = input.trim()
  if (!text.startsWith('/')) return false
  for (const sc of SLASH_COMMANDS) {
    if (text.startsWith(sc.cmd)) {
      const rest = text.slice(sc.cmd.length).trim()
      callback(sc.prompt + (rest ? '\n\n' + rest : ''))
      return true
    }
  }
  return false
}

export function getSlashCommands() {
  return SLASH_COMMANDS
}
