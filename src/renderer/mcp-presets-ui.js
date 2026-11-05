// MCP Presets UI
(function(){
  const api = window.api || {};
  function init(){
    const container = document.getElementById('mcp-presets-section') || document.createElement('div');
    if(!container.id) container.id = 'mcp-presets-section';
    container.innerHTML = '<div class="secao"><h3>Presets de MCP</h3><div id="mcp-presets-list" class="lista">Carregando...</div></div>';
    const host = document.querySelector('#configuracoes, .painel-config, [data-painel=\"config\"]') || document.body;
    if(!document.getElementById('mcp-presets-section')) host.appendChild(container);
    carregar();
  }
  async function carregar(){
    try{
      const res = await api.invoke('dg:mcp-presets:listar');
      const list = document.getElementById('mcp-presets-list');
      if(!list) return;
      const itens = res?.presets||[];
      if(!itens.length){ list.innerHTML='<div class="vazio">Sem presets</div>'; return; }
      list.innerHTML = itens.map(p=><div class="item" data-id=""><div><b></b><br><small></small></div><label><input type="checkbox"  data-toggle=""> Ativo</label></div>).join('');
      list.querySelectorAll('[data-toggle]').forEach(cb=>{
        cb.addEventListener('change', async ()=>{
          const id=cb.getAttribute('data-toggle');
          const p = itens.find(x=>x.id===id); if(p){ p.ativo=cb.checked; await api.invoke('dg:mcp-presets:salvar', itens); }
        });
      });
    }catch(e){ console.warn('[mcp-presets-ui]',e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
