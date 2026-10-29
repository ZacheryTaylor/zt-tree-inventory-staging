(()=>{"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePtr=matchMedia("(hover:hover) and (pointer:fine)").matches;
// theme
const root=document.documentElement;
try{const t=localStorage.getItem("zt-theme");if(t)root.dataset.theme=t}catch(e){}
$("#themeToggle").addEventListener("click",()=>{const t=root.dataset.theme==="light"?"dark":"light";root.dataset.theme=t;try{localStorage.setItem("zt-theme",t)}catch(e){}});
// mobile menu
const nav=$(".nav"),mb=$("#menuBtn");
mb.addEventListener("click",()=>{const o=nav.classList.toggle("open");mb.setAttribute("aria-expanded",o)});
$$(".nav-links a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");mb.setAttribute("aria-expanded","false")}));
// scroll spy
const links=new Map($$(".nav-links a").map(a=>[a.getAttribute("href").slice(1),a]));
const spy=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.remove("active"));const a=links.get(e.target.id);if(a)a.classList.add("active")}}),{rootMargin:"-45% 0px -50% 0px"});
$$("main section[id]").forEach(s=>spy.observe(s));
// reveal + counters
const count=el=>{const n=+el.dataset.count,p=el.dataset.prefix||"",s=el.dataset.suffix||"";if(reduce){el.textContent=p+n+s;return}const t0=performance.now(),d=1400;const f=t=>{const k=Math.min(1,(t-t0)/d),v=Math.round(n*(1-Math.pow(1-k,3)));el.textContent=p+v+s;if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)};
const rv=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");$$("[data-count]",e.target).forEach(count);rv.unobserve(e.target)}}),{threshold:.15});
$$(".reveal").forEach(el=>rv.observe(el));
// GPS chip
const gf=$("#gpsFt");let g=16;setInterval(()=>{g=Math.max(11,Math.min(24,g+(Math.random()*4-2)));gf.textContent=Math.round(g)},1600);
// capture demo
const steps=[
`<p class="k">Tag</p><p class="v">#0142</p><p class="k">Species</p><div class="opts"><span class="sel">Live oak</span><span>Longleaf pine</span><span>Southern magnolia</span><span>Laurel oak</span></div>`,
`<p class="k">Live oak · Tag #0142</p><p class="v">DBH 26.5 in</p><p class="k">Measured at 4.5 ft</p><div class="gauge"><i style="width:66%"></i></div><p class="k">Size class: 24 in+ (check local threshold)</p>`,
`<p class="k">Saved · Tag #0142</p><p class="v">N 532,418.6 · E 1,124,907.3</p><p class="k">EPSG:2238 · US ft · approximate (± ~16 ft)</p><div class="opts" style="margin-top:12px"><span class="sel">✓ Logged offline</span><span>Photo attached</span></div>`];
let ci=0;const cb=$("#capBody"),cs=$("#capStep"),dots=$$(".cap-dots button");
const showCap=i=>{ci=i;cb.innerHTML=steps[i];cb.style.animation="none";cb.offsetHeight;cb.style.animation="";cs.textContent=(i+1)+" / 3";dots.forEach((d,j)=>d.setAttribute("aria-selected",j===i));$("#capNext").textContent=i===2?"New tree ↺":"Next →"};
$("#capNext").addEventListener("click",()=>showCap((ci+1)%3));dots.forEach(d=>d.addEventListener("click",()=>showCap(+d.dataset.i)));showCap(0);
// cards tilt + expand
$$(".card").forEach(c=>{
 $(".more",c).addEventListener("click",e=>{const o=c.classList.toggle("open");e.currentTarget.setAttribute("aria-expanded",o)});
 if(reduce||!finePtr)return;
 c.addEventListener("pointermove",e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.transform=`perspective(800px) rotateX(${(0.5-y)*7}deg) rotateY(${(x-0.5)*9}deg)`;c.style.setProperty("--mx",x*100+"%");c.style.setProperty("--my",y*100+"%")});
 c.addEventListener("pointerleave",()=>c.style.transform="")});
