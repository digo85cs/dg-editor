(function(){
  const api = window.api || {};
  let regras = [];
  function init(){
    if(document.getElementById('regras-gerais-box')) return;
    const box = document.createElement('div');
    box.id = 'regras-gerais-box';
    box.innerHTML = '<div class="secao"><h3>Regras Gerais para todos os trabalhos</h3><p style="opacity:.8">Estas regras so aplicadas a todos os agentes, skills e ferramentas do DG Editor.</p><div id="rg-list" class="lista"></div><div class="rg-add"><input id="rg-titulo" placeholder="Ttulo"><input id="rg-desc" placeholder="Descrio"><button id="rg-add">Adicionar</button><button id="rg-salvar">Salvar</button></div></div>';
    const host = document.querySelector('#configuracoes, .painel-config, [data-painel="config"]') || document.body;
    host.appendChild(box);
    document.getElementById('rg-add').onclick = add;
    document.getElementById('rg-salvar').onclick = salvar;
    carregar();
  }
  async function carregar(){
    try{ const r = await api.invoke('dg:regrasgerais:listar'); regras = r.regras||[]; render(); }catch(e){}
  }
  function render(){
    const list = document.getElementById('rg-list');
    if(!list) return;
    if(!regras.length){ list.innerHTML='<div class="vazio">Sem regras</div>'; return; }
    list.innerHTML = regras.map((x,i)=>'<div class="item"><label><input type="checkbox" '+(x.ativo!==false?'checked':'')+' data-idx="'+i+'"> <b>'+x.titulo+'</b> - '+x.descricao+'</label> <button data-del="'+i+'">Remover</button></div>').join('');
    list.querySelectorAll('[data-idx]').forEach(cb=>cb.onchange=e=>{ regras[e.target.getAttribute('data-idx')].ativo = e.target.checked; });
    list.querySelectorAll('[data-del]').forEach(b=>b.onclick=e=>{ regras.splice(e.target.getAttribute('data-del'),1); render(); });
  }
  function add(){
    const t=document.getElementById('rg-titulo').value.trim();
    const d=document.getElementById('rg-desc').value.trim();
    if(!t||!d) return;
    regras.push({id:Date.now().toString(),titulo:t,descricao:d,ativo:true,criadoEm:new Date().toISOString()});
    document.getElementById('rg-titulo').value=''; document.getElementById('rg-desc').value='';
    render();
  }
  async function salvar(){ try{ await api.invoke('dg:regrasgerais:salvar', regras); alert('Regras salvas e aplicadas aos agentes'); }catch(e){alert('Erro');} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
