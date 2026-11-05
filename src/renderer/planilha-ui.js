// Pergunte  planilha
(function(){
  const api = window.api || {};
  function init(){
    const container = document.getElementById('planilha-section') || document.createElement('div');
    if(!container.id) container.id = 'planilha-section';
    container.innerHTML = '<div class="secao"><h3>Pergunte  planilha</h3><input id="planilha-arq" placeholder="caminho/arquivo.csv" style="width:60%"><input id="planilha-perg" placeholder="Pergunta em portugus" style="width:60%"><button id="planilha-consultar">Consultar</button><pre id="planilha-res"></pre></div>';
    const host = document.querySelector('#painel-chat, #chat, main') || document.body;
    if(!document.getElementById('planilha-section')) host.appendChild(container);
    document.getElementById('planilha-consultar').addEventListener('click', async ()=>{
      const arq = document.getElementById('planilha-arq').value;
      const perg = document.getElementById('planilha-perg').value;
      const res = document.getElementById('planilha-res');
      try{
        const r = await api.invoke('dg:dados:consultar', arq, perg);
        res.textContent = JSON.stringify(r,null,2);
      }catch(e){ res.textContent = String(e); }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
