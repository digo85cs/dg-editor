// status-mappers.js — mappers puros estado→rotulo dos painéis de status.
// Extraidos de extras-ui.js (pintarStatusUpdate / pintarDepsManutencao).

/**
 * Estado do auto-update → rotulos da status bar + botao.
 * @returns {{texto:string,title:string,botao:string,botaoTitle:string}}
 */
export function rotuloStatusUpdate(st) {
  const msg = st?.mensagem || '—'
  const semFeed = /nenhuma release|sem feed de release/i.test(msg)
  const texto =
    st?.estado === 'pronta'
      ? 'Update pronta'
      : st?.estado === 'baixando'
        ? 'Update ' + (st.progresso || 0) + '%'
        : st?.estado === 'disponivel'
          ? 'Update ' + (st.versaoRemota || '')
          : st?.estado === 'atualizado'
            ? semFeed
              ? 'sem release'
              : 'v' + (st.versaoAtual || '')
            : st?.estado === 'erro'
              ? 'update erro'
              : st?.empacotado
                ? msg.slice(0, 28)
                : 'dev'
  return {
    texto,
    title: msg + (st?.erro ? ' — ' + st.erro : ''),
    botao: st?.estado === 'pronta' ? 'Reiniciar' : 'Update',
    botaoTitle:
      st?.estado === 'pronta'
        ? 'Reiniciar e aplicar atualização'
        : semFeed
          ? 'Ainda não há release no GitHub — publique com scripts/publicar-release.ps1'
          : 'Verificar atualização do DG Editor'
  }
}

/**
 * Estado da manutencao de deps → badge da status bar.
 * @returns {{badge:string,badgeTitle:string,statusTexto:string}}
 */
export function resumoDepsManutencao(st) {
  const itens = Array.isArray(st?.itens) ? st.itens : []
  const pend = itens.filter((i) => !i.instalado || i.precisaAtualizar).length
  return {
    badge: !st?.winget
      ? 'Deps: sem winget'
      : st?.emCurso
        ? 'Deps: atualizando…'
        : pend > 0
          ? 'Deps: ' + pend + ' pend.'
          : 'Deps: ok',
    badgeTitle: st?.ultimaMensagem || st?.mensagem || 'Ferramentas do sistema',
    statusTexto:
      (st?.ultimaMensagem || st?.mensagem || '—') +
      (st?.ultimaExecucao ? ' · ' + new Date(st.ultimaExecucao).toLocaleString() : '')
  }
}

/** Lista de itens de deps → HTML <li> (mesmo formato do painel atual). */
export function htmlItensDeps(itens) {
  return (Array.isArray(itens) ? itens : [])
    .map((i) => {
      const estado = !i.instalado
        ? 'ausente'
        : i.precisaAtualizar
          ? 'atualizar → ' + (i.versaoDisponivel || '?')
          : 'ok ' + (i.versaoAtual || '')
      return '<li><strong>' + String(i.nome || i.id) + '</strong> — ' + estado + '</li>'
    })
    .join('')
}