// stepper
const sd=[["Request","Send the address or parcel ID and what the permit asks for. I confirm scope and a per-job price in writing."],["Tag & inventory","On site with the offline field app. Each qualifying tree gets a numbered tag, and its species, DBH, and notes are recorded as measured. An approximate GPS point is saved to help find the tag."],["Deliverables","Report PDF, Civil 3D PNEZD CSV + notes, tree log XLSX/CSV for the mitigation worksheet, and a parcel sketch. Tree data is accurate; locations are illustration only."],["Your surveyor locates the tags","Your survey crew locates my tags for definitive positions on the sealed drawing. The tag on the tree is the reference; my GPS points just get them there."]];
const sb=$$("#stepper button"),sp=$("#stepPanel"),sf=$("#stepFill");
const setStep=i=>{sb.forEach((b,j)=>b.classList.toggle("on",j<=i));sf.style.width=((i+1)/4*100)+"%";sp.innerHTML=`<h3>${sd[i][0]}</h3><p>${sd[i][1]}</p>`};
sb.forEach(b=>{const i=+b.dataset.s;b.addEventListener("click",()=>setStep(i));b.addEventListener("mouseenter",()=>setStep(i));b.addEventListener("focus",()=>setStep(i))});setStep(0);
// deliverables
const dv={pdf:["Report PDF","A short field report: scope, method, tree table, parcel sketch, and the accuracy statement on every page.",`<div class="preview paper"><h4>Tree Inventory Report — Sample Lot</h4><small>ZT, LLC · Zach Taylor, EI (Engineer Intern)</small><table><tr><th>Tag</th><th>Species</th><th>DBH</th></tr><tr><td>0142</td><td>Live oak</td><td>26.5</td></tr><tr><td>0143</td><td>Longleaf pine</td><td>14.0</td></tr><tr><td>0144</td><td>Southern magnolia</td><td>18.2</td></tr></table><div class="stamp">Locations approximate, for field reference only. Not a survey.</div></div>`],
pnezd:["PNEZD CSV","Point, Northing, Easting, Elevation, Description. Imports straight into Civil 3D. A NOTES.txt carries the coordinate system and limits.",`<pre class="preview">142,532418.60,1124907.30,0,LO 26.5 T0142
143,532451.12,1124931.88,0,LLP 14.0 T0143
144,532397.45,1124962.04,0,MAG 18.2 T0144
<span style="color:#7d8a78"># NOTES.txt: EPSG:2238 NAD83 / Florida North (US ft)
# Approximate. Not a survey.</span></pre>`],
xlsx:["Tree log XLSX","Every tree in one sheet: tag, species, DBH, size class, notes, photo reference, and coordinates.",`<div class="preview"><table><tr><th>Tag</th><th>Species</th><th>DBH in</th><th>Class</th><th>Notes</th></tr><tr><td>0142</td><td>Live oak</td><td>26.5</td><td>24+</td><td>Near drive</td></tr><tr><td>0143</td><td>Longleaf pine</td><td>14.0</td><td>12–18</td><td>—</td></tr><tr><td>0144</td><td>S. magnolia</td><td>18.2</td><td>18–24</td><td>Rear lot</td></tr></table></div>`],
sketch:["Parcel sketch","Trees plotted over the county's public parcel lines and imagery. PNG or PDF, labeled for field reference.",`<div class="preview" style="padding:0"><svg viewBox="0 0 400 200" style="display:block;width:100%"><rect width="400" height="200" fill="#16241c"/><path d="M60 30 L340 40 L330 170 L70 165Z" fill="none" stroke="#e9e3d2" stroke-dasharray="6 4"/><g fill="#9cc58a"><circle cx="130" cy="80" r="14" opacity=".35"/><circle cx="130" cy="80" r="3"/><circle cx="230" cy="110" r="10" opacity=".35"/><circle cx="230" cy="110" r="3"/><circle cx="285" cy="70" r="12" opacity=".35"/><circle cx="285" cy="70" r="3"/></g><g fill="#c8d6c0" font-size="10" font-family="monospace"><text x="138" y="76">0142</text><text x="238" y="106">0143</text><text x="293" y="66">0144</text><text x="70" y="190">Locations approximate, for field reference only. Not a survey.</text></g></svg></div>`]};
const keys=Object.keys(dv),tabs=$$(".deliv-tabs button"),dp=$("#delivPanel");let di=0;
const showD=i=>{di=(i+keys.length)%keys.length;const d=dv[keys[di]];dp.innerHTML=`<div><h3>${d[0]}</h3><p>${d[1]}</p></div>${d[2]}`;tabs.forEach((t,j)=>{t.setAttribute("aria-selected",j===di);t.tabIndex=j===di?0:-1});tabs[di].parentNode.scrollLeft=tabs[di].offsetLeft-20};
tabs.forEach((t,i)=>{t.addEventListener("click",()=>showD(i));t.addEventListener("keydown",e=>{if(e.key==="ArrowRight"){showD(di+1);tabs[di].focus()}if(e.key==="ArrowLeft"){showD(di-1);tabs[di].focus()}})});
let sx=null;dp.addEventListener("touchstart",e=>sx=e.touches[0].clientX,{passive:true});dp.addEventListener("touchend",e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)showD(di+(dx<0?1:-1));sx=null});
showD(0);
// accuracy slider (illustrative)
const cr=$("#canopyRange"),co=$("#canopyOut"),svg=$(".acc-viz svg");const halo=document.createElementNS("http://www.w3.org/2000/svg","circle");halo.id="gpsHalo";halo.setAttribute("cx",150);halo.setAttribute("cy",150);svg.insertBefore(halo,svg.querySelector(".dot"));
const upd=()=>{const ft=Math.round(10+cr.value*.2);co.textContent=`± ${ft} ft (illustrative)`;halo.setAttribute("r",ft*4.3)};cr.addEventListener("input",upd);upd();
// form
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),3200)};
$("#quoteForm").addEventListener("submit",e=>{e.preventDefault();let ok=true;$$("[required]",e.target).forEach(i=>{const v=i.checkValidity();i.classList.toggle("bad",!v);if(!v)ok=false});if(!ok){toast("Please fill in name, a valid email, and the site.");return}e.target.reset();toast("Mock only — not connected. Nothing was sent.")});
// magnetic CTA + cursor ring
if(!reduce&&finePtr){
 $$(".magnetic").forEach(b=>{b.addEventListener("pointermove",e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.25}px,${(e.clientY-r.top-r.height/2)*.35}px)`});b.addEventListener("pointerleave",()=>b.style.transform="")});
 const ring=$(".cursor-ring");document.body.classList.add("has-ring");let x=-100,y=-100,rx=x,ry=y;
 addEventListener("pointermove",e=>{x=e.clientX;y=e.clientY});
 document.addEventListener("pointerover",e=>ring.classList.toggle("hot",!!e.target.closest("a,button,input,select,textarea,.card")));
 (function loop(){rx+=(x-rx)*.2;ry+=(y-ry)*.2;ring.style.transform=`translate(${rx}px,${ry}px)`;requestAnimationFrame(loop)})();
}
// canopy particles
const cv=$("#canopy"),cx=cv.getContext("2d");let W,H,P=[];
const size=()=>{const dpr=Math.min(2,devicePixelRatio||1);W=cv.offsetWidth;H=cv.offsetHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);P=Array.from({length:Math.round(W*H/18000)},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+.4,vx:(Math.random()-.5)*.15,vy:-Math.random()*.25-.05,a:Math.random()*.5+.15}))};
size();addEventListener("resize",size);
const draw=()=>{cx.clearRect(0,0,W,H);const c=root.dataset.theme==="light"?"63,122,79":"190,225,170";for(const p of P){p.x+=p.vx;p.y+=p.vy;if(p.y<-5){p.y=H+5;p.x=Math.random()*W}cx.beginPath();cx.arc(p.x,p.y,p.r,0,7);cx.fillStyle=`rgba(${c},${p.a})`;cx.fill()}if(!reduce)requestAnimationFrame(draw)};draw();
})();
