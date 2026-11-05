(function(){
  function aplicar(){
    try{
      const t = localStorage.getItem('dg-tema') || 'escuro';
      document.body.classList.toggle('tema-escuro', t==='escuro');
      document.body.classList.toggle('tema-claro', t!=='escuro');
    }catch(e){}
  }
  aplicar();
  window.addEventListener('storage', (e)=>{ if(e.key==='dg-tema') aplicar(); });
})();
