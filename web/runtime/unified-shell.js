/* Shared product layout for the free-card engine. Artwork stays in document-state. */
function installUnifiedShell({deck,sidebar,editor,fitPortrait,titleInput,hostContext,model,initializePage,getRevision}) {
  const $=s=>document.querySelector(s);
  const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
  const paths={prev:'<path d="m15 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',save:'<path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/>',export:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',zoom:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',down:'<path d="m6 9 6 6 6-6"/>',add:'<path d="M12 4v16M4 12h16"/>'};
  paths.copy='<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>';
  paths.folder='<path d="M3 7V4h7l3 3h8v13H3zM3 10h18"/>';
  const button=(id,label,icon,action)=>{const b=document.createElement('button');b.id=id;b.type='button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML=svg(paths[icon]);b.onclick=action;return b;};
  const bar=$('#deckLeftHover'), row=bar.querySelector('.deck-left-row');
  const name=row.querySelector('a');name.innerHTML='<img src="/icon.svg" width="32" height="32" alt=""><span>进化猫 · 创作工坊</span>';name.title='返回创作工坊';name.href='/';name.className='shell-name';
  const version=document.createElement('span');version.className='shell-version';version.textContent='v…';
  fetch('/api/about').then(r=>r.json()).then(data=>{version.textContent='v'+data.version;}).catch(()=>version.textContent='自由图卡');
  const prev=button('shell-prev','上一页','prev',()=>deck.goTo(deck.current-1));
  const next=button('shell-next','下一页','next',()=>deck.goTo(deck.current+1));
  const pages=document.createElement('select');pages.id='shell-pages';pages.setAttribute('aria-label','选择页面');
  deck.slides.forEach((slide,i)=>{const o=new Option('P'+(i+1)+' / '+deck.slides.length,String(i));pages.add(o);slide.dataset.pageLabel='P'+(i+1)+' / '+deck.slides.length;});
  pages.onchange=()=>deck.goTo(Number(pages.value));
  const save=$('#btnSave'),undo=$('#btnUndo'),redo=$('#btnRedo'),exportButton=$('#btnExport'),add=$('#btnAddElement');
  for(const [b,label,icon] of [[save,'保存编辑稿','save'],[exportButton,'导出 PNG','export'],[add,'添加对象','add']]){b.innerHTML=svg(paths[icon]);b.setAttribute('aria-label',label);b.title=label;}
  // Keep common text colors available whenever the text toolbar is visible.
  const commonColors=$('#textColorPanel .swatches');
  if(commonColors){commonColors.classList.add('shell-persistent-colors');commonColors.setAttribute('aria-label','常用文字颜色');$('#rteToolbar .rte-toolbar-main').append(commonColors);}
  document.title='图文 · 进化猫 · 创作工坊';
  const tools=$('#colorTools');tools.hidden=true;
  const settings=button('shell-settings','对象与页面设置','settings',()=>{tools.hidden=!tools.hidden;settings.setAttribute('aria-expanded',String(!tools.hidden));});settings.setAttribute('aria-expanded','false');settings.hidden=true;
  const zoom=document.createElement('label');zoom.className='shell-zoom';zoom.innerHTML=svg(paths.zoom)+'<input type="range" min="20" max="100" step="5" value="50" aria-label="查看比例"><output>50%</output>';
  zoom.querySelector('input').oninput=e=>{document.documentElement.dataset.viewZoom=Number(e.target.value)/100;fitPortrait();zoom.querySelector('output').textContent=e.target.value+'%';};
  const status=$('#host-status');
  const jump=document.createElement('button');jump.type='button';jump.id='shell-publish-jump';jump.innerHTML=svg(paths.down);jump.setAttribute('aria-label','跳到发布面板');jump.title='跳到发布面板';jump.onclick=()=>$('#shell-publish').scrollIntoView({behavior:'instant'});
  sidebar.setOpen(false);
  row.replaceChildren(name,version,prev,pages,next,save,undo,redo,exportButton,settings,add,zoom,status,jump);
  // The old runtime corner and filmstrip no longer determine the product layout.
  sidebar.setOpen=()=>{sidebar.open=false;document.body.classList.remove('deck-sidebar-open');};
  const originalUpdate=deck._updateChrome.bind(deck);deck._updateChrome=()=>{originalUpdate();pages.value=String(deck.current);prev.disabled=deck.current===0;next.disabled=deck.current===deck.slides.length-1;};
  deck.goTo=i=>{deck.current=Math.max(0,Math.min(deck.slides.length-1,i));const r=deck.slides[deck.current].getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top-134,behavior:'instant'});deck._updateChrome();};
  deck._updateChrome();
  const panel=document.createElement('section');panel.id='shell-publish';panel.setAttribute('data-deck-chrome-surface','');panel.innerHTML='<div class="shell-image-head"><div><h2>发布图片</h2><p>共 '+deck.slides.length+' 张，按页码顺序上传为轮播图</p></div><button type="button" id="shell-open-folder">打开文件夹</button></div><div class="shell-publish-images"></div><div class="shell-copy"><div class="shell-copy-head"><h2>发布内容</h2><div class="platform-links"><a href="https://mp.weixin.qq.com/" target="_blank" rel="noopener noreferrer">微信公众号 ↗</a><a href="https://creator.xiaohongshu.com/" target="_blank" rel="noopener noreferrer">小红书 ↗</a><a href="https://creator.douyin.com/" target="_blank" rel="noopener noreferrer">抖音 ↗</a></div></div></div>';
  $('.portrait-stage').after(panel);
  PublishUI.platforms(panel.querySelector('.platform-links'));

  const imagePanel=document.createElement('section');imagePanel.className='shell-image-panel';imagePanel.setAttribute('aria-label','发布图片');
  const imageHead=panel.querySelector('.shell-image-head'),imageGrid=panel.querySelector('.shell-publish-images');
  imageHead.before(imagePanel);imagePanel.append(imageHead,imageGrid);
  const images=panel.querySelector('.shell-publish-images');
  deck.slides.forEach((s,i)=>{const img=document.createElement('img');img.alt='第'+(i+1)+'张正式 PNG';img.src='01_图卡/cards/card_'+(i+1)+'.png';img.onload=()=>{img.hidden=false;img.classList.add('loaded');};img.onerror=()=>{img.hidden=true;};images.append(img);});
  new MutationObserver(()=>{status.title=status.textContent;if(status.textContent.startsWith('已导出 '))images.querySelectorAll('img').forEach((img,i)=>img.src='01_图卡/cards/card_'+(i+1)+'.png?v='+Date.now());}).observe(status,{childList:true,characterData:true,subtree:true});
  PublishUI.mountCopyFields({container:panel.querySelector('.shell-copy'),copy:model.copy.shared,titleInput,status:text=>status.textContent=text});
  const folderButton=$('#shell-open-folder');folderButton.innerHTML=svg(paths.folder);folderButton.setAttribute('aria-label','打开正式图片文件夹');folderButton.title='打开正式图片文件夹';
  $('#colorTools').querySelectorAll('button').forEach(b=>{if(b.querySelector('svg')){b.querySelectorAll('span').forEach(s=>s.remove());for(const n of [...b.childNodes])if(n.nodeType===3)n.remove();}});
  const folderActions=document.createElement('div');folderActions.className='shell-folder-actions';
  folderButton.replaceWith(folderActions);folderActions.append(folderButton);
  const copyFolder=button('shell-copy-folder','复制图片文件夹路径','copy',async()=>{
    try{
      const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId:hostContext.articleId})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'读取文件夹失败');
      const path=data.folder.replace(/[\\/]+$/,'')+'\\01_图卡\\cards';
      await navigator.clipboard.writeText(path);status.textContent='已复制图片文件夹路径';
    }catch(error){status.textContent='复制路径失败：'+error.message;}
  });folderActions.append(copyFolder);
  $('#shell-open-folder').onclick=async()=>{try{const r=await fetch('/api/open-publish-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId:hostContext.articleId})});const result=await r.json();if(!r.ok)throw Error(result.error);status.textContent='已打开本篇正式图片文件夹';}catch(e){status.textContent=e.message;}};
  // Object tools follow selection; page-only controls live beside each page label.
  // Free editing remains active while ordinary form fields keep their native keyboard behavior.
  window.removeEventListener('keydown',deck._keys);window.removeEventListener('wheel',deck._wheel);
  // Page actions live outside the zoomed artwork and are never serialized or exported.
  const root=$('.slides-offset'),actions=document.createElement('div');actions.className='shell-card-actions';actions.setAttribute('data-deck-chrome-surface','');document.body.append(actions);
  const addMenu=$('#deckAddElementMenu');
  add.hidden=true;addMenu.querySelector('[data-add-kind="video"]')?.remove();
  for(const [kind,label,path] of [['text','添加文字','<path d="M4 5V3h16v2M12 3v18M8 21h8"/>'],['image','添加图片','<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/>']]){const b=addMenu.querySelector('[data-add-kind="'+kind+'"]');b.innerHTML=svg(path);b.title=label;b.setAttribute('aria-label',label);}

  addMenu.addEventListener('click',e=>{const b=e.target.closest('[data-add-kind]');if(!b||b.disabled)return;e.stopImmediatePropagation();e.preventDefault();
    const slide=deck.slides.find(s=>s.id===addMenu.dataset.targetPage);if(!slide)return;
    addMenu.hidden=true;addMenu.classList.remove('open');editor.addObjectAt(b.dataset.addKind,slide);
  },true);
  window.addEventListener('pointerdown',e=>{const slide=e.target.closest('.slides-offset>section.slide');if(slide){deck.current=deck.slides.indexOf(slide);deck._updateChrome();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){addMenu.hidden=true;addMenu.classList.remove('open');}});
  deck._syncCurrentFromScroll=()=>{const current=deck.slides[deck.current]?.getBoundingClientRect();if(current&&current.bottom>134&&current.top<innerHeight){deck._updateChrome();return;}let best=0,area=0;deck.slides.forEach((s,i)=>{const r=s.getBoundingClientRect(),visible=Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(134,r.top))*Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left));if(visible>area){best=i;area=visible;}});deck.current=best;deck._updateChrome();};
  const pageTools=document.createElement('div');pageTools.className='shell-page-tools';pageTools.setAttribute('data-deck-chrome-surface','');document.body.append(pageTools);
  function syncPageTools(){pageTools.replaceChildren(...deck.slides.flatMap((slide,i)=>{
    const background=button('page-background-'+slide.id,'第 '+(i+1)+' 页背景','settings',()=>{editor.clearSelection();deck.current=i;deck._updateChrome();$('#pageFill').click();const r=background.getBoundingClientRect(),p=$('#colorPanel');p.style.right='auto';const position=()=>{p.style.left=Math.max(8,Math.min(innerWidth-p.offsetWidth-8,r.left))+'px';p.style.top=Math.max($('#deckLeftHover').getBoundingClientRect().bottom+8,Math.min(innerHeight-p.offsetHeight-8,r.bottom+6))+'px';};position();requestAnimationFrame(position);});background.innerHTML=svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 15h16"/>');
    const insert=button('page-add-object-'+slide.id,'向第 '+(i+1)+' 页添加对象','add',()=>{
      editor.clearSelection();deck.current=deck.slides.indexOf(slide);deck._updateChrome();
      addMenu.dataset.targetPage=slide.id;
      addMenu.hidden=false;addMenu.classList.add('open');addMenu.setAttribute('aria-label','向第 '+(i+1)+' 页添加对象');
      const r=insert.getBoundingClientRect();addMenu.style.left=Math.max(8,Math.min(innerWidth-addMenu.offsetWidth-8,r.left))+'px';addMenu.style.top=Math.max(8,Math.min(innerHeight-addMenu.offsetHeight-8,r.bottom+6))+'px';
    });
    for(const [button,offset] of [[background,64],[insert,92]]){button.dataset.pageId=slide.id;button.dataset.pageOffset=offset;}
    return [background,insert];
  }));}
  const positionPageTools=()=>{[...pageTools.children].forEach(b=>{const r=deck.slides.find(s=>s.id===b.dataset.pageId)?.getBoundingClientRect();if(!r)return;b.style.left=(scrollX+r.left+Number(b.dataset.pageOffset))+'px';b.style.top=(scrollY+r.top-32)+'px';});};
  addEventListener('scroll',positionPageTools,{passive:true});addEventListener('resize',positionPageTools);zoom.querySelector('input').addEventListener('input',()=>requestAnimationFrame(()=>{positionPageTools();editor.positionObjectTools?.();}));
  let pageSignature='';
  const positionActions=()=>{Array.from(actions.children).forEach((b,i)=>{const r=deck.slides[i]?.getBoundingClientRect();if(!r)return;b.style.left=Math.min(innerWidth-28,r.right+4)+'px';b.style.top=(scrollY+r.top+r.height/2-12)+'px';});};
  function syncPages(){
    deck.refreshSlides();fitPortrait();deck.current=Math.max(0,Math.min(deck.current,deck.slides.length-1));
    const signature=deck.slides.map(s=>s.id).join('|');
    if(signature!==pageSignature){
      pageSignature=signature;syncPageTools();pages.replaceChildren();actions.replaceChildren();images.replaceChildren();
      deck.slides.forEach((slide,i)=>{
        pages.add(new Option('P'+(i+1)+' / '+deck.slides.length,String(i)));slide.dataset.pageLabel='P'+(i+1)+' / '+deck.slides.length;
        const b=button('shell-add-after-'+slide.id,'在第 '+(i+1)+' 页后新增图卡','add',()=>insertPage(slide));b.className='shell-add-card';b.disabled=deck.slides.length>=50;actions.append(b);
        const img=document.createElement('img');img.alt='第'+(i+1)+'张正式 PNG';img.src='01_图卡/cards/card_'+(i+1)+'.png';img.onload=()=>{img.hidden=false;img.classList.add('loaded');};img.onerror=()=>img.hidden=true;images.append(img);
      });
      panel.querySelector('.shell-image-head p').textContent='共 '+deck.slides.length+' 张，按页码顺序上传为轮播图';
    }
    deck._updateChrome();positionActions();positionPageTools();
  }
  function insertPage(source){
    if(deck.slides.length>=50)return;
    const slide=document.createElement('section');slide.id='card-'+crypto.randomUUID();slide.className='slide poster visible';slide.style.backgroundColor=getComputedStyle(source).backgroundColor;
    const layer=document.createElement('div');layer.className='slide-edit-layer';
    const obj=document.createElement('div');obj.className='slide-object';obj.dataset.slideObject='';obj.dataset.objectType='text';obj.dataset.textRole='heading';obj.dataset.roleOrigin='native';obj.dataset.oid='title-'+crypto.randomUUID();obj.style.cssText='left:8%;top:12%;width:84%';
    const text=document.createElement('div');text.className='slide-object-text';text.contentEditable='false';text.style.cssText='font-size:72px;line-height:1.3';text.textContent='写下你的标题';obj.append(text);layer.append(obj);slide.append(layer);
    initializePage(slide);
    const mount=()=>{source.after(slide);syncPages();deck.goTo(deck.slides.indexOf(slide));status.textContent='有未保存的修改';};
    mount();editor.history.push({undo:()=>{editor.clearSelection();slide.remove();syncPages();status.textContent='有未保存的修改';},redo:mount});
  }
  new MutationObserver(syncPages).observe(root,{childList:true});
  addEventListener('resize',positionActions);addEventListener('scroll',positionActions,{passive:true});
  zoom.querySelector('input').addEventListener('input',()=>requestAnimationFrame(positionActions));
  const topButton=button('shell-back-top','返回顶部','prev',()=>{
    document.activeElement?.blur();editor.clearSelection();editor._closeRteDrawers();editor.toolbar.classList.remove('visible');
    ['#colorPanel','#geometryPanel','#uiTooltip'].forEach(id=>{const el=$(id);if(el)el.hidden=true;});
    deck.current=0;deck._updateChrome();scrollTo({top:0,behavior:'instant'});
  });
  topButton.innerHTML=svg('<path d="M12 19V5M5 12l7-7 7 7"/>');topButton.setAttribute('data-deck-chrome-surface','');document.body.append(topButton);
  const syncTop=()=>{topButton.hidden=scrollY<320;};addEventListener('scroll',syncTop,{passive:true});syncTop();
  // End object editing on any outside surface, including the space around cards.
  // Run before the engine's document handler so blur can commit text history.
  window.addEventListener('pointerdown',e=>{
    if(e.target.closest('[data-slide-object],#rteToolbar,#colorTools,#colorPanel,#geometryPanel,#deckLeftHover,#deckAddElementMenu,#layout-panel,#layout-font-dialog,.shell-page-tools'))return;
    const active=document.activeElement;
    if(active?.closest('.slide-object-text'))active.blur();
    editor.clearSelection();
    editor._closeRteDrawers();editor._clearRteFormatStash();
    editor.toolbar.classList.remove('visible');
    const selection=getSelection();
    if(selection?.anchorNode&&root.contains(selection.anchorNode))selection.removeAllRanges();
    ['#colorPanel','#geometryPanel','#uiTooltip'].forEach(id=>{const el=$(id);if(el)el.hidden=true;});
  },true);
  syncPages();
  installLayoutPanel({editor,deck,root,pages,status,hostContext,getRevision});
}
