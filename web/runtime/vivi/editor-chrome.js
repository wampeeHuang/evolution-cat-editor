/* Consumer extension. Native selection, text formatting, media replacement and HistoryStack remain authoritative. */
function installViviEditor(editor) {
  const root=document.querySelector('.slides-offset');
  // Collapse redundant inline wrappers: an overridden ancestor size still contributes a line strut.
  // Preserve actual text, final inline styles, object geometry and the user's selection offsets.
  function normalizeInline(text){
    const selection=document.getSelection();let offsets=null;
    if(selection?.rangeCount&&text.contains(selection.getRangeAt(0).commonAncestorContainer)){const r=selection.getRangeAt(0),start=r.cloneRange(),end=r.cloneRange();start.selectNodeContents(text);start.setEnd(r.startContainer,r.startOffset);end.selectNodeContents(text);end.setEnd(r.endContainer,r.endOffset);offsets=[start.toString().length,end.toString().length];}
    text.normalize();text.querySelectorAll('b:empty,i:empty,strong:empty,em:empty,span:empty').forEach(n=>n.remove());
    const plain=n=>n.tagName==='SPAN'&&Array.from(n.attributes).every(a=>a.name==='style');
    Array.from(text.querySelectorAll('span')).reverse().forEach(span=>{while(plain(span)&&span.childNodes.length===1&&span.firstChild.nodeType===1&&plain(span.firstChild)){const child=span.firstChild;span.style.cssText+=';'+child.style.cssText;while(child.firstChild)span.insertBefore(child.firstChild,child);child.remove();}});
    if(offsets){const nodes=[],walk=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);while(walk.nextNode())nodes.push(walk.currentNode);const point=offset=>{for(const node of nodes){if(offset<=node.length)return [node,offset];offset-=node.length;}return [text,text.childNodes.length];};const range=document.createRange();range.setStart(...point(offsets[0]));range.setEnd(...point(offsets[1]));selection.removeAllRanges();selection.addRange(range);}
  }
  const nativeInlineStyle=editor._applyInlineStyle;editor._applyInlineStyle=function(text,patch){const result=nativeInlineStyle.call(this,text,patch);if(result){const selection=document.getSelection();if(selection?.rangeCount){let span=selection.getRangeAt(0).commonAncestorContainer;if(span.nodeType===3)span=span.parentElement;if(span!==text&&span.tagName==='SPAN')span.querySelectorAll('span').forEach(child=>Object.keys(patch).forEach(key=>child.style[key]=''));}normalizeInline(text);this._stashRteFormatSelection();}return result;};
  queueMicrotask(()=>{const changes=[];root.querySelectorAll('.slide-object-text').forEach(text=>{const before=text.innerHTML;normalizeInline(text);const after=text.innerHTML;if(before!==after)changes.push({text,before,after});});if(changes.length){editor.history.push({undo:()=>changes.forEach(x=>x.text.innerHTML=x.before),redo:()=>changes.forEach(x=>x.text.innerHTML=x.after)});document.getElementById('host-status').textContent='文字框高度已修正，待保存';}});
  const tools=document.getElementById('colorTools');
  const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>';
  const icons={rotate:'M4 9a8 8 0 1 1 1 9M4 3v6h6'};
  const selected=()=>editor.selected.size===1?Array.from(editor.selected)[0]:null;
  const status=t=>{document.getElementById('host-status').textContent=t;};
  const history=(el,before)=>{const after=el.getAttribute('style')||'';if(before===after)return;editor.history.push({undo:()=>{el.setAttribute('style',before);sync();status('有未保存的修改');},redo:()=>{el.setAttribute('style',after);sync();status('有未保存的修改');}});status('有未保存的修改');sync();};
  const angle=el=>parseFloat(el.style.rotate)||0;
  const dimensions=el=>{const slide=el.closest('section.slide');return {slide,W:slide.clientWidth,H:slide.clientHeight,w:el.offsetWidth,h:el.offsetHeight,l:el.offsetLeft,t:el.offsetTop,a:angle(el)};};
  // Axis-aligned extent of rotated artwork, in document pixels, independent of viewport zoom.
  const extent=d=>{const a=d.a*Math.PI/180;return {w:Math.abs(d.w*Math.cos(a))+Math.abs(d.h*Math.sin(a)),h:Math.abs(d.w*Math.sin(a))+Math.abs(d.h*Math.cos(a))};};
  const bound=(el)=>{const d=dimensions(el),e=extent(d);if(e.w>d.W+1||e.h>d.H+1)return false;const cx=Math.max(e.w/2,Math.min(d.W-e.w/2,d.l+d.w/2)),cy=Math.max(e.h/2,Math.min(d.H-e.h/2,d.t+d.h/2));el.style.left=((cx-d.w/2)/d.W*100)+'%';el.style.top=((cy-d.h/2)/d.H*100)+'%';return true;};
  const change=fn=>{const el=selected();if(!el)return;const before=el.getAttribute('style')||'';fn(el);if(!bound(el)){el.setAttribute('style',before);status('对象超出图卡，请先缩小');return;}history(el,before);};
  const button=(id,label,path,action)=>{const b=document.createElement('button');b.id=id;b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=svg(path);b.onpointerdown=e=>e.preventDefault();b.onclick=action;return b;};
  const pop=document.createElement('div');pop.id='geometryPanel';pop.hidden=true;pop.setAttribute('data-deck-chrome-surface','');document.body.append(pop);
  let lastSelected=null;
  function positionObjectTools(){tools.hidden=true;}
  editor.positionObjectTools=positionObjectTools;
  addEventListener('scroll',positionObjectTools,{passive:true});addEventListener('resize',positionObjectTools);
  const contextColor=document.getElementById('colorPanel');const positionContextColor=()=>{if(contextColor.hidden||!selected())return;const r=selected().getBoundingClientRect();contextColor.style.left=Math.max(8,Math.min(innerWidth-contextColor.offsetWidth-8,r.left))+'px';contextColor.style.right='auto';contextColor.style.top=Math.max(document.getElementById('deckLeftHover').getBoundingClientRect().bottom+8,Math.min(innerHeight-contextColor.offsetHeight-8,r.bottom+6))+'px';};new MutationObserver(()=>requestAnimationFrame(positionContextColor)).observe(contextColor,{attributes:true,attributeFilter:['hidden'],childList:true});

  function mountObjectControls(obj){
    if(obj.querySelector('.object-inline-controls'))return;
    const controls=document.createElement('div');controls.className='object-inline-controls';controls.setAttribute('data-deck-chrome-surface','');
    for(const [id,label] of [['objectFill','对象填色'],['objectBorder','对象边框'],...(obj.dataset.objectType==='image'?[['replaceObjectImage','替换图片']]:[])]){
      const original=document.getElementById(id),b=original.cloneNode(true);b.removeAttribute('id');b.disabled=false;b.title=label;b.setAttribute('aria-label',label);b.dataset.objectAction=id;
      b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};b.onclick=e=>{e.preventDefault();e.stopPropagation();editor._selectOnly(obj);editor.syncObjectColors?.();original.click();};controls.append(b);
    }
    if(obj.dataset.objectType==='image'){
      for(const [label,mode] of [['放大图片主体','crop'],['显示完整图片','reset']]){
        const b=document.createElement('button');b.type='button';b.textContent=label;b.className='layout-ease-action';b.setAttribute('aria-label',label);b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};b.onclick=e=>{e.stopPropagation();imageContent(obj,mode);};controls.append(b);
      }
    }
    if(obj.querySelector('.slide-object-text')){
      const b=document.createElement('button');b.type='button';b.textContent=obj.dataset.easeFlow?'关闭跟随':'文字跟随';b.className='layout-ease-action';b.setAttribute('aria-label','启用或关闭文字撑高与下方跟随');b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};b.onclick=e=>{e.stopPropagation();toggleFlow(obj,b);};controls.append(b);
    }
    obj.append(controls);
  }
  function sync(){editor.syncObjectColors?.();const el=selected();if(el!==lastSelected||!editor.active){pop.hidden=true;if(contextColor.dataset.kind!=='page')contextColor.hidden=true;}lastSelected=el;positionObjectTools();
    root.querySelectorAll('[data-slide-object]').forEach(obj=>{mountObjectControls(obj);const grip=obj.querySelector('.slide-object-move');if(grip&&!grip.querySelector('svg'))grip.innerHTML=svg('M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01');const trash=obj.querySelector('.slide-object-delete');if(trash&&!trash.querySelector('svg')){trash.innerHTML=svg('M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6');trash.title='删除对象；可撤销';}if(obj.querySelector('.vv-rotate-handle'))return;const handle=button('', '旋转对象；Shift 按 15° 吸附',icons.rotate,()=>{});handle.className='vv-rotate-handle';handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();change(o=>o.style.rotate=(angle(o)+(e.key==='ArrowRight'?15:-15))+'deg');};obj.append(handle);});
  }
  // Treat these panels as editing chrome before native document handlers can deselect artwork.
  document.addEventListener('pointerdown',e=>{
    document.documentElement.dataset.vvInput='pointer';
    if(e.target.closest('#geometryPanel')){e.stopImmediatePropagation();return;}
    const handle=e.target.closest('.vv-rotate-handle');if(!handle){if(!e.target.closest('#colorTools'))pop.hidden=true;return;}
    e.preventDefault();e.stopImmediatePropagation();const el=handle.closest('[data-slide-object]');editor._selectOnly(el);editor._closeRteDrawers();editor.toolbar.classList.remove('visible');const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,start=Math.atan2(e.clientY-cy,e.clientX-cx),before=el.getAttribute('style')||'',initial=angle(el);
    const move=ev=>{let n=initial+(Math.atan2(ev.clientY-cy,ev.clientX-cx)-start)*180/Math.PI;n=((n+540)%360)-180;if(ev.shiftKey)n=Math.round(n/15)*15;el.style.rotate=n.toFixed(2)+'deg';status('旋转 '+n.toFixed(0)+'°');};
    const done=ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',done);if(ev.type==='pointercancel'||!bound(el)){el.setAttribute('style',before);status('旋转已取消：对象须在图卡内');}else history(el,before);};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',done);document.addEventListener('pointercancel',done);sync();
  },true);
  // Keep upstream handle dispatch/history, extend its geometry to rotated eight-handle resizing.
  editor._startResize=function(e,el,mode){const slide=el.closest('section.slide'),sr=slide.getBoundingClientRect(),d=dimensions(el);this._resizeState={el,slide,sr,mode,startX:e.clientX,startY:e.clientY,d,before:el.getAttribute('style')||''};document.addEventListener('pointermove',this._onResizeMove);document.addEventListener('pointerup',this._onResizeUp);document.addEventListener('pointercancel',this._onResizeUp);};
  editor._onResizeMove=function(e){const st=this._resizeState;if(!st)return;const {d,el,mode}=st,a=d.a*Math.PI/180,c=Math.cos(a),s=Math.sin(a),fit=st.sr.width/d.W,dx=(e.clientX-st.startX)/fit,dy=(e.clientY-st.startY)/fit,lx=c*dx+s*dy,ly=-s*dx+c*dy,sx=mode.includes('w')?-1:mode.includes('e')?1:0,sy=mode.includes('n')?-1:mode.includes('s')?1:0;let w=Math.max(24,d.w+sx*lx),h=Math.max(24,d.h+sy*ly);if(!sx)w=d.w;if(!sy)h=d.h;if(sx&&sy&&el.dataset.objectType==='image'&&!e.shiftKey){const ratio=Math.max(w/d.w,h/d.h);w=d.w*ratio;h=d.h*ratio;}const dw=w-d.w,dh=h-d.h;el.style.width=w/d.W*100+'%';el.style.height=h/d.H*100+'%';el.style.left=(d.l+(c*sx*dw-s*sy*dh-dw)/2)/d.W*100+'%';el.style.top=(d.t+(s*sx*dw+c*sy*dh-dh)/2)/d.H*100+'%';};
  editor._onResizeUp=function(e){const st=this._resizeState;if(!st)return;if(e.type==='pointercancel'||!bound(st.el)){st.el.setAttribute('style',st.before);status('缩放已取消：对象须在图卡内');}else history(st.el,st.before);this._resizeState=null;document.removeEventListener('pointermove',this._onResizeMove);document.removeEventListener('pointerup',this._onResizeUp);document.removeEventListener('pointercancel',this._onResizeUp);};
  editor._onResizeMove=editor._onResizeMove.bind(editor);
  editor._onResizeUp=editor._onResizeUp.bind(editor);
  // Native snap/history stay in use; rotated objects snap/clamp by their visible bounds.
  const nativeStartDrag=editor._startDrag;
  editor._startDrag=function(e,primary){nativeStartDrag.call(this,e,primary);const st=this._dragState;if(!st)return;st.moving.forEach(m=>{const box=m.el.getBoundingClientRect();m.visualX=(box.left-st.sr.left)/st.sr.width*100-m.l;m.visualY=(box.top-st.sr.top)/st.sr.height*100-m.t;});};
  editor._onDocPointerMove=function(e){const st=this._dragState;if(!st)return;if(Math.hypot(e.clientX-st.startX,e.clientY-st.startY)>2){document.body.classList.add('object-manipulating');tools.dataset.lastDragVisibility=getComputedStyle(this.toolbar).visibility;}const sr=st.sr,p=st.moving.find(m=>m.el===st.primary)||st.moving[0];const snap=this._applySnap(e.clientX-st.startX,e.clientY-st.startY,{...p,l:p.l+p.visualX,t:p.t+p.visualY},st);let dx=snap.dx/sr.width*100,dy=snap.dy/sr.height*100;
    const minX=Math.max(...st.moving.map(m=>-m.l-m.visualX)),maxX=Math.min(...st.moving.map(m=>100-m.w/sr.width*100-m.l-m.visualX)),minY=Math.max(...st.moving.map(m=>-m.t-m.visualY)),maxY=Math.min(...st.moving.map(m=>100-m.h/sr.height*100-m.t-m.visualY));dx=Math.max(minX,Math.min(maxX,dx));dy=Math.max(minY,Math.min(maxY,dy));st.moving.forEach(m=>this._setPct(m.el,m.l+dx,m.t+dy));if(snap.lv||snap.lh)this._showSnap(snap.lv,snap.lh,sr,st.slide);else this._clearSnap();status('有未保存的修改');}.bind(editor);
  const nativeDragEnd=editor._onDocPointerUp;editor._onDocPointerUp=function(e){try{nativeDragEnd.call(this,e);}finally{document.body.classList.remove('object-manipulating');tools.dataset.dragEnded='true';document.getElementById('uiTooltip').hidden=true;if(this.toolbar.classList.contains('visible'))this._updateRteToolbar();}}.bind(editor);
  window.addEventListener('blur',()=>document.body.classList.remove('object-manipulating'));
  document.addEventListener('keydown',e=>{if(e.key!=='Delete'&&e.key!=='Backspace')return;if(e.target.closest('input,textarea,select,[contenteditable="true"],.sv-field')){e.stopPropagation();return;}if(editor.active&&editor.selected.size)e.preventDefault();},true);
  document.addEventListener('click',e=>{const del=e.target.closest('.slide-object-delete');if(!del||e.detail!==0)return;const obj=del.closest('[data-slide-object]');editor.removeObjectsWithHistory([obj],{confirmMulti:false});editor.clearSelection();status('有未保存的修改');sync();});
  // Update on selection, history and new native objects without polling or touching content styles.
  const watch=new MutationObserver(()=>queueMicrotask(sync));watch.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('pointerup',()=>queueMicrotask(sync));document.addEventListener('keydown',e=>{if(e.key==='Escape')pop.hidden=true;});
  document.addEventListener('pointerdown',()=>document.documentElement.dataset.vvInput='pointer',true);document.addEventListener('keydown',e=>{if(e.key==='Tab')document.documentElement.dataset.vvInput='keyboard';},true);
  document.querySelectorAll('#deckLeftHover button,#colorTools button,#rteToolbar button').forEach(b=>b.classList.add('vv-editor-button'));
  const names=['正文默认','标题默认','衬线体','无衬线体','等宽体'];document.querySelectorAll('#rteDrawerFont [data-font]').forEach((b,i)=>b.textContent=names[i]);
  document.querySelector('#textColorPanel h3').textContent='文字颜色';document.querySelector('#textColorPanel input').setAttribute('placeholder','#RRGGBB');
  const nativeToolbarUpdate=editor._updateRteToolbar;
  editor._updateRteToolbar=function(){nativeToolbarUpdate.call(this);this.toolbar.querySelectorAll('button[data-cmd],button[data-font],button[data-size-px]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('is-active'))));const current=this.toolbar.style.getPropertyValue('--selection-color');this.toolbar.querySelectorAll('#textColorPanel [data-color]').forEach(b=>b.setAttribute('aria-pressed',String(getComputedStyle(b).backgroundColor===current)));if(!this.toolbar.classList.contains('visible'))return;const text=this._activeTextEl();if(!text)return;let box=text.getBoundingClientRect();const sel=document.getSelection();if(sel?.rangeCount){const r=sel.getRangeAt(0).getBoundingClientRect();if(r.width>1&&r.height>1)box=r;}const topFloor=document.getElementById('deckLeftHover').getBoundingClientRect().bottom+8,height=this.toolbar.offsetHeight;const above=box.top-height-8,below=box.bottom+8;this.toolbar.style.top=(above>=topFloor?above:below+height<=innerHeight-8?below:Math.max(topFloor,innerHeight-height-8))+'px';this.toolbar.style.left=Math.max(8,Math.min(box.left,innerWidth-this.toolbar.offsetWidth-8))+'px';};
  const colorFeedback=new MutationObserver(()=>{document.querySelectorAll('.color-error').forEach(el=>el.dataset.error=String(!!el.textContent&&!el.textContent.startsWith('已应用')));});colorFeedback.observe(document.getElementById('textColorPanel'),{subtree:true,childList:true,characterData:true});colorFeedback.observe(document.getElementById('colorPanel'),{subtree:true,childList:true,characterData:true});
  document.addEventListener('input',e=>{const picker=e.target.closest('.color-picker');if(picker)picker.querySelector('.color-error').textContent='';});
  // Reposition native Chinese tips above the trigger rather than over the editable line.
  const positionTip=e=>{const trigger=e.target.closest('button[data-tip],button[title]');const tip=document.getElementById('uiTooltip');if(!trigger||tip.hidden)return;const r=trigger.getBoundingClientRect();tip.style.top=(r.top>tip.offsetHeight+8?r.top-tip.offsetHeight-8:r.bottom+8)+'px';};
  document.addEventListener('pointerover',positionTip);document.addEventListener('focusin',positionTip);
  document.querySelector('#rteToolbar').setAttribute('aria-label','文字格式');sync();
  // Direct size control: drag once, commit once through the upstream Range/history path.
  const pxPanel=document.getElementById('rteDrawerPx');pxPanel.querySelector('details')?.remove();pxPanel.querySelector('.rte-drawer-card-inner').hidden=true;
  const sizeControl=document.createElement('div');sizeControl.className='size-control';sizeControl.innerHTML='<div class="size-heading"><h3>字号</h3><label class="size-inline-value"><input type="number" min="8" max="400" step="1" aria-label="字号数值" title="点击输入字号，Enter 或移开焦点生效"><span>px</span></label></div><input type="range" min="8" max="160" step="1" aria-label="字号滑轨">';pxPanel.append(sizeControl);
  const sizeNumber=sizeControl.querySelector('[type=number]'),sizeRange=sizeControl.querySelector('[type=range]');
  const applySize=value=>{const el=editor._activeTextEl()||editor._rteFormatStash?.textEl,n=Number(value);if(!el||!Number.isInteger(n)||n<8||n>400){status('字号范围 8–400');return;}const selection=document.getSelection(),anchor=selection?.anchorNode,probe=anchor?.nodeType===3?anchor.parentElement:anchor;if(probe&&el.contains(probe)&&Math.abs(parseFloat(getComputedStyle(probe).fontSize)-n)<.01)return;const before=el.innerHTML;if(!editor._applyFontSizePx(el,n))return;const after=el.innerHTML;if(before!==after)editor.history.push({undo:()=>el.innerHTML=before,redo:()=>el.innerHTML=after});sizeNumber.value=String(n);sizeRange.value=String(n);editor._updateRteToolbar();status('有未保存的修改');};
  let sizeContext=null,sizeCommitting=false;
  sizeNumber.onfocus=()=>{editor._stashRteFormatSelection();sizeContext=editor._rteFormatStash;};
  const commitNumber=()=>{if(sizeCommitting)return;sizeCommitting=true;try{if(sizeContext)editor._rteFormatStash=sizeContext;applySize(sizeNumber.value);sizeContext=null;}finally{sizeCommitting=false;}};
  sizeNumber.onblur=e=>{if(sizeCommitting)return;const next=e.relatedTarget;commitNumber();if(next&&next!==sizeNumber&&next.isConnected)next.focus({preventScroll:true});};
  sizeRange.oninput=()=>sizeNumber.value=sizeRange.value;sizeRange.onchange=()=>applySize(sizeRange.value);sizeNumber.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitNumber();}};
  const toolbarWithPosition=editor._updateRteToolbar;editor._updateRteToolbar=function(){toolbarWithPosition.call(this);const text=this._activeTextEl();if(text&&!sizeControl.contains(document.activeElement)){const sel=document.getSelection(),anchor=sel?.anchorNode,node=anchor?.nodeType===3?anchor.parentElement:anchor;const n=parseFloat(getComputedStyle(node&&text.contains(node)?node:text).fontSize);sizeNumber.value=String(Math.round(n));sizeRange.value=String(Math.round(n));}};
  // A functional HSV picker (its gradients encode the color space, not UI decoration).
  const hsv=(h,s,v)=>{const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const q=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+q.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();};
  function mountColorPickers(){document.querySelectorAll('.color-picker').forEach(p=>{if(p.querySelector('.color-space'))return;const input=p.querySelector('.color-custom input');const field=document.createElement('div');field.className='color-space';field.innerHTML='<div class="sv-field" role="slider" tabindex="0" aria-label="选择颜色深浅" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span class="sv-cursor"></span></div><input type="range" min="0" max="359" value="120" aria-label="选择色相">';p.querySelector('h3').after(field);let h=120,s=.6,v=.7;const sv=field.querySelector('.sv-field'),cursor=field.querySelector('.sv-cursor'),hue=field.querySelector('input');const update=(write=true)=>{field.style.setProperty('--picker-hue',String(h));cursor.style.left=s*100+'%';cursor.style.top=(1-v)*100+'%';const color=hsv(h,s,v);sv.setAttribute('aria-valuenow',String(Math.round(v*100)));sv.setAttribute('aria-valuetext',color);if(write){input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));}};update(false);
    field.syncColor=color=>{const rgb=String(color).match(/[\d.]+/g)?.slice(0,3).map(n=>Number(n)/255);if(!rgb||rgb.length!==3)return;const [red,green,blue]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;h=delta===0?0:max===red?60*(((green-blue)/delta+6)%6):max===green?60*((blue-red)/delta+2):60*((red-green)/delta+4);s=max?delta/max:0;v=max;hue.value=String(Math.round(h));update(false);input.value=hsv(h,s,v);};
    const title=p.querySelector('h3').textContent;const owner=p.closest('#textColorPanel')||title.includes('页面')?null:selected();if(owner)field.syncColor(getComputedStyle(owner)[title.includes('边框')?'borderTopColor':'backgroundColor']);else if(title.includes('页面'))field.syncColor(getComputedStyle(root.querySelector('section.slide')).backgroundColor);
    sv.onpointerdown=e=>{e.preventDefault();sv.setPointerCapture(e.pointerId);const pick=ev=>{const r=sv.getBoundingClientRect();s=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));v=1-Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height));update();};pick(e);sv.onpointermove=ev=>{if(ev.buttons)pick(ev)};};hue.oninput=()=>{h=Number(hue.value);update();};sv.onkeydown=e=>{const delta=e.shiftKey ? .1 : .02;if(e.key==='ArrowLeft')s=Math.max(0,s-delta);else if(e.key==='ArrowRight')s=Math.min(1,s+delta);else if(e.key==='ArrowUp')v=Math.min(1,v+delta);else if(e.key==='ArrowDown')v=Math.max(0,v-delta);else return;e.preventDefault();update();};
  });}
  editor.mountColorPickers=mountColorPickers;
  const pickerObserver=new MutationObserver(mountColorPickers);pickerObserver.observe(document.getElementById('textColorPanel'),{childList:true,subtree:true});pickerObserver.observe(document.getElementById('colorPanel'),{childList:true,subtree:true});mountColorPickers();
  const toolbarWithSize=editor._updateRteToolbar;editor._updateRteToolbar=function(){toolbarWithSize.call(this);const field=document.querySelector('#textColorPanel .color-space');if(field&&!field.contains(document.activeElement)&&!document.querySelector('#textColorPanel .color-custom').contains(document.activeElement))field.syncColor(this.toolbar.style.getPropertyValue('--selection-color'));};
  // Selected OFL fonts from our existing library, cached locally for reopening/export.
  const fontLink=document.createElement('link');fontLink.rel='stylesheet';fontLink.href='/web/runtime/vivi/library/fonts.css';document.head.append(fontLink);
  const fontList=document.querySelector('#rteDrawerFont .rte-drawer-card-inner');
  const installFonts=async()=>{try{const response=await fetch('/web/runtime/vivi/library/fonts.json');if(!response.ok)throw Error('字体库未加载');const fonts=await response.json();fontList.innerHTML='<input class="font-search" aria-label="查找字体" placeholder="查找字体">';const rows=document.createElement('div');rows.className='font-rows';fontList.append(rows);
    const options=[{name:'默认',font:'var(--font-body)'},{name:'宋体',font:'var(--font-head)'},{name:'等宽',font:'var(--font-code)'},...fonts.map(f=>({name:f.name,font:'"Zijian-'+f.id+'"',id:f.id}))];
    options.forEach(f=>{const b=document.createElement('button');b.type='button';b.textContent=f.name;b.dataset.font=f.font;b.onmousedown=e=>e.preventDefault();b.onclick=async()=>{const el=editor._activeTextEl()||editor._rteFormatStash?.textEl,stash=editor._rteFormatStash;if(!el)return;try{if(f.id){const faces=await document.fonts.load('24px '+f.font);if(!faces.length)throw Error('字体未加载');}if(!el.isConnected)return;editor._rteFormatStash=stash;const before=el.innerHTML;editor._applyFontFamily(el,f.font);const after=el.innerHTML;if(before!==after)editor.history.push({undo:()=>el.innerHTML=before,redo:()=>el.innerHTML=after});editor._updateRteToolbar();status('有未保存的修改');}catch(_){status('字体加载失败，请重试');}};rows.append(b);});fontList.querySelector('input').oninput=e=>{rows.querySelectorAll('button').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.trim().toLowerCase()));};
  }catch(_){status('字体库暂未加载');}};installFonts();

  // Explicit, reversible layout helpers. No geometry is inferred or changed on load.
  function captureLayout(slide){return [...slide.querySelectorAll('[data-slide-object]')].map(o=>({o,style:o.getAttribute('style'),flow:o.getAttribute('data-ease-flow'),t:o.querySelector('.slide-object-text'),ts:o.querySelector('.slide-object-text')?.getAttribute('style')}));}
  let restoringEase=false,pendingEase=null;
  function restoreLayout(states){restoringEase=true;for(const s of states){if(!s.o.isConnected)continue;s.style===null?s.o.removeAttribute('style'):s.o.setAttribute('style',s.style);s.flow===null?s.o.removeAttribute('data-ease-flow'):s.o.setAttribute('data-ease-flow',s.flow);if(s.t)s.ts===null?s.t.removeAttribute('style'):s.t.setAttribute('style',s.ts);}queueMicrotask(()=>restoringEase=false);}
  const nativeHistoryPush=editor.history.push.bind(editor.history);
  editor.history.push=function(entry){if(pendingEase){const p=pendingEase;pendingEase=null;const after=captureLayout(p.slide),undo=entry.undo,redo=entry.redo;entry={...entry,undo:()=>{undo();restoreLayout(p.before);},redo:()=>{redo();restoreLayout(after);}};}return nativeHistoryPush(entry);};
  function recordLayout(before,slide){const after=captureLayout(slide);nativeHistoryPush({undo:()=>restoreLayout(before),redo:()=>restoreLayout(after)});status('有未保存的修改');}
  async function imageContent(obj,mode){
    const im=obj.querySelector('img'),g=obj.querySelector('.slide-object-graphic');if(!im||!g)return;
    const original=im.getAttribute('style'),gs=g.getAttribute('style'),data=im.getAttribute('data-ease-image');
    const restore=(style,graphic,meta)=>{style===null?im.removeAttribute('style'):im.setAttribute('style',style);graphic===null?g.removeAttribute('style'):g.setAttribute('style',graphic);meta===null?im.removeAttribute('data-ease-image'):im.setAttribute('data-ease-image',meta);};
    try{
      if(mode==='reset'){
        if(!data){status('当前已完整显示');return;}const saved=JSON.parse(data);restore(saved.style,saved.graphic,null);
      }else{
        await im.decode();if(!obj.isConnected)return;const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(im.naturalWidth,im.naturalHeight));c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
        const corners=[0,(c.width-1)*4,(c.height-1)*c.width*4,(c.width*c.height-1)*4];let bg=[0,0,0,0];for(const i of corners)for(let k=0;k<4;k++)bg[k]+=pixels[i+k]/4;
        let l=c.width,t=c.height,r=-1,b=-1;
        for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(pixels[i+3]<16)continue;const ink=bg[3]<16||Math.max(...[0,1,2].map(k=>Math.abs(pixels[i+k]-bg[k])))>24;if(ink){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}}
        if(r<l||b<t){status('未识别到主体，原图保留');return;}
        const pad=6;l=Math.max(0,l-pad);t=Math.max(0,t-pad);r=Math.min(c.width,r+pad+1);b=Math.min(c.height,b+pad+1);
        const W=obj.clientWidth,H=obj.clientHeight,factor=Math.min(W/(r-l),H/(b-t));if(!W||!H)throw Error('图片区域无尺寸');
        if(!data)im.setAttribute('data-ease-image',JSON.stringify({style:original,graphic:gs}));g.style.overflow='hidden';
        Object.assign(im.style,{position:'absolute',width:(c.width*factor/W*100)+'%',height:(c.height*factor/H*100)+'%',left:((W-(r-l)*factor)/2-l*factor)/W*100+'%',top:((H-(b-t)*factor)/2-t*factor)/H*100+'%',objectFit:'fill',maxWidth:'none',maxHeight:'none'});
      }
      const after=im.getAttribute('style'),ag=g.getAttribute('style'),ad=im.getAttribute('data-ease-image');nativeHistoryPush({undo:()=>restore(original,gs,data),redo:()=>restore(after,ag,ad)});status(mode==='reset'?'已恢复完整图片；可撤销':'已按主体放大；原文件未修改，可撤销');
    }catch(e){restore(original,gs,data);status('未能读取图片主体，原图保留：'+e.message);}
  }
  function toggleFlow(obj,button){
    const slide=obj.closest('section.slide'),before=captureLayout(slide),t=obj.querySelector('.slide-object-text');if(obj.dataset.easeFlow){delete obj.dataset.easeFlow;button.textContent='文字跟随';recordLayout(before,slide);return;}
    if(Math.abs(parseFloat(obj.style.rotate)||0)>.1){status('旋转文字暂不支持跟随');return;}
    const bottom=obj.offsetTop+obj.offsetHeight,followers=[...slide.querySelectorAll('[data-slide-object]')].filter(o=>o!==obj&&o.offsetTop>=bottom-2&&o.offsetTop<slide.clientHeight*.94&&Math.min(o.offsetLeft+o.offsetWidth,obj.offsetLeft+obj.offsetWidth)-Math.max(o.offsetLeft,obj.offsetLeft)>Math.min(o.offsetWidth,obj.offsetWidth)*.25);
    if(followers.some(o=>Math.abs(parseFloat(o.style.rotate)||0)>.1)){status('下方含旋转对象，请先调整后再启用');return;}
    obj.dataset.easeFlow=JSON.stringify({min:obj.offsetHeight,followers:followers.map(o=>o.dataset.oid)});button.textContent='关闭跟随';applyFlow(obj,false);recordLayout(before,slide);status('已启用文字跟随 · 下方 '+followers.length+' 个对象；页脚固定，可撤销');
  }
  function applyFlow(obj,pending=true){
    if(restoringEase||!obj.dataset.easeFlow)return;const slide=obj.closest('section.slide'),t=obj.querySelector('.slide-object-text');if(!t)return;let config;try{config=JSON.parse(obj.dataset.easeFlow);}catch(_){return;}if(!Number.isFinite(config.min)||!Array.isArray(config.followers)){status('跟随配置无效，请重新启用');return;}
    const clone=t.cloneNode(true);clone.removeAttribute('contenteditable');Object.assign(clone.style,{position:'fixed',left:'-20000px',top:'0',width:obj.offsetWidth+'px',height:'auto',minHeight:'0',maxHeight:'none',zoom:'1',visibility:'hidden'});document.body.append(clone);const height=Math.max(config.min,Math.ceil(clone.offsetHeight));clone.remove();const delta=height-obj.offsetHeight;if(Math.abs(delta)<1)return;
    const followers=[...slide.querySelectorAll('[data-slide-object]')].filter(o=>config.followers.includes(o.dataset.oid));const fixed=[...slide.querySelectorAll('[data-slide-object]')].filter(o=>o!==obj&&!followers.includes(o));
    const invalid=obj.offsetTop+height>slide.clientHeight||fixed.some(f=>f.offsetTop>=obj.offsetTop+obj.offsetHeight&&Math.min(obj.offsetLeft+obj.offsetWidth,f.offsetLeft+f.offsetWidth)>Math.max(obj.offsetLeft,f.offsetLeft)&&obj.offsetTop+height>f.offsetTop)||followers.some(o=>o.offsetTop+delta<0||o.offsetTop+delta+o.offsetHeight>slide.clientHeight||fixed.some(f=>f.offsetTop>=obj.offsetTop+obj.offsetHeight&&Math.min(o.offsetLeft+o.offsetWidth,f.offsetLeft+f.offsetWidth)>Math.max(o.offsetLeft,f.offsetLeft)&&o.offsetTop+delta<f.offsetTop+f.offsetHeight&&o.offsetTop+delta+o.offsetHeight>f.offsetTop));
    if(invalid){status('文字需要更多空间；跟随未移动，未缩字，请检查页脚或下方内容');return;}
    if(pending&&!pendingEase)pendingEase={slide,before:captureLayout(slide)};obj.style.height=height+'px';t.style.height='auto';followers.forEach(o=>o.style.top=(o.offsetTop+delta)+'px');status('文字已撑高，下方内容保持间距；待保存');
  }
  document.addEventListener('input',e=>{const obj=e.target.closest?.('[data-ease-flow]');if(obj)applyFlow(obj);});
  const originalInline=editor._applyInlineStyle;editor._applyInlineStyle=function(text,patch){const obj=text?.closest('[data-ease-flow]'),before=obj?captureLayout(obj.closest('section.slide')):null;const result=originalInline.call(this,text,patch);if(obj&&result){if(!pendingEase)pendingEase={slide:obj.closest('section.slide'),before};applyFlow(obj);}return result;};

}
