/* Role-based typography and read-only geometry review. Persist only explicit
   roles, defaults and applied styles; all review UI lives outside the artwork. */
function installLayoutPanel({editor,deck,root,pages,status,hostContext,getRevision}) {
  const $=s=>document.querySelector(s), roles={heading:'标题',body:'正文',note:'注释',independent:'独立文字'};
  const props=['font-size','font-family','color','line-height','font-weight'];
  const json=(s,fallback={})=>{try{return JSON.parse(s||'{}');}catch(_){return fallback;}};
  const slides=()=>Array.from(root.querySelectorAll(':scope > section.slide'));
  const objects=()=>Array.from(root.querySelectorAll('[data-slide-object]'));
  const texts=()=>objects().filter(o=>o.querySelector('.slide-object-text'));
  const role=o=>o.dataset.textRole||'unassigned';
  const selected=()=>editor.selected.size===1?[...editor.selected][0]:null;
  const defaults=()=>json(slides().find(s=>s.dataset.layoutTheme)?.dataset.layoutTheme);
  const writeDefaults=value=>slides().forEach(s=>s.dataset.layoutTheme=JSON.stringify(value));
  const computed=t=>Object.fromEntries(props.map(p=>[p,getComputedStyle(t).getPropertyValue(p)]));
  const tracked=t=>Object.fromEntries(props.map(p=>[p,t.style.getPropertyValue(p)||getComputedStyle(t).getPropertyValue(p)]));
  const label=o=>(roles[role(o)]||'未分类文字')+'「'+(o.querySelector('.slide-object-text')?.textContent||'图片').trim().slice(0,18)+'」';
  const panel=document.createElement('aside');panel.id='layout-panel';panel.hidden=true;panel.setAttribute('data-deck-chrome-surface','');panel.setAttribute('aria-label','整体排版与检查');
  panel.innerHTML='<div class="layout-head"><h2>统一排版</h2><button type="button" data-close aria-label="关闭整体排版" title="关闭整体排版"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div><p class="layout-help">按标题、正文、注释统一调整。局部样式保留，图片和文字框位置不会自动改变。</p><section><h3>当前文字类别</h3><p id="layout-selection">先选中文字对象</p><label>类别<select id="layout-role"><option value="unassigned">未分类</option><option value="heading">标题</option><option value="body">正文</option><option value="note">注释</option><option value="independent">独立文字</option></select></label><button type="button" id="layout-follow">恢复跟随整体</button><details><summary id="layout-unassigned-count">未分类文字</summary><div id="layout-unassigned"></div></details></section><section hidden><h3>按类别统一调整</h3><label>调整范围<select id="layout-scope"><option value="heading">全部标题</option><option value="body">全部正文</option><option value="note">全部注释</option></select></label><p id="layout-scope-count"></p><label>字号（px）<input id="layout-size" type="number" min="8" max="400" step="1"></label><label>字体<input id="layout-font" type="text" list="layout-fonts" placeholder="留空则不调整字体"></label><datalist id="layout-fonts"></datalist><label>文字颜色<input id="layout-color" type="color"></label><label>行距倍数<input id="layout-leading" type="number" min="0.5" max="4" step="0.05"></label><label>字重<select id="layout-weight"><option value="">保留字重</option><option value="400">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="700">粗体</option><option value="800">加粗</option><option value="900">特粗</option></select></label><button type="button" id="layout-apply">应用到此类文字</button></section><section><div class="layout-head"><h3>排版检查</h3><button type="button" id="layout-check">重新检查</button></div><p id="layout-review" role="status" aria-live="polite">正在检查…</p><p class="layout-help">越界／超框需处理；重叠仅为提醒。点击问题定位，确认后可保留此重叠，布局变化会重新提醒。</p><div id="layout-issues"></div></section>';
  document.body.append(panel);
  const legacyForm=document.createElement('div');legacyForm.id='legacy-layout-form';
  legacyForm.innerHTML=Object.entries({heading:['标题',52,100],body:['正文',24,44],note:['注释',20,34]}).map(([k,[label,min,max]])=>`<div class="size-field"><h3 class="type-role">${label}</h3><div class="font-row"><span>字体</span><button type="button" id="font-${k}" class="font-select" aria-label="${label}字体">沿用设计</button></div><div class="font-size-row"><label for="size-${k}">字号</label><input type="range" id="size-${k}" aria-label="${label}字号" min="${min}" max="${max}" step="1"><input type="number" id="number-${k}" aria-label="${label}字号数值" min="8" max="400" step="1"></div><div class="layout-color-row"><span>颜色</span><button type="button" id="theme-color-${k}" aria-label="${label}颜色"><i></i><span></span></button></div><p class="role-count" id="count-${k}"></p></div>`).join('')+'<label class="checkbox-field"><input type="checkbox" id="heading-bold">标题加粗</label><div class="popup-actions"><button type="button" id="reset-theme" title="恢复本次打开时的排版；保留局部覆盖，可撤销">恢复原设计</button></div>';
  panel.querySelector('.layout-help').after(legacyForm);
  legacyForm.insertAdjacentHTML('afterbegin','<div class="layout-color-row"><strong>整篇图卡背景</strong><button type="button" id="theme-color-background" aria-label="整篇图卡背景颜色"><i></i><span></span></button></div>');
  const themePicker=document.createElement('div');themePicker.id='layout-theme-picker';themePicker.hidden=true;legacyForm.prepend(themePicker);
  const roleSection=panel.querySelector('section');const roleDetails=document.createElement('details');roleDetails.className='layout-role-details';roleDetails.hidden=true;roleSection.hidden=true;const roleSummary=document.createElement('summary');roleSummary.textContent='待确认文字';roleSection.before(roleDetails);roleDetails.append(roleSummary,roleSection);const pendingList=document.createElement('div');pendingList.id='layout-pending-roles';roleDetails.append(pendingList);
  const recoveryRow=document.createElement('div');recoveryRow.innerHTML='<p id="role-recovery-status" class="layout-help"></p><button type="button" id="role-recovery-retry">从原稿恢复类别</button><button type="button" id="role-recovery-undo">撤销来源恢复</button>';roleSection.prepend(recoveryRow);
  const fontDialog=document.createElement('div');fontDialog.id='layout-font-dialog';fontDialog.hidden=true;fontDialog.setAttribute('data-deck-chrome-surface','');fontDialog.innerHTML='<div class="layout-font-card" role="dialog" aria-modal="true" aria-label="选择字体"><div class="layout-head"><h2 id="layout-font-title">字体</h2><button type="button" id="layout-font-close" aria-label="关闭字体选择">×</button></div><input type="search" id="layout-font-search" placeholder="搜索字体名称" aria-label="搜索字体名称"><p id="layout-font-status"></p><div id="layout-font-options"></div></div>';document.body.append(fontDialog);

  const trigger=document.createElement('button');trigger.id='shell-layout';trigger.type='button';trigger.title='整体排版与检查';trigger.setAttribute('aria-label','整体排版与检查');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16M12 4v16M8 20h8M4 9V4M20 9V4"/></svg>';
  $('#shell-settings').before(trigger);
  const badge=document.createElement('button');badge.id='layout-review-badge';badge.type='button';badge.title='查看排版检查';badge.textContent='检查排版';$('#shell-publish').before(badge);
  const marker=document.createElement('div');marker.id='layout-review-marker';marker.hidden=true;marker.setAttribute('data-deck-chrome-surface','');document.body.append(marker);
  let recoveryPending=new Map();
  let issues=[],previous=new Set(),hasBaseline=false,busy=false,timer,reviewVersion=0,highlight=null,highlightTimer;
  function open(){positionPanel();panel.hidden=false;trigger.setAttribute('aria-expanded','true');syncSelection();fill();syncLegacy();}
  trigger.onclick=()=>{if(panel.hidden)open();else close();};badge.onclick=()=>{open();$('#layout-review').scrollIntoView({block:'nearest'});};
  function positionPanel(){panel.style.top=($('#deckLeftHover').getBoundingClientRect().bottom+12)+'px';}
  function close(){themePicker.hidden=true;fontDialog.hidden=true;panel.hidden=true;trigger.setAttribute('aria-expanded','false');}
  panel.querySelector('[data-close]').onclick=close;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  panel.addEventListener('pointerdown',e=>e.stopPropagation());panel.addEventListener('scroll',()=>themePicker.hidden=true);
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#layout-theme-picker,[id^=theme-color-]'))themePicker.hidden=true;});
  const fields={ 'font-size':$('#layout-size'),'font-family':$('#layout-font'),color:$('#layout-color'),'line-height':$('#layout-leading'),'font-weight':$('#layout-weight')};
  const hex=value=>{const m=value.match(/[\d.]+/g);return m?'#'+m.slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join(''):'#262b27';};
  function fill(){
    const kind=$('#layout-scope').value,group=texts().filter(o=>role(o)===kind),sample=group[0]?.querySelector('.slide-object-text');
    const saved=defaults()[kind]||{},cs=sample?computed(sample):{'font-size':kind==='heading'?'72px':kind==='body'?'36px':'24px','font-family':'','color':'rgb(38,43,39)','line-height':'normal','font-weight':'400'};
    const v={...cs,...saved};fields['font-size'].value=parseFloat(v['font-size']);fields['font-family'].value=v['font-family'];fields.color.value=v.color.startsWith('#')?v.color:hex(v.color);
    const leading=v['line-height'];fields['line-height'].value=leading==='normal'?1.4:leading.endsWith('px')?Math.round(parseFloat(leading)/parseFloat(saved['line-height']?v['font-size']:cs['font-size'])*100)/100:parseFloat(leading);
    fields['font-weight'].value=['400','500','600','700','800','900'].includes(v['font-weight'])?v['font-weight']:'';
    Object.values(fields).forEach(f=>delete f.dataset.changed);
    $('#layout-scope-count').textContent='共 '+group.length+' 处；仅应用你修改的属性，保留其他样式。';$('#layout-apply').disabled=!group.length||busy;
    const fonts=new Set(Array.from(document.fonts).map(f=>f.family.replace(/^['"]|['"]$/g,'')));texts().forEach(o=>fonts.add(getComputedStyle(o.querySelector('.slide-object-text')).fontFamily));
    $('#layout-fonts').replaceChildren(...[...fonts].map(f=>new Option(f,f)));syncLegacy();
  }
  Object.values(fields).forEach(f=>f.addEventListener('input',()=>f.dataset.changed='true'));
  $('#layout-scope').onchange=fill;
  function syncSelection(){
    const o=selected(),valid=!!o?.querySelector('.slide-object-text');$('#layout-role').disabled=!valid;$('#layout-role').value=valid?role(o):'unassigned';
    $('#layout-selection').textContent=valid?label(o):'先选中文字对象';$('#layout-follow').disabled=!valid||!defaults()[role(o)];
    const recovered=texts().filter(o=>o.dataset.roleOrigin==='source-recovery');$('#role-recovery-undo').disabled=!recovered.length;if(recovered.length&&!$('#role-recovery-status').textContent)$('#role-recovery-status').textContent='已有 '+recovered.length+' 处文字从原稿恢复类别';
    const missing=texts().filter(o=>role(o)==='unassigned');$('#layout-unassigned-count').textContent='未分类文字 '+missing.length+' 处';
    roleDetails.hidden=!missing.length;roleSummary.textContent='待确认文字 '+missing.length+' 处';pendingList.replaceChildren();
    missing.forEach(o=>{const row=document.createElement('label'),name=document.createElement('button'),select=document.createElement('select');name.type='button';name.textContent='P'+(slides().indexOf(o.closest('section.slide'))+1)+' · '+label(o);name.onclick=()=>locate(o);select.setAttribute('aria-label','确认 '+label(o)+' 的类别');select.append(new Option('选择类别',''),...Object.entries(roles).map(([value,label])=>new Option(label,value)));select.onchange=()=>{if(!select.value)return;const before=snapshot();o.dataset.textRole=select.value;o.dataset.roleOrigin='manual';o.dataset.layoutFollow=JSON.stringify(tracked(o.querySelector('.slide-object-text')));record(before);syncSelection();fill();};row.append(name,select);pendingList.append(row);});
    const list=$('#layout-unassigned');list.replaceChildren();missing.forEach(o=>{const b=document.createElement('button');b.type='button';b.textContent='P'+(slides().indexOf(o.closest('section.slide'))+1)+' · '+label(o);b.title=recoveryPending.get(o.closest('section.slide').id+'|'+o.dataset.oid)||'选择文字并确认类别';b.onclick=()=>locate(o);list.append(b);});
  }
  const snapshot=()=>({slides:slides().map(s=>({el:s,style:s.getAttribute('style'),value:s.getAttribute('data-layout-theme'),accepted:s.getAttribute('data-layout-accepted')})),objects:texts().map(o=>({el:o,role:o.getAttribute('data-text-role'),follow:o.getAttribute('data-layout-follow'),origin:o.getAttribute('data-source-origin'),roleOrigin:o.getAttribute('data-role-origin'),html:o.querySelector('.slide-object-text').innerHTML,style:o.querySelector('.slide-object-text').getAttribute('style')}))});
  function restore(state){state.slides.forEach(x=>{for(const [name,value] of [['style',x.style],['data-layout-theme',x.value],['data-layout-accepted',x.accepted]]){if(value===null)x.el.removeAttribute(name);else x.el.setAttribute(name,value);}});state.objects.forEach(x=>{for(const [name,value] of [['data-text-role',x.role],['data-layout-follow',x.follow],['data-source-origin',x.origin],['data-role-origin',x.roleOrigin]]){if(value===null)x.el.removeAttribute(name);else x.el.setAttribute(name,value);}const t=x.el.querySelector('.slide-object-text');t.innerHTML=x.html;if(x.style===null)t.removeAttribute('style');else t.setAttribute('style',x.style);});syncSelection();fill();schedule();status.textContent='有未保存的修改';}
  function record(before){const after=snapshot();if(JSON.stringify(before,(k,v)=>k==='el'?undefined:v)===JSON.stringify(after,(k,v)=>k==='el'?undefined:v))return;editor.history.push({undo:()=>restore(before),redo:()=>restore(after)});status.textContent='有未保存的修改';}
  $('#layout-role').onchange=()=>{
    const o=selected();if(!o?.querySelector('.slide-object-text'))return;const before=snapshot();o.dataset.textRole=$('#layout-role').value;o.dataset.roleOrigin='manual';
    if(['heading','body','note'].includes(role(o)))o.dataset.layoutFollow=JSON.stringify(tracked(o.querySelector('.slide-object-text')));else delete o.dataset.layoutFollow;
    record(before);syncSelection();fill();schedule();
  };
  $('#layout-follow').onclick=()=>{
    const o=selected(),v=o&&defaults()[role(o)];if(!v)return;
    if(!confirm('恢复此文字跟随整体？将清除其中对应属性的局部样式，可撤销。'))return;
    const before=snapshot(),t=o.querySelector('.slide-object-text');Object.entries(v).forEach(([p,value])=>{t.style.setProperty(p,value);t.querySelectorAll('[style]').forEach(n=>n.style.removeProperty(p));});o.dataset.layoutFollow=JSON.stringify(tracked(t));record(before);schedule();
  };
  $('#layout-apply').onclick=async()=>{
    if(busy)return;const kind=$('#layout-scope').value,patch={};
    for(const [p,f] of Object.entries(fields)){if(!f.dataset.changed||!f.value.trim())continue;let v=f.value.trim();if(p==='font-size'){if(!Number.isFinite(+v)||+v<8||+v>400){status.textContent='字号范围为8–400px';return;}v+='px';}if(p==='line-height'&&(!Number.isFinite(+v)||+v<.5||+v>4)){status.textContent='行距范围为0.5–4倍';return;}if(!CSS.supports(p,v)){status.textContent='样式值无效：'+v;return;}patch[p]=v;}
    if(!Object.keys(patch).length){status.textContent='请先修改要统一调整的属性';return;}
    const group=texts().filter(o=>role(o)===kind);if(!group.length)return;
    busy=true;$('#layout-apply').disabled=true;
    try{
      const baseline=await scan();previous=new Set(baseline.map(x=>x.key));hasBaseline=true;
      const before=snapshot(),theme=defaults();let retained=0;
      for(const o of group){const t=o.querySelector('.slide-object-text'),current=tracked(t),base=json(o.dataset.layoutFollow,current);
        for(const [p,value] of Object.entries(patch)){if(!base[p]||current[p]===base[p])t.style.setProperty(p,value);else retained++;}
        // Compare future edits against computed default values, even if locally overridden.
        const probe=t.cloneNode(false);probe.removeAttribute('id');probe.style.cssText=t.style.cssText;Object.entries(patch).forEach(([p,v])=>probe.style.setProperty(p,v));probe.hidden=true;t.after(probe);const expected=tracked(probe);probe.remove();
        o.dataset.layoutFollow=JSON.stringify({...base,...Object.fromEntries(Object.keys(patch).map(p=>[p,expected[p]]))});
      }
      theme[kind]={...theme[kind],...patch};writeDefaults(theme);record(before);await review();syncSelection();fill();
      status.textContent='整体调整已应用；保留 '+retained+' 处对象属性覆盖，局部文字样式保留';
    }catch(error){status.textContent='整体调整失败：'+error.message;}finally{busy=false;$('#layout-apply').disabled=!texts().some(o=>role(o)===kind);}
  };
  const originalStyles=new Map(texts().map(o=>[o,tracked(o.querySelector('.slide-object-text'))]));
  const originalDefaults=structuredClone(defaults());
  const originalBackgrounds=new Map(slides().map(s=>[s,s.style.backgroundColor]));
  let fontOptions=[],fontRole='heading';
  function syncLegacy(){
    for(const k of ['heading','body','note']){
      const group=texts().filter(o=>role(o)===k),t=group[0]?.querySelector('.slide-object-text'),v=defaults()[k]||{},size=parseFloat(v['font-size']|| (t?getComputedStyle(t).fontSize:({heading:88,body:33,note:27}[k])));
      $('#number-'+k).value=size;$('#size-'+k).value=size;$('#number-'+k).disabled=$('#size-'+k).disabled=$('#font-'+k).disabled=!group.length||busy;
      const family=v['font-family']||(t?getComputedStyle(t).fontFamily:'');$('#font-'+k).textContent=fontOptions.find(f=>f.font===family||f.font.replaceAll('"','')===family.replaceAll('"',''))?.name||family||'沿用设计';
      $('#count-'+k).textContent=group.length?'共 '+group.length+' 处':'未分类，请在下方标记文字类别';
    }
    const heading=texts().find(o=>role(o)==='heading')?.querySelector('.slide-object-text'),v=defaults().heading||{};
    $('#heading-bold').disabled=!heading||busy;
    for(const k of ['background','heading','body','note']){const t=k==='background'?slides()[0]:texts().find(o=>role(o)===k)?.querySelector('.slide-object-text'),b=$('#theme-color-'+k);b.disabled=!t||busy;const color=t?getComputedStyle(t)[k==='background'?'backgroundColor':'color']:'';b.style.setProperty('--theme-color',color);b.querySelector('span').textContent=toHex(color)||'未分类';}
    $('#heading-bold').checked=Number(v['font-weight']||(heading?getComputedStyle(heading).fontWeight:400))>=700;
  }
  async function applyLegacy(k,patch){if(busy)return;$('#layout-scope').value=k;fill();for(const [p,v] of Object.entries(patch)){fields[p].value=v;fields[p].dataset.changed='true';}await $('#layout-apply').onclick();syncLegacy();}
  for(const k of ['heading','body','note']){
    const range=$('#size-'+k),number=$('#number-'+k);range.oninput=()=>number.value=range.value;range.onchange=()=>applyLegacy(k,{'font-size':range.value});number.onchange=()=>applyLegacy(k,{'font-size':number.value});number.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();number.blur();}};
    $('#font-'+k).onclick=()=>{fontRole=k;fontDialog.hidden=false;$('#layout-font-title').textContent=roles[k]+'字体';$('#layout-font-search').value='';renderFonts();$('#layout-font-search').focus();};
  }
  function toHex(color){const rgb=color.match(/[\d.]+/g);return rgb?.length>=3?'#'+rgb.slice(0,3).map(n=>Math.round(+n).toString(16).padStart(2,'0')).join('').toUpperCase():'';}
  for(const k of ['background','heading','body','note'])$('#theme-color-'+k).onclick=()=>{
    const t=k==='background'?slides()[0]:texts().find(o=>role(o)===k)?.querySelector('.slide-object-text');if(!t)return;
    themePicker.hidden=false;editor.buildColorPicker(themePicker,k==='background'?'整篇图卡背景':roles[k]+'颜色',async color=>{
      if(busy)return;
      if(k==='background'){const before=snapshot();slides().forEach(s=>s.style.backgroundColor=color);writeDefaults({...defaults(),background:color});record(before);syncLegacy();await review();}
      else await applyLegacy(k,{color});
    });
    editor.mountColorPickers();themePicker.querySelector('.color-space').syncColor(getComputedStyle(t)[k==='background'?'backgroundColor':'color']);
    const r=$('#theme-color-'+k).getBoundingClientRect();themePicker.style.left=Math.max(8,Math.min(innerWidth-248,r.left-256))+'px';themePicker.style.top=Math.max(80,Math.min(innerHeight-350,r.top))+'px';
    const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='theme-picker-close';closeButton.setAttribute('aria-label','关闭取色器');closeButton.title='关闭取色器';closeButton.innerHTML='<svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg>';closeButton.onclick=()=>themePicker.hidden=true;themePicker.prepend(closeButton);
  };
  $('#heading-bold').onchange=()=>applyLegacy('heading',{'font-weight':$('#heading-bold').checked?'800':'600'});
  $('#reset-theme').onclick=async()=>{
    if(busy)return;const baseline=await scan();previous=new Set(baseline.map(x=>x.key));hasBaseline=true;const before=snapshot();
    for(const o of texts()){if(!['heading','body','note'].includes(role(o)))continue;const t=o.querySelector('.slide-object-text'),initial=originalStyles.get(o);if(!initial)continue;const now=tracked(t),base=json(o.dataset.layoutFollow,now);for(const p of props)if(now[p]===base[p])t.style.setProperty(p,initial[p]);o.dataset.layoutFollow=JSON.stringify(initial);}
    const applied=defaults().background;for(const s of slides()){const probe=document.createElement('span');probe.style.color=applied||'';if(applied&&s.style.backgroundColor===probe.style.color)s.style.backgroundColor=originalBackgrounds.get(s)||'';}
    writeDefaults(originalDefaults);record(before);syncLegacy();await review();
  };
  function renderFonts(){const q=$('#layout-font-search').value.trim().toLowerCase(),list=$('#layout-font-options');list.replaceChildren();fontOptions.filter(f=>f.name.toLowerCase().includes(q)).forEach(f=>{const b=document.createElement('button');b.type='button';b.className='layout-font-option';const name=document.createElement('strong');name.textContent=f.name;const sample=document.createElement('span');sample.textContent='让每一页图文清楚表达';sample.style.fontFamily=f.font;b.append(name,sample);b.onclick=async()=>{try{if(f.id){const loaded=await document.fonts.load('24px '+f.font);if(!loaded.length)throw Error('本机字体未加载');}await applyLegacy(fontRole,{'font-family':f.font});fontDialog.hidden=true;}catch(e){$('#layout-font-status').textContent='字体加载失败：'+e.message;}};list.append(b);});}
  $('#layout-font-search').oninput=renderFonts;$('#layout-font-close').onclick=()=>fontDialog.hidden=true;fontDialog.onclick=e=>{if(e.target===fontDialog)fontDialog.hidden=true;};
  fontOptions=[{name:'默认正文',font:'var(--font-body)'},{name:'默认标题',font:'var(--font-head)'},{name:'系统宋体',font:'serif'},{name:'系统黑体',font:'sans-serif'}];
  fetch('/web/runtime/vivi/library/fonts.json').then(r=>{if(!r.ok)throw Error('字体库未连接');return r.json();}).then(fonts=>{fontOptions.push(...fonts.map(f=>({name:f.name,font:'"Zijian-'+f.id+'"',id:f.id})));$('#layout-font-status').textContent='本地字体库 · '+fonts.length+' 款';syncLegacy();}).catch(e=>$('#layout-font-status').textContent=e.message);
  let recoveringRoles=false;const sourceUndoCache=new Map();
  const textHash=async t=>{const clone=t.cloneNode(true);clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));const value=clone.textContent.normalize('NFC').replace(/\s+/g,' ').trim();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');};
  async function recoverFromSource(includeOptOut=false){
    if(recoveringRoles)return;recoveringRoles=true;$('#role-recovery-retry').disabled=true;
    try{
      const response=await fetch('/api/role-recovery-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId:hostContext.articleId,revision:getRevision?getRevision():hostContext.revision,includeOptOut})});
      const report=await response.json();if(!response.ok)throw Error(report.error||'来源预览失败');
      if(!report.supported){$('#role-recovery-status').textContent=report.reason;return;}
      if(includeOptOut){for(const [o,d] of sourceUndoCache){if(o.isConnected&&o.dataset.roleOrigin==='source-opt-out'&&d.origin.sourceRevision===report.sourceRevision&&!report.decisions.some(x=>x.objectId===d.objectId)){if(await textHash(o.querySelector('.slide-object-text'))===d.expectedTextHash)report.decisions.push(d);}}}
      recoveryPending=new Map(report.pending.map(x=>[x.cardId+'|'+x.objectId,x.reason]));
      const matches=[];let skipped=0;
      for(const d of report.decisions){const found=texts().filter(o=>o.dataset.oid===d.objectId&&o.closest('section.slide').id===d.cardId);const o=found.length===1?found[0]:null;if(!o||o.dataset.roleOrigin==='manual'||!['unassigned',''].includes(o.dataset.textRole||'')){skipped++;continue;}if(await textHash(o.querySelector('.slide-object-text'))!==d.expectedTextHash){skipped++;continue;}matches.push([o,d]);}
      const before=snapshot();for(const [o,d] of matches){o.dataset.textRole=d.role;o.dataset.roleOrigin='source-recovery';o.dataset.sourceOrigin=JSON.stringify(d.origin);}if(matches.length)record(before);
      const restored=texts().filter(o=>o.dataset.roleOrigin==='source-recovery').length;
      $('#role-recovery-status').textContent='原稿快照已核验 · 已恢复 '+restored+' 处'+(report.pending.length+skipped?' · '+(report.pending.length+skipped)+' 处需确认':' · 无待确认项')+(matches.length?'；保存后保留':'');
      syncSelection();fill();schedule();
    }catch(error){$('#role-recovery-status').textContent='未恢复：'+error.message;}finally{recoveringRoles=false;$('#role-recovery-retry').disabled=false;}
  }
  $('#role-recovery-retry').onclick=()=>recoverFromSource(true);
  $('#role-recovery-undo').onclick=async()=>{const before=snapshot();for(const o of texts()){const origin=json(o.dataset.sourceOrigin);if(o.dataset.roleOrigin!=='source-recovery'||origin.kind!=='source-recovery-v1'||o.dataset.textRole!==origin.role)continue;sourceUndoCache.set(o,{cardId:o.closest('section.slide').id,objectId:o.dataset.oid,role:origin.role,origin,expectedTextHash:await textHash(o.querySelector('.slide-object-text'))});if(origin.previousRole===null||origin.previousRole===undefined)o.removeAttribute('data-text-role');else o.dataset.textRole=origin.previousRole;o.dataset.roleOrigin='source-opt-out';}record(before);$('#role-recovery-status').textContent='已撤销来源类别恢复，文字与排版保留';syncSelection();fill();schedule();};
  function geometry(slide){const p=slide.getBoundingClientRect(),sx=p.width/1080,sy=p.height/1440;return r=>({x:(r.left-p.left)/sx,y:(r.top-p.top)/sy,w:r.width/sx,h:r.height/sy});}
  const intersect=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2;
  function textRects(t,convert){const result=[],walk=document.createTreeWalker(t,NodeFilter.SHOW_TEXT);while(walk.nextNode()){if(!walk.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(walk.currentNode);for(const box of r.getClientRects())if(box.width>0&&box.height>0)result.push(convert(box));}return result;}
  async function scan(){
    // Force layout first so newly selected font faces enter the loading set.
    root.getBoundingClientRect();await document.fonts.ready;await new Promise(r=>requestAnimationFrame(r));const result=[];
    // Measure offscreen copies at 1:1. Glyph metrics otherwise vary with CSS
    // zoom even after dividing viewport rectangles by the view scale.
    const measure=document.createElement('div');measure.setAttribute('aria-hidden','true');measure.setAttribute('data-deck-chrome-surface','');measure.style.cssText='position:fixed;left:-20000px;top:0;width:1080px;visibility:hidden;pointer-events:none;zoom:1';document.body.append(measure);
    try{slides().forEach((slide,index)=>{
      const copy=slide.cloneNode(true);copy.style.zoom='1';copy.style.margin='0';measure.replaceChildren(copy);
      const originals=Array.from(slide.querySelectorAll('[data-slide-object]'));
      const convert=geometry(copy),all=Array.from(copy.querySelectorAll('[data-slide-object]')),records=all.map((o,i)=>{const t=o.querySelector('.slide-object-text');return {o,t,original:originals[i],box:convert(o.getBoundingClientRect()),rects:t?textRects(t,convert):[convert(o.getBoundingClientRect())]};});
      const add=(type,a,b,message)=>{const ids=[a.o.dataset.oid,b?.o.dataset.oid].filter(Boolean).sort(),key=slide.id+'|'+type+'|'+ids.join('|');const signature=JSON.stringify([type,...[a,b].filter(Boolean).map(x=>[x.o.dataset.oid,x.o.style.cssText,x.t?.innerHTML,x.t?.style.cssText,x.o.offsetWidth,x.o.offsetHeight])]);result.push({key,signature,type,index,object:a.original,other:b?.original,message});};
      records.filter(a=>a.t).forEach(a=>{
        if(a.rects.some(r=>r.x< -1||r.y< -1||r.x+r.w>1081||r.y+r.h>1441))add('outside',a,null,label(a.o)+'超出图卡边界');
        const explicitHeight=a.o.style.height&&a.o.style.height!=='auto',t=a.t,style=getComputedStyle(t);
        if((explicitHeight&&a.rects.some(r=>r.y<a.box.y-2||r.y+r.h>a.box.y+a.box.h+2))||a.rects.some(r=>r.x<a.box.x-2||r.x+r.w>a.box.x+a.box.w+2)||((style.overflowY==='hidden'||style.overflowY==='clip')&&t.scrollHeight>t.clientHeight+2))add('frame',a,null,label(a.o)+'超出固定文字框，可能裁切');
      });
      for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){let a=records[i],b=records[j];if(!a.t&&!b.t)continue;if(!a.t)[a,b]=[b,a];if(a.rects.some(x=>b.rects.some(y=>intersect(x,y))))add('overlap',a,b,label(a.o)+'与'+(b.t?label(b.o):'图片')+'可能重叠');}
    });}finally{measure.remove();}return result;
  }
  // Acknowledgements are tied to both objects' content and layout, not just IDs.
  const acknowledgements=()=>Object.fromEntries(slides().flatMap(s=>Object.entries(json(s.dataset.layoutAccepted)).filter(([key])=>key.startsWith(s.id+'|'))));
  function positionMarker(){if(!highlight?.isConnected){marker.hidden=true;return;}const r=highlight.getBoundingClientRect();Object.assign(marker.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});}
  function locate(o){const index=slides().indexOf(o.closest('section.slide'));if(index<0)return;deck.goTo(index);editor._selectOnly(o);highlight=o;marker.hidden=false;positionMarker();clearTimeout(highlightTimer);highlightTimer=setTimeout(()=>{highlight=null;marker.hidden=true;},2200);syncSelection();}
  async function review(){const version=++reviewVersion;const found=await scan();if(version!==reviewVersion)return;const accepted=acknowledgements();issues=found.filter(x=>accepted[x.key]!==x.signature);const pageCount=new Set(issues.map(x=>x.index)).size,added=issues.filter(x=>!previous.has(x.key)).length;
    $('#layout-review').textContent=issues.length?pageCount+' 页需要检查 · '+issues.length+' 项'+(hasBaseline?' · 本次新增 '+added+' 项':''):'未发现越界、超框或重叠';badge.textContent=issues.length?'排版检查 · '+pageCount+' 页':'排版检查 · 未发现问题';
    Array.from(pages.options).forEach((option,i)=>option.textContent='P'+(i+1)+' / '+slides().length+(issues.some(x=>x.index===i)?' · 需检查':''));
    const list=$('#layout-issues');list.replaceChildren();issues.forEach(item=>{const row=document.createElement('div');row.className='layout-issue';const jump=document.createElement('button');jump.type='button';jump.textContent='P'+(item.index+1)+' · '+item.message+(hasBaseline&&!previous.has(item.key)?'（新增）':'');jump.onclick=()=>locate(item.object);row.append(jump);if(item.type==='overlap'){const keep=document.createElement('button');keep.type='button';keep.textContent='保留此重叠';keep.onclick=()=>{const before=snapshot(),slide=item.object.closest('section.slide'),accepted=json(slide.dataset.layoutAccepted);accepted[item.key]=item.signature;slide.dataset.layoutAccepted=JSON.stringify(accepted);record(before);review();};row.append(keep);}list.append(row);});
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>review().catch(e=>{$('#layout-review').textContent='检查失败：'+e.message;}),250);}
  $('#layout-check').onclick=()=>review();
  new MutationObserver(schedule).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','data-text-role']});
  document.addEventListener('pointerup',()=>{if(!panel.hidden)syncSelection();});root.addEventListener('input',schedule);
  addEventListener('resize',()=>{positionPanel();positionMarker();schedule();});addEventListener('scroll',positionMarker,{passive:true});document.fonts.addEventListener('loadingdone',schedule);
  review().then(()=>{previous=new Set(issues.map(x=>x.key));hasBaseline=true;}).catch(e=>{$('#layout-review').textContent='检查失败：'+e.message;});
  recoverFromSource();
  return {review,open};
}
