/* The server snapshots the saved source; no writes to the original article. */
(()=>{
 const context=JSON.parse(document.querySelector('#editor-context').textContent);
 if(new URLSearchParams(location.search).has('export'))return;
 const button=document.createElement('button');button.type='button';button.className='font-select';button.textContent='创建自由编辑副本';button.title='保留原版式，另存为自由编辑副本';
 document.querySelector('.editor-commands').append(button);
 button.onclick=async()=>{
  if(document.querySelector('#save-dot').classList.contains('dirty')){alert('请先保存或重开原稿，再创建副本');return;}
  button.disabled=true;button.textContent='正在建立副本…';
  try{
   const r=await fetch('/api/free-copy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context)});
   const result=await r.json();if(!r.ok)throw Error(result.error);location.href=result.url;
  }catch(error){button.disabled=false;button.textContent='创建自由编辑副本';alert(error.message);}
 };
})();
