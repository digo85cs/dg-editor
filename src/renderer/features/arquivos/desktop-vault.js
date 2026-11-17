// Permissão de "Controle do PC" (sessão) + painel do vault Obsidian.
import { state } from '../../state/app-state.js'
import { mostrarToast } from '../ui/toast.js'

const $ = (id) => document.getElementById(id)

let deps = {
  nomeArquivo: (p) => p,
  caminhoNoVault: () => false,
  ehMarkdown: () => false,
  abrirArquivoNaAba: async () => {},
  adicionarPasta: () => {},
  selecionarPasta: async () => {},
  toggleRight: () => {},
  ativarAbaDireita: () => {},
  appendChatToolTrace: () => {},
  setChatLiveStatus: () => {}
}

export function configurarDesktopVault(d) {
  deps = { ...deps, ...d }
}

/** Controle do PC: pede permissão explícita (sessão). */
export function desktopPermitido() {
  try {
    return sessionStorage.getItem('dg-desktop-use') === '1'
  } catch {
    return false
  }
}

export function pedirPermissaoDesktop() {
  let modal = $('modal-desktop-use')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-desktop-use'
    modal.className = 'modal hidden'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.innerHTML =
      '<div class="modal-box modal-desktop-box">' +
      '<h3>Controle do computador</h3>' +
      '<p class="muted">O Agent pode abrir o navegador embutido, terminal e testar navegação. ' +
      'Ele <strong>pede antes</strong> de agir fora do editor. Conceder só nesta sessão?</p>' +
      '<div class="desktop-perm-actions">' +
      '<button type="button" class="btn-ghost" id="desktop-use-negar">Agora não</button>' +
      '<button type="button" class="btn-primary" id="desktop-use-ok">Permitir nesta sessão</button>' +
      '</div></div>'
    document.body.appendChild(modal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden')
    })
    modal.querySelector('#desktop-use-negar')?.addEventListener('click', () => {
      try { sessionStorage.setItem('dg-desktop-use', '0') } catch {}
      modal.classList.add('hidden')
      mostrarToast('Controle do PC negado nesta sessão', 'aviso')
      $('btn-desktop-use')?.classList.remove('active')
    })
    modal.querySelector('#desktop-use-ok')?.addEventListener('click', () => {
      try { sessionStorage.setItem('dg-desktop-use', '1') } catch {}
      modal.classList.add('hidden')
      mostrarToast('Controle do PC permitido nesta sessão', 'ok')
      $('btn-desktop-use')?.classList.add('active')
      deps.toggleRight(true)
      deps.ativarAbaDireita('browser')
      deps.appendChatToolTrace('… Controle do PC autorizado — posso usar Navegador/Terminal no bloco 3')
      deps.setChatLiveStatus('Controle do PC ativo')
    })
  }
  if (desktopPermitido()) {
    mostrarToast('Controle do PC já está ativo nesta sessão', 'ok')
    $('btn-desktop-use')?.classList.add('active')
    return
  }
  modal.classList.remove('hidden')
}

export async function abrirVault() {
  const r = await window.api.invoke('vault:abrir')
  if (r?.canceled) return
  if (!r?.ok) {
    alert('Não foi possível abrir o vault: ' + (r?.erro || 'erro'))
    return
  }
  state.vaultRaiz = r.raiz
  deps.adicionarPasta(r.raiz)
  await deps.selecionarPasta(r.raiz)
  const sec = $('vault-section')
  if (sec) sec.hidden = false
  const st = $('vault-status')
  if (st) st.textContent = deps.nomeArquivo(r.raiz) + ' · ' + (r.total || 0) + ' notas'
  await atualizarPainelVault(state.abaAtiva)
}

export async function fecharVault() {
  await window.api.invoke('vault:fechar')
  state.vaultRaiz = null
  const sec = $('vault-section')
  if (sec) sec.hidden = true
  const st = $('vault-status')
  if (st) st.textContent = 'Nenhum vault'
  const bl = $('vault-backlinks')
  if (bl) bl.innerHTML = ''
  const tg = $('vault-tags')
  if (tg) tg.innerHTML = ''
}

export async function atualizarPainelVault(caminho) {
  if (!state.vaultRaiz) return
  const bl = $('vault-backlinks')
  const tg = $('vault-tags')
  if (bl) {
    bl.innerHTML = ''
    if (caminho && deps.caminhoNoVault(caminho) && deps.ehMarkdown(caminho)) {
      const r = await window.api.invoke('vault:backlinks', caminho)
      const itens = r?.backlinks || []
      if (!itens.length) {
        bl.innerHTML = '<span class="muted">Nenhum backlink</span>'
      } else {
        for (const n of itens) {
          const b = document.createElement('button')
          b.type = 'button'
          b.textContent = n.titulo || n.rel
          b.title = n.rel
          b.addEventListener('click', () => void deps.abrirArquivoNaAba(n.path))
          bl.appendChild(b)
        }
      }
    } else {
      bl.innerHTML = '<span class="muted">Abra uma nota do vault</span>'
    }
  }
  if (tg) {
    tg.innerHTML = ''
    const r = await window.api.invoke('vault:tags')
    const tags = r?.tags || {}
    const keys = Object.keys(tags).sort((a, b) => a.localeCompare(b))
    if (!keys.length) {
      tg.innerHTML = '<span class="muted">Sem tags</span>'
    } else {
      for (const k of keys.slice(0, 40)) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = '#' + k + ' (' + tags[k].length + ')'
        b.title = tags[k].map((x) => x.rel).join(', ')
        b.addEventListener('click', () => {
          const first = tags[k][0]
          if (first) void deps.abrirArquivoNaAba(first.path)
        })
        tg.appendChild(b)
      }
    }
  }
}

export async function abrirWikiLink(alvo) {
  if (!state.vaultRaiz) {
    alert('Abra um vault para resolver [[links]].')
    return
  }
  const r = await window.api.invoke('vault:resolver-link', alvo, state.abaAtiva || undefined)
  if (!r?.path) {
    alert('Nota não encontrada: [[' + alvo + ']]')
    return
  }
  await deps.abrirArquivoNaAba(r.path)
  void atualizarPainelVault(r.path)
}
