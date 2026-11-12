/**
 * Traduz eventos tecnicos do agente para linguagem leiga no chat.
 * Cartão expansível estilo Cursor (Editing / explored / tools).
 */

const TOOL_LABEL = {
  projeto_arvore: 'Olhando a pasta do projeto',
  codigo_buscar: 'Procurando no codigo',
  codigo_ler: 'Lendo um arquivo',
  codigo_editar: 'Preparando alteracao no arquivo',
  disco_buscar: 'Buscando no disco',
  disco_inspecionar: 'Inspecionando pasta/arquivo',
  git_status: 'Checando status do Git',
  git_diff: 'Lendo diff do Git',
  git_commit: 'Preparando commit',
  testes_rodar: 'Rodando testes',
  qualidade_checar: 'Checando qualidade',
  projeto_smoke: 'Smoke do projeto',
  resultado_avaliar: 'Avaliando o resultado',
  dossie_read: 'Lendo o historico do projeto',
  dossie_write: 'Guardando nota no dossie',
  skill_listar: 'Listando habilidades',
  skill_ler: 'Lendo uma habilidade',
  agente_listar: 'Listando agentes',
  agente_invocar: 'Consultando um agente',
  terminal_exec: 'Rodando um comando no terminal',
  navegador_abrir: 'Abrindo o navegador',
  navegador_ler: 'Lendo a pagina',
  navegador_clicar: 'Clicando na pagina',
  ftp_listar: 'Listando arquivos no FTP',
  ftp_deploy: 'Enviando arquivos (deploy)',
  vault_list: 'Listando o vault',
  vault_read: 'Lendo nota do vault',
  vault_write: 'Escrevendo no vault',
  conector_listar: 'Checando conectores',
  automacao_listar: 'Listando automacoes',
  automacao_executar: 'Executando automacao'
}

function limparDetalhe(detalhe) {
  const t = String(detalhe || '').trim()
  if (!t) return ''
  if (/faltam argumentos|obrigat/i.test(t)) return 'Faltou um detalhe na leitura — tentando de outro jeito…'
  if (/nao encontrado|não encontrado|not found/i.test(t)) return 'Nao encontrei esse item'
  if (/timeout|excedeu/i.test(t)) return 'Demorou demais — vou tentar de novo se precisar'
  if (/^ok\b/i.test(t)) return 'Concluido'
  if (/^[{\[]/.test(t) || /"ok"\s*:/.test(t) || /A tool /i.test(t) || /Trecho:/i.test(t)) {
    return 'ok'
  }
  if (t.length > 70) return t.slice(0, 67) + '…'
  return t.replace(/\\/g, '/').replace(/^ok\s+/i, '')
}

export function humanizarStatus(raw) {
  const t = String(raw || '').trim()
  if (!t) return 'Trabalhando…'
  const iter =
    t.match(/iteracao\s+(\d+)\s*\/\s*(\d+)/i) ||
    t.match(/iteração\s+(\d+)\s*\/\s*(\d+)/i) ||
    t.match(/Passo\s+(\d+)\s+de\s+(\d+)/i)
  if (iter) {
    const rest = t.replace(iter[0], '').replace(/^[—\-\s]+/, '').trim()
    if (rest) return 'Passo ' + iter[1] + ' de ' + iter[2] + ' · ' + rest
    return 'Passo ' + iter[1] + ' de ' + iter[2]
  }
  if (/^cancelado/i.test(t)) return 'Parado a seu pedido'
  if (/heartbeat|aguardando modelo|chamando /i.test(t)) return t
  if (/analis/i.test(t)) return 'Analisando o que voce pediu…'
  if (/pesquis|busc/i.test(t)) return 'Pesquisando no projeto…'
  if (/planej/i.test(t)) return 'Montando um plano…'
  if (/gerando|escrev/i.test(t)) return 'Escrevendo a resposta…'
  if (/lendo/i.test(t)) return 'Lendo arquivos…'
  return t.replace(/^[….\s⚙■]+/, '').trim() || 'Trabalhando…'
}

export function humanizarToolInicio(nome) {
  const id = String(nome || '').trim()
  return TOOL_LABEL[id] || ('Usando a ferramenta "' + id + '"')
}

export function humanizarToolFim(nome, detalhe) {
  const base = humanizarToolInicio(nome)
  const d = limparDetalhe(detalhe)
  if (!d || /^ok$/i.test(d) || d === 'Concluido') return base
  return base
}

function garantirEstruturaCartao(card) {
  if (card.dataset.dgExpandReady === '1') return
  card.dataset.dgExpandReady = '1'
  if (!card.querySelector('.chat-work-head')) {
    card.innerHTML =
      '<button type="button" class="chat-work-head chat-work-toggle" aria-expanded="false">' +
      '<span class="chat-work-pulse" aria-hidden="true"></span>' +
      '<strong class="chat-work-title">Trabalhando…</strong>' +
      '<span class="chat-work-chev" aria-hidden="true"></span>' +
      '</button>' +
      '<p class="chat-work-step-one"></p>' +
      '<p class="chat-work-stats" hidden></p>' +
      '<ul class="chat-work-log" hidden></ul>'
  } else {
    const head = card.querySelector('.chat-work-head')
    if (head && head.tagName !== 'BUTTON') {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = head.className + ' chat-work-toggle'
      btn.setAttribute('aria-expanded', 'false')
      btn.innerHTML = head.innerHTML
      if (!btn.querySelector('.chat-work-chev')) {
        btn.insertAdjacentHTML('beforeend', '<span class="chat-work-chev" aria-hidden="true"></span>')
      }
      head.replaceWith(btn)
    }
    if (!card.querySelector('.chat-work-log')) {
      const ul = document.createElement('ul')
      ul.className = 'chat-work-log'
      ul.hidden = true
      card.appendChild(ul)
    }
  }
  const toggle = card.querySelector('.chat-work-toggle')
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1'
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true'
      const next = !open
      toggle.setAttribute('aria-expanded', next ? 'true' : 'false')
      card.classList.toggle('is-expanded', next)
      const log = card.querySelector('.chat-work-log')
      if (log) log.hidden = !next
    })
  }
}

