'use client';
import React,{useEffect,useState}from 'react';
import{Clock,Sparkles}from 'lucide-react';
const LAUNCH_MS=new Date('2026-11-21T11:00:00-03:00').getTime();
function getUyStatus(now: Date){
const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Montevideo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
const m: Record<string,string>={};p.forEach(x=>{if(x.type!=='literal')m[x.type]=x.value});
const d=m.weekday,h=Number(m.hour==='24'?0:m.hour),min=Number(m.minute),t=h*60+min;
let open=false,next='';
if(d==='Wed'){open=t<120;next='Jueves 17:00 hs';}
else if(d==='Thu'){open=t>=1020;next='Hoy 17:00 hs';}
else{open=t<120||t>=660;next=t>=120&&t<660?'Hoy 11:00 hs':'Mañana 11:00 hs';}
return{open,next,timeStr:String(h).padStart(2,'0')+':'+String(min).padStart(2,'0')};
}
export default function LiveLaunchStatus(){
const[now,setNow]=useState<number|null>(null);
useEffect(()=>{setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
if(!now)return null;const diff=Math.max(0,now-LAUNCH_MS);
const days=Math.floor(diff/86400000),hrs=Math.floor((diff%86400000)/3600000),mins=Math.floor((diff%3600000)/60000),secs=Math.floor((diff%60000)/1000);
const st=getUyStatus(new Date(now));
return(<div className='mb-4 space-y-2.5'><div className='flex flex-wrap items-center gap-2'><span className={'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide border '+(st.open?'bg-emerald-500/20 border-emerald-400/50 text-emerald-300':'bg-red-500/20 border-red-400/60 text-red-300 animate-pulse')}><Clock className='w-3.5 h-3.5'/>{st.open?'ABIERTO AHORA':'CERRADO AHORA'} · {st.timeStr} UY</span><span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-400/40 text-amber-200'><Sparkles className='w-3.5 h-3.5 text-amber-400'/>Recién llegamos: {days}d {String(hrs).padStart(2,'0')}h {String(mins).padStart(2,'0')}m {String(secs).padStart(2,'0')}s online</span></div>{!st.open&&(<div className='p-3 rounded-2xl bg-red-950/50 border border-red-500/40 text-xs text-red-100'><strong className='text-red-300'>Local cerrado (abrimos {st.next}):</strong> ¡Igual podés dejar tu pedido encargado ahora y sale <strong>entre los primeros</strong> apenas abramos!</div>)}</div>);
}