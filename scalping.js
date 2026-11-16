(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else{root.SignalScalping=api;if(typeof document!=="undefined")api.init();}})(typeof globalThis!=="undefined"?globalThis:this,function(){
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
function compute(input,now=Date.now()){
const valid=Array.isArray(input)?input.filter(b=>b&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(b.date)&&["open","high","low","close","volume"].every(k=>Number.isFinite(b[k]))&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.volume>=0).sort((a,b)=>a.date.localeCompare(b.date)):[];
const rows=[...new Map(valid.map(b=>[b.date,b])).values()].filter(b=>Date.parse(b.date.replace(" ","T")+(b.date.length===16?":00":"")+"+09:00")+300000<=now);
if(rows.length<35)return {ok:false,reason:"완료된 5분봉이 35개 이상 필요합니다.",count:rows.length};
const closes=rows.map(b=>b.close),volumes=rows.map(b=>b.volume),last=rows.at(-1),previous=rows.at(-2);
const bands=closes.map((_,i)=>{if(i<19)return null;const a=closes.slice(i-19,i+1),m=avg(a),sd=Math.sqrt(avg(a.map(x=>(x-m)**2)));return {middle:m,upper:m+2*sd,lower:m-2*sd};});
let pv=0,v=0,obv=0;const obvs=[];
for(let i=0;i<rows.length;i++){const b=rows[i];if(b.date.slice(0,10)===last.date.slice(0,10)){pv+=((b.high+b.low+b.close)/3)*b.volume;v+=b.volume;}if(i)obv+=Math.sign(b.close-rows[i-1].close)*b.volume;obvs.push(obv);}
const vwap=v>0?pv/v:null;
const ema=(arr,n)=>{let e=arr[0],k=2/(n+1);return arr.map(x=>(e+=k*(x-e)));};
const fast=ema(closes,12),slow=ema(closes,26),macd=fast.map((x,i)=>x-slow[i]),signal=ema(macd,9);
const band=bands.at(-1),prevBand=bands.at(-2);
const checks=[
{label:"하단밴드 반등",pass:previous.low<=prevBand.lower*1.002&&last.close>last.open&&last.close>band.lower,weight:25},
{label:"VWAP 위로 회복",pass:vwap!==null&&last.close>vwap&&previous.close<=vwap,weight:25},
{label:"OBV 상승",pass:obvs.at(-1)>obvs.at(-2),weight:20},
{label:"거래량 20봉 평균의 1.5배",pass:last.volume>=1.5*avg(volumes.slice(-21,-1)),weight:20},
{label:"MACD 상승 전환",pass:macd.at(-1)>signal.at(-1)&&macd.at(-2)<=signal.at(-2),weight:10}
];
const score=checks.reduce((s,c)=>s+(c.pass?c.weight:0),0);
const caution=last.close<band.lower||last.close<band.middle&&obvs.at(-1)<obvs.at(-2);
const status=caution?"주의":score>=75?"매수 관심":score>=50?"관찰":"관망";
const stop=Math.min(last.low,previous.low,band.lower),risk=last.close-stop;
return {ok:true,rows,bands,last,band,vwap,score,checks,status,entry:score>=75&&!caution?last.close:null,stop:risk>0?stop:null,target:risk>0?last.close+risk*1.5:null,volumeRatio:last.volume/Math.max(1,avg(volumes.slice(-21,-1))),asOf:last.date};
}
function init(){const $=id=>document.getElementById(id),money=n=>Number.isFinite(n)?Math.round(n).toLocaleString("ko-KR")+"원":"—";let pending=false;
$("scalpForm").addEventListener("submit",async e=>{e.preventDefault();if(pending)return;const code=$("code").value.trim().toUpperCase();if(!/^[0-9A-Z]{6}$/.test(code))return;$("output").hidden=true;$("status").textContent="5분봉 조회 중…";pending=true;
try{const r=await fetch("/api/minutes?code="+encodeURIComponent(code)+"&t="+Date.now(),{cache:"no-store"}),data=await r.json();if(!r.ok||!Array.isArray(data.candles))throw Error(data.error||"분봉 조회 실패");const result=compute(data.candles);if(!result.ok)throw Error(result.reason);$("output").hidden=false;$("heading").textContent=code+" · 5분봉 스캘핑";$("meta").textContent="마지막 완료봉: "+result.asOf+" (한국시간) · 출처: "+(data.source||"5분봉 제공처")+" · 실시간 보장 안 됨";$("last").textContent=money(result.last.close);$("entry").textContent=result.entry===null?"조건 미충족":money(result.entry);$("risk").textContent=result.entry===null?"신호 발생 시 계산":money(result.stop)+" / "+money(result.target);$("decision").textContent="종합 "+result.score+"/100점 · "+result.status+" (참고용)";$("checks").replaceChildren();for(const c of result.checks){const li=document.createElement("li");li.textContent=(c.pass?"✓ ":"✕ ")+c.label+" ("+c.weight+"점)";li.className=c.pass?"ok":"muted";$("checks").append(li);}$("extra").textContent="VWAP "+money(result.vwap)+" · 볼린저 중심선 "+money(result.band.middle)+" · 상단 "+money(result.band.upper)+" · 하단 "+money(result.band.lower)+" · 거래량 비율 "+result.volumeRatio.toFixed(2)+"배 · 목표/손절은 단순 1.5R 예시";
draw($("chart"),result);$("status").textContent="분석 완료. 실시간 주문 신호가 아닙니다.";}catch(err){$("status").textContent="분석 불가: "+err.message;}finally{pending=false;}});
}
function draw(svg,r){svg.replaceChildren();const rows=r.rows.slice(-60),bands=r.bands.slice(-60),values=[...rows.map(x=>x.close),...bands.flatMap(x=>x?[x.upper,x.lower]:[])],lo=Math.min(...values)*.998,hi=Math.max(...values)*1.002;
function poly(vals,color){const pts=vals.map((v,i)=>Number.isFinite(v)?(20+i*600/Math.max(1,vals.length-1)).toFixed(1)+","+(220-(v-lo)/(hi-lo||1)*200).toFixed(1):null).filter(Boolean).join(" ");const p=document.createElementNS("http://www.w3.org/2000/svg","polyline");p.setAttribute("points",pts);p.setAttribute("fill","none");p.setAttribute("stroke",color);p.setAttribute("stroke-width","2");svg.append(p);}
poly(bands.map(x=>x?.upper??null),"#fb7185");poly(bands.map(x=>x?.middle??null),"#facc15");poly(bands.map(x=>x?.lower??null),"#38bdf8");poly(rows.map(x=>x.close),"#ffffff");}
return {compute,init};});