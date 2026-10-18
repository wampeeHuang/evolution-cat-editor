// PNG rendering is an editor feature invoked by its export action, not a browser inspection tool.
const { chromium }=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');const path=require('path');
(async()=>{const [url,out,scope,pageArg]=process.argv.slice(2);let browser;
try{browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking']});
const context=await browser.newContext({viewport:{width:1080,height:1440},deviceScaleFactor:1});
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&u.port==='8797'?route.continue():route.abort();});
const page=await context.newPage();await page.goto(url,{waitUntil:'networkidle',timeout:30000});await page.evaluate(()=>document.fonts.ready);
await page.waitForFunction(()=>Array.from(document.querySelectorAll('.poster img')).every(i=>i.complete&&i.naturalWidth>0),{timeout:15000});
if(scope==='capture-layout'){
 await page.addScriptTag({path:path.join(__dirname,'web/legacy-layout.js')});
 const layout=await page.evaluate(()=>window.captureLegacyLayout());
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(layout));
 console.log(JSON.stringify({pages:layout.length}));return;
}
const bad=await page.locator('.poster').evaluateAll(ps=>ps.map((p,i)=>{const runtime=!!p.querySelector('[data-slide-object]');const footer=p.querySelector('footer');const bounds=p.getBoundingClientRect();const foot=footer?footer.getBoundingClientRect().top:bounds.bottom;const bad=p.scrollHeight>p.clientHeight+2||Array.from(p.querySelectorAll(runtime?'[data-slide-object]':'h2,.lead,.question,.note,.photo-figure figcaption,.photo-figure p')).some(e=>{const r=e.getBoundingClientRect();return r.height>0&&(runtime?(r.top<bounds.top-1||r.bottom>(footer?foot-4:bounds.bottom+1)||r.left<bounds.left-1||r.right>bounds.right+1):r.bottom>foot-4);});return bad?i+1:null;}).filter(Boolean));
if(bad.length)throw new Error('内容越界：第'+bad.join('、')+'页');
fs.mkdirSync(out,{recursive:true});const count=await page.locator('.poster').count();const indexes=scope==='current'?[Number(pageArg)]:Array.from({length:count},(_,i)=>i);
for(const i of indexes)await page.locator('.poster').nth(i).screenshot({path:path.join(out,'card_'+(i+1)+'.png'),type:'png'});
const evidence=await page.evaluate(()=>({fonts:Array.from(document.fonts).filter(f=>f.status==='loaded').map(f=>f.family),objects:Array.from(document.querySelectorAll('[data-oid]')).map(e=>({id:e.dataset.oid,style:e.getAttribute('style'),text:e.querySelector('.slide-object-text')?.innerHTML}))}));fs.writeFileSync(path.join(out,'render-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({count:indexes.length}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(browser)await browser.close();}})();