/**
 * @param {HTMLElement | null} area
 * @param {{ titulo?: string, passo?: string, erro?: boolean, ok?: boolean, log?: string, elapsedSec?: number, modelo?: string }} opt
 */
export function atualizarCartaoTrabalho(area, opt) {
  if (!area) return null
  let card = area.querySelector('#chat-work-card')
  if (!card) {
    card = document.createElement('div')
    card.id = 'chat-work-card'
    card.className = 'chat-work-card'
    card.setAttribute('role', 'status')
    card.setAttribute('aria-live', 'polite')
    area.appendChild(card)
  }
  garantirEstruturaCartao(card)
  const title = card.querySelector('.chat-work-title')
  let stepOne = card.querySelector('.chat-work-step-one')
  if (!stepOne) {
    const ol = card.querySelector('.chat-work-steps')
    if (ol) ol.remove()
    stepOne = document.createElement('p')
    stepOne.className = 'chat-work-step-one'
    card.appendChild(stepOne)
  }
  if (opt.titulo && title) title.textContent = opt.titulo
  if (opt.passo && stepOne) {
    const p = String(opt.passo)
    if (!/^[{\[]/.test(p) && !/"ok"\s*:/.test(p) && !/A tool /i.test(p)) {
      let texto = p
      if (typeof opt.elapsedSec === 'number' && opt.elapsedSec >= 3) {
        const s = Math.floor(opt.elapsedSec)
        const tempo = s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'
        if (!/\d+s|\dm /.test(texto)) texto += ' · ' + tempo
      }
      if (opt.modelo && !/ollama|deepseek|gpt|claude|\//i.test(texto)) {
        texto += ' · ' + String(opt.modelo).slice(0, 40)
      }
      stepOne.textContent = texto
      stepOne.className =
        'chat-work-step-one' + (opt.erro ? ' is-erro' : opt.ok ? ' is-ok' : ' is-run')
    }
  }
  if (opt.log) {
    const ul = card.querySelector('.chat-work-log')
    if (ul) {
      const li = document.createElement('li')
      li.textContent = String(opt.log)
      ul.appendChild(li)
      while (ul.children.length > 24) ul.firstChild?.remove()
      if (card.classList.contains('is-expanded')) ul.hidden = false
    }
  }
  card.classList.toggle('is-erro', !!opt.erro)
  card.classList.toggle('is-done', !!opt.ok && !opt.erro && /pronto|conclu/i.test(String(opt.titulo || '')))
  card.classList.toggle('is-run', !card.classList.contains('is-done') && !opt.erro)
  return card
}

export function fecharCartaoTrabalho(area, tituloFinal) {
  const card = area && area.querySelector ? area.querySelector('#chat-work-card') : null
  if (!card) return
  const title = card.querySelector('.chat-work-title')
  if (title) title.textContent = tituloFinal || 'Pronto'
  card.classList.add('is-done')
  card.classList.remove('is-run')
  const pulse = card.querySelector('.chat-work-pulse')
  if (pulse) pulse.classList.add('is-off')
}
