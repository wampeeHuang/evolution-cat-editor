(()=>{'use strict';
const $=s=>document.querySelector(s),id=location.pathname.split('/').filter(Boolean)[1]||'';
let data=null,revision='',dirty=false,busy=false;
const labels={title:'作品标题',body:'发布正文',tags:'标签'};
function status(text){$('#feedback').textContent=text;$('#feedback').title=text;}
function values(){return Object.fromEntries(Object.keys(labels).map(k=>[k,k==='tags'?PublishUI.tagText($('#copy-'+k).value):$('#copy-'+k).value]));}
function render(){
 document.title=(data.title||'视频')+' · 进化猫 · 创作工坊';$('#title').textContent=data.title||'视频';
 const video=data.videos?.[0];$('#player').hidden=!video;$('#no-video').hidden=!!video;if(video){$('#player').src=video.url;$('#player').poster=data.cover||'';}
 $('#video-cover').hidden=!data.hasCover;$('#no-cover').hidden=!!data.hasCover;if(data.hasCover)$('#video-cover').src=data.cover;
 PublishUI.platforms($('.platform-links'));$('#copy-fields').replaceChildren();PublishUI.mountCopyFields({container:$('#copy-fields'),copy:data.copy||{},status,onInput:()=>{dirty=true;}});status('已保存');
}
async function save(){if(busy||!data)return;busy=true;$('#save-copy').disabled=true;status('正在保存…');try{
 const snapshot=values();const response=await fetch('/api/video-copy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision,copy:snapshot})});const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败');revision=result.revision;dirty=JSON.stringify(values())!==JSON.stringify(snapshot);status(dirty?'有未保存的修改':'已保存');
}catch(error){status(error.message);}finally{busy=false;$('#save-copy').disabled=false;}}
PublishUI.button($('#save-copy'),'save','保存发布文案');PublishUI.button($('#publish-jump'),'down','跳到发布内容');PublishUI.button($('#open-video-folder'),'folder','打开作品文件夹');PublishUI.button($('#copy-video-folder'),'copy','复制作品文件夹路径');PublishUI.button($('#video-back-top'),'up','返回顶部');
$('#open-video-folder').onclick=async()=>{try{const r=await fetch('/api/open-video-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,target:'root'})});const result=await r.json();if(!r.ok)throw Error(result.error);status('已打开作品文件夹');}catch(error){status(error.message);}};
$('#copy-video-folder').onclick=async()=>{try{if(!data?.path)throw Error('文件夹尚未读取');await navigator.clipboard.writeText(data.path);status('已复制作品文件夹路径');}catch(error){status('复制路径失败：'+error.message);}};
$('#video-back-top').onclick=()=>scrollTo({top:0,behavior:'instant'});addEventListener('scroll',()=>$('#video-back-top').hidden=scrollY<320,{passive:true});
fetch('/api/about').then(r=>r.json()).then(d=>$('#video-version').textContent='v'+d.version).catch(()=>{});
$('#save-copy').onclick=save;$('#publish-jump').onclick=()=>$('#publish').scrollIntoView({behavior:'instant'});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function load(){const response=await fetch('/api/video/'+encodeURIComponent(id));if(!response.ok)throw Error('视频不存在或目录已移动');data=await response.json();revision=data.copyRevision;render();}
load().catch(error=>status(error.message));
})();
