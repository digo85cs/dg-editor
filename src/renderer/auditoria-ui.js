// Auditoria UI
(function(){
  const api = window.api || {};
  function init(){
    const container = document.getElementById('auditoria-section') || document.createElement('div');
    if(!container.id) container.id = 'auditoria-section';
    container.innerHTML = '<div class="secao"><h3>Auditoria</h3><div id="auditoria-resumo">Carregando...</div></div>';
    const host = document.querySelector('#configuracoes, .painel-config, [data-painel=\"config\"]') || document.body;
    if(!document.getElementById('auditoria-section')) host.appendChild(container);
    carregar();
  }
  async function carregar(){
    try{
      const fs = require ? (typeof require==='function'?require('fs'):null) : null;
      // fallback via IPC se disponvel
      let imp=null, ext=null;
      try{ imp = await api.invoke('auditoria:imports'); }catch(e){}
      try{ ext = await api.invoke('auditoria:externa'); }catch(e){}
      const r = document.getElementById('auditoria-resumo');
      if(!r) return;
      const qi = imp?.resumo?.quebrados?.length||0;
      const oe = ext?.resumo ? Object.values(ext.resumo).reduce((a:any,b:any)=>a+(typeof b==='number'?b:0),0) : 0;
      r.innerHTML = <div>Imports quebrados: <b></b></div><div>Externa OK/Warn/Erro: ver relatrio em .dg-editor/</div>;
    }catch(e){ console.warn('[auditoria-ui]',e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
