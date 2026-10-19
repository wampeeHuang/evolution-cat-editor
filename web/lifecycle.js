/* Hidden entries are reversible; permanent deletion requires a fresh folder preview. */
function installContentLifecycle(kind,render,reload){
  let visible=[],selected=new Set(),plan=null,busy=false,expanded=true,batch=false;
  const $=s=>document.querySelector(s),feedback=text=>$('#feedback').textContent=text;
  const icons={visible:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',hidden:'<path d="M3 9c4 8 14 8 18 0M5 12l-2 3M9 15l-1 3M15 15l1 3M19 12l2 3"/>',delete:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',batch:'<path d="M9 5h12M9 12h12M9 19h12M2 5l1 1 3-3M2 12l1 1 3-3M2 19l1 1 3-3"/>',chevron:'<path d="m6 9 6 6 6-6"/>'};
  const icon=(button,name,label)=>{button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';button.classList.add('lifecycle-icon');button.title=label;button.setAttribute('aria-label',label);};
  const selectionHead=document.createElement('th'),allBox=document.createElement('input');allBox.type='checkbox';allBox.setAttribute('aria-label','选择当前显示的全部已隐藏内容');$('thead tr').prepend(selectionHead);
  const heading=document.createElement('th');heading.textContent='操作';$('thead tr').append(heading);
  const deleteButton=document.createElement('button');deleteButton.id='delete-hidden';deleteButton.type='button';deleteButton.className='lifecycle-button danger';
  const selectionCount=document.createElement('strong');selectionCount.id='hidden-selection-count';
  const dialog=document.createElement('dialog');dialog.id='delete-content-dialog';dialog.innerHTML='<h2>确认永久删除</h2><p>将删除下列整个作品文件夹及其中所有文件，包括 HTML、图片、视频和素材。此操作不进入 Windows 回收站，无法从本工具恢复。</p><div id="delete-content-list"></div><p id="delete-content-error" role="status"></p><div class="delete-actions"><button type="button" id="delete-content-cancel" class="lifecycle-button">取消</button><button type="button" id="delete-content-confirm" class="lifecycle-button danger" disabled>永久删除</button></div>';document.body.append(dialog);
  icon(deleteButton,'delete','永久删除所选');icon($('#delete-content-confirm'),'delete','确认永久删除');
  const request=async(route,body)=>{const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw Error(result.error||'操作失败');return result;};
  const updateSelection=()=>{const hidden=visible.filter(i=>i.trashedAt),n=hidden.filter(i=>selected.has(i.id)).length;selectionCount.textContent=n?'已选 '+n+' 项':'';deleteButton.disabled=!n||busy;allBox.checked=!!hidden.length&&n===hidden.length;allBox.indeterminate=n>0&&n<hidden.length;allBox.disabled=!hidden.length||busy;};
  allBox.onchange=()=>{for(const i of visible.filter(i=>i.trashedAt))allBox.checked?selected.add(i.id):selected.delete(i.id);render();};
  $('#rows').addEventListener('change',e=>{const b=e.target.closest('[data-hidden-select]');if(!b)return;e.stopImmediatePropagation();b.checked?selected.add(b.dataset.hiddenSelect):selected.delete(b.dataset.hiddenSelect);updateSelection();},true);
  $('#rows').addEventListener('click',async e=>{
    const b=e.target.closest('[data-lifecycle]');if(!b)return;e.stopImmediatePropagation();
    const action=b.dataset.lifecycle;
    if(action==='delete'){await previewDelete([b.dataset.id]);return;}
    b.disabled=true;
    try{await request('/api/content-lifecycle',{kind,id:b.dataset.id,action});await reload();feedback(action==='trash'?'已隐藏并移到列表底部，本地文件保留。':'已恢复显示。');}
    catch(error){feedback(error.message);b.disabled=false;}
  },true);
  async function previewDelete(ids){
    if(busy)return;busy=true;updateSelection();
    try{plan=await request('/api/content-delete-preview',{kind,ids});plan.ids=ids;const list=$('#delete-content-list');list.replaceChildren();
      for(const entry of plan.entries){const row=document.createElement('div'),name=document.createElement('strong'),path=document.createElement('code'),size=document.createElement('p');name.textContent=entry.title+' · '+entry.type;path.textContent=entry.path;size.textContent=entry.files+' 个文件 · '+(entry.bytes/1048576).toFixed(2)+' MB';row.append(name,path,size);list.append(row);}
      $('#delete-content-error').textContent='';$('#delete-content-confirm').disabled=false;dialog.showModal();$('#delete-content-cancel').focus();
    }catch(error){feedback(error.message);}finally{busy=false;updateSelection();}
  }
  deleteButton.onclick=()=>previewDelete(visible.filter(i=>i.trashedAt&&selected.has(i.id)).map(i=>i.id));
  $('#delete-content-cancel').onclick=()=>{dialog.close();plan=null;};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else plan=null;});
  $('#delete-content-confirm').onclick=async()=>{
    if(busy||!plan)return;busy=true;$('#delete-content-confirm').disabled=true;$('#delete-content-cancel').disabled=true;
    try{const result=await request('/api/content-delete',{kind,ids:plan.ids,token:plan.token});for(const id of result.deleted)selected.delete(id);await reload();dialog.close();feedback('已永久删除 '+result.deleted.length+' 项'+(result.failed.length?'；'+result.failed.length+' 项未能完整删除，请检查文件占用：'+result.failed.map(e=>e.path+'：'+e.error).join('；'):''));plan=null;}
    catch(error){$('#delete-content-error').textContent=error.message+'。请取消后重新核对删除范围。';plan=null;}
    finally{busy=false;$('#delete-content-cancel').disabled=false;updateSelection();}
  };
  return {
    visible:()=>true,
    order:items=>items.sort((a,b)=>Number(!!a.trashedAt)-Number(!!b.trashedAt)),
    query:url=>url.searchParams.delete('trash'),
    decorate:(items,all)=>{
      visible=items;const hidden=items.filter(i=>i.trashedAt);selected=new Set([...selected].filter(id=>hidden.some(i=>i.id===id)));if(!hidden.length){batch=false;selected.clear();}selectionHead.hidden=!batch;
      const rows=[...document.querySelectorAll('#rows tr')];
      rows.forEach((row,i)=>{const item=items[i],isHidden=!!item.trashedAt;row.dataset.lifecycleId=item.id;row.classList.toggle('is-hidden',isHidden);row.hidden=isHidden&&!expanded;row.querySelectorAll('select').forEach(s=>s.disabled=isHidden);
        const selectCell=document.createElement('td');selectCell.hidden=!batch;if(batch&&isHidden){const box=document.createElement('input');box.type='checkbox';box.dataset.hiddenSelect=item.id;box.checked=selected.has(item.id);box.setAttribute('aria-label','选择 '+item.title);selectCell.append(box);}row.prepend(selectCell);
        const td=document.createElement('td');td.className='lifecycle-actions';const b=document.createElement('button');b.type='button';b.className='lifecycle-button row-action';icon(b,isHidden?'hidden':'visible',isHidden?'恢复显示':'隐藏（保留本地文件）');b.dataset.lifecycle=isHidden?'restore':'trash';b.dataset.id=item.id;b.dataset.title=item.title;b.setAttribute('aria-label',(isHidden?'恢复显示 ':'隐藏 ')+item.title);b.setAttribute('aria-pressed',String(isHidden));td.append(b);
        if(isHidden){const remove=document.createElement('button');remove.type='button';remove.className='lifecycle-button danger';icon(remove,'delete','永久删除');remove.dataset.lifecycle='delete';remove.dataset.id=item.id;remove.setAttribute('aria-label','永久删除 '+item.title);td.append(remove);}row.append(td);
      });
      if(hidden.length){const divider=document.createElement('tr');divider.className='hidden-divider';const cell=document.createElement('td');cell.colSpan=$('thead tr').children.length-(batch?0:1);const content=document.createElement('div');content.className='hidden-section-head';
        const fold=document.createElement('button');fold.type='button';fold.className='hidden-fold';fold.setAttribute('aria-expanded',String(expanded));fold.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons.chevron+'</svg>';const label=document.createElement('span');label.textContent='已隐藏 · '+hidden.length+' 项';fold.append(label);fold.onclick=()=>{expanded=!expanded;if(!expanded){batch=false;selected.clear();}render();};content.append(fold);
        const actions=document.createElement('div');actions.className='hidden-section-actions';const manage=document.createElement('button');manage.type='button';manage.className='lifecycle-button';icon(manage,'batch',batch?'退出批量清理':'批量清理');manage.setAttribute('aria-pressed',String(batch));manage.onclick=()=>{batch=!batch;expanded=true;if(!batch)selected.clear();render();};actions.append(manage);
        if(batch){const selectLabel=document.createElement('label');selectLabel.append(allBox,document.createTextNode('全选'));actions.prepend(selectLabel);actions.append(selectionCount,deleteButton);}content.append(actions);cell.append(content);divider.append(cell);rows[items.findIndex(i=>i.trashedAt)].before(divider);
      }
      const hiddenTotal=all.filter(i=>i.trashedAt).length;if(hiddenTotal)$('#summary').textContent+=' · 已隐藏 '+hiddenTotal+' 项';updateSelection();
    }
  };
}
