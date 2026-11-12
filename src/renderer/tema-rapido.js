(function(){
  function aplicar(){
    try{
      var t = localStorage.getItem('dg-tema');
      if (t !== 'claro' && t !== 'escuro') t = 'escuro';
      document.body.classList.toggle('tema-escuro', t==='escuro');
      document.body.classList.toggle('tema-claro', t!=='escuro');
    }catch(e){}
  }
  aplicar();
  window.addEventListener('storage', function(e){ if(e.key==='dg-tema') aplicar(); });
  window.__dgAplicarTemaLocal = function(t){
    try{ localStorage.setItem('dg-tema', t); }catch(e){}
    try{
      document.body.classList.toggle('tema-escuro', t==='escuro');
      document.body.classList.toggle('tema-claro', t!=='escuro');
    }catch(e){}
  };
})();
