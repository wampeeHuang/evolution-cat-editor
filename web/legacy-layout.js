/* Capture at the same 1080x1440 / DPR 1 as PNG export. */
window.captureLegacyLayout=function(){
const posters=[...document.querySelectorAll('.poster')];
      const properties=['font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration','white-space','word-break','overflow-wrap','color','padding-top','padding-right','padding-bottom','padding-left','box-sizing','background-color','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','object-fit','object-position'];
      return posters.map((p,index)=>{
        const pr=p.getBoundingClientRect(),scale=pr.width/1080;
        const box=e=>{const r=e.getBoundingClientRect();return {left:(r.left-pr.left)/scale,top:(r.top-pr.top)/scale,width:r.width/scale,height:r.height/scale};};
        const css=e=>{const s=getComputedStyle(e);return Object.fromEntries(properties.map(k=>[k,s.getPropertyValue(k)]));};
        const texts=[...p.querySelectorAll('h2,.lead,.question,.note,.photo-figure h3,.photo-figure p,.eyebrow span,footer span,.credit')].filter(e=>e.textContent.trim()&&e.getBoundingClientRect().height>0).map(e=>({kind:'text',text:e.textContent,box:box(e),css:css(e),path:e.dataset.path||''}));
        const images=[...p.querySelectorAll('.photo-media img')].map(e=>({kind:'image',src:e.getAttribute('src'),box:box(e),css:{...css(e),'border-radius':getComputedStyle(e.parentElement).borderRadius}}));
        const decorations=[...p.querySelectorAll('.eyebrow,.photo-media,.photo-figure,footer')].filter(e=>{const s=getComputedStyle(e);return s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.borderTopStyle!=='none'||s.borderBottomStyle!=='none';}).map(e=>({kind:'decoration',box:box(e),css:css(e)}));
        return {index,background:getComputedStyle(p).backgroundColor,objects:[...decorations,...texts,...images]};
      });

};
