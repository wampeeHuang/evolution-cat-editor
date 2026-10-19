(()=>{'use strict';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
let data={items:[],configured:false},statusFilter=params.get('status')||'全部';
const SORTS=['updated-desc','created-desc','name-asc','duration-desc'];
let sort=SORTS.includes(params.get('sort'))?params.get('sort'):(localStorage.getItem('evolution-video-sort')||'updated-desc');
if(!SORTS.includes(sort))sort='updated-desc';
const lifecycle=installContentLifecycle('video',render,load);
$('#search').value=params.get('q')||'';
$('#sort').value=sort;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=t=>t?new Date(t*1000).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未记录';
const dur=s=>{if(!s||!isFinite(s))return '—';const m=Math.floor(s/60),sec=Math.round(s%60);return `${m}:${String(sec).padStart(2,'0')}`;};
const size=b=>!b?'—':b>=1073741824?(b/1073741824).toFixed(2)+' GB':b>=1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB';
const STATUS=[['draft','待发布'],['published','已发布'],['parked','先放着'],['abandoned','不发了']];
const statusLabel=k=>(STATUS.find(s=>s[0]===k)||['draft','待发布'])[1];
async function post(body){const r=await fetch('/api/video-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'保存失败');return j;}

function sortList(list){
  const [key,dir]=sort.split('-');
  return list.slice().sort((a,b)=>{
    if(key==='name')return a.title.localeCompare(b.title,'zh-CN')*(dir==='asc'?1:-1);
    if(key==='duration')return (((b.mainVideo||{}).duration||0)-((a.mainVideo||{}).duration||0))*(dir==='asc'?-1:1);
    const field=key==='created'?'created':'updated';
    return ((a[field]||0)-(b[field]||0))*(dir==='asc'?1:-1)||a.title.localeCompare(b.title,'zh-CN');
  });
}
function render(){
  const q=$('#search').value.trim().toLocaleLowerCase();
  const list=sortList(data.items.filter(i=>lifecycle.visible(i)&&(statusFilter==='全部'||statusLabel(i.status)===statusFilter)&&(!q||(i.title+' '+i.folder).toLocaleLowerCase().includes(q))));
  lifecycle.order(list);
  $('#not-configured').hidden=!!data.configured;
  $('#summary').textContent=data.configured?`${data.items.filter(lifecycle.visible).length} 个视频 · 当前显示 ${list.length} 个`:'尚未配置视频目录';
  const counts=Object.fromEntries(STATUS.map(([k,l])=>[l,data.items.filter(i=>lifecycle.visible(i)&&statusLabel(i.status)===l).length]));
  $('#status-filters').innerHTML=[['全部',data.items.filter(lifecycle.visible).length],...STATUS.map(([,l])=>[l,counts[l]])].map(([name,n])=>`<button type="button" aria-pressed="${statusFilter===name}" data-status-filter="${esc(name)}">${esc(name)} <small>${n}</small></button>`).join('');
  $('#rows').innerHTML=list.map(i=>{
    return `<tr data-id="${esc(i.id)}"><td><a class="title-link video-link" href="/video/${esc(i.id)}">${i.hasCover?`<img class="cover-thumb video-thumb-img" src="${esc(i.cover)}" alt="" loading="lazy">`:'<span class="cover-thumb video-thumb-empty">无封面</span>'}<span><strong>${esc(i.title)}</strong><small class="folder-note">${esc(i.folder)}</small></span></a></td><td><select aria-label="${esc(i.title)}的状态" data-field="status" data-id="${esc(i.id)}">${STATUS.map(([k,l])=>`<option value="${k}"${k===i.status?' selected':''}>${l}</option>`).join('')}</select></td><td class="folder"><button class="folder-link" data-open="${esc(i.id)}" title="打开本地文件夹">${esc(i.folder)}</button></td><td class="date">${date(i.updated)}</td></tr>`;
  }).join('');
  $('#empty').hidden=!!list.length;
  lifecycle.decorate(list,data.items);const url=new URL(location.href);url.search='';lifecycle.query(url);
  if(statusFilter!=='全部')url.searchParams.set('status',statusFilter);
  if(q)url.searchParams.set('q',$('#search').value);
  url.searchParams.set('sort',sort);history.replaceState(null,'',url);
  localStorage.setItem('evolution-video-sort',sort);
  document.querySelectorAll('[data-sort-value]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sortValue===sort)));
}
async function load(){
  const r=await fetch('/api/videos');
  if(!r.ok)throw Error('视频列表读取失败');
  data=await r.json();
  const names=['全部',...STATUS.map(([,l])=>l)];
  if(!names.includes(statusFilter))statusFilter='全部';
  render();
}
$('#status-filters').onclick=e=>{const b=e.target.closest('[data-status-filter]');if(b){statusFilter=b.dataset.statusFilter;render();}};
$('#search').oninput=render;
$('#sort').onchange=()=>{sort=$('#sort').value;render();};
document.querySelectorAll('[data-sort-value]').forEach(b=>b.onclick=()=>{$('#sort').value=b.dataset.sortValue;$('#sort-pop').open=false;sort=b.dataset.sortValue;render();});
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const key=b.dataset.sort;if(key==='updated')sort=sort==='updated-desc'?'updated-asc':'updated-desc';else if(key==='name')sort=sort==='name-asc'?'name-desc':'name-asc';$('#sort').value=SORTS.includes(sort)?sort:'updated-desc';render();});
$('#rows').onclick=async e=>{
  const b=e.target.closest('[data-open]');if(!b)return;
  b.disabled=true;
  try{const r=await fetch('/api/open-video-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.open,target:'root'})});const j=await r.json();if(!r.ok)throw Error(j.error||'打开失败');$('#feedback').textContent='已打开本地文件夹';}
  catch(err){$('#feedback').textContent=err.message;}finally{b.disabled=false;}
};
$('#rows').onchange=async e=>{
  const s=e.target;if(!s.dataset.field)return;
  const id=s.dataset.id,item=data.items.find(i=>i.id===id),old=item.status;
  s.disabled=true;
  try{await post({id,status:s.value});item.status=s.value;item.statusLabel=statusLabel(s.value);$('#feedback').textContent='状态已保存';render();}
  catch(err){s.value=old;$('#feedback').textContent=err.message;s.disabled=false;}
};
document.addEventListener('click',e=>document.querySelectorAll('.tools details').forEach(d=>{if(!d.contains(e.target))d.open=false;}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.tools details').forEach(d=>d.open=false);});
window.addEventListener('pageshow',()=>load().catch(e=>$('#feedback').textContent=e.message));
})();
