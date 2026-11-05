// Skills Hub UI
(function(){
  const api = window.api || {};
  function init(){
    const container = document.getElementById('skills-hub-section') || document.createElement('div');
    if(!container.id) container.id = 'skills-hub-section';
    container.innerHTML = '<div class="secao"><h3>Skills Hub</h3><div class="acoes"><button id="skills-importar">Importar SKILL.md</button></div><div id="skills-list" class="lista">Carregando...</div></div>';
    const host = document.querySelector('#configuracoes, .painel-config, [data-painel=\"config\"]') || document.body;
    if(!document.getElementById('skills-hub-section')) host.appendChild(container);
    document.getElementById('skills-importar')?.addEventListener('click', async ()=>{
      const txt = prompt('Cole o conteudo do SKILL.md');
      if(!txt) return;
      const nome = prompt('Nome (opcional)')||'';
      try{ await api.invoke('dg:skills:importar', txt, nome); carregar(); }catch(e){console.warn(e)}
    });
    carregar();
  }
  async function carregar(){
    try{
      const res = await api.invoke('dg:skills:listar');
      const list = document.getElementById('skills-list');
      if(!list) return;
      const itens = res?.skills||[];
      if(!itens.length){ list.innerHTML='<div class="vazio">Nenhum skill encontrado em .kilo/skills ou .agents/skills</div>'; return; }
      list.innerHTML = itens.map(s=><div class="item"><div><b></b> <small>[]</small><br><small></small></div><label><input type="checkbox"  data-s=""> Ativo</label></div>).join('');
    }catch(e){ console.warn('[skills-hub-ui]',e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
