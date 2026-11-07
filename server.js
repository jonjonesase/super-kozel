const http=require('http'),fs=require('fs'),path=require('path');
const tables=new Map(),cl=new Map();let seq=1;
const clean=s=>String(s||'').replace(/[<>&"]/g,'').trim().slice(0,16)||'Игрок';
const tx=(c,ev,d)=>{if(c&&c.res)c.res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)};
const list=()=>[...tables.values()].map(t=>({id:t.id,title:t.title,n:t.n,started:t.started,players:t.p.map(p=>cl.get(p).name)}));
const lobby=()=>{const l=list();for(const c of cl.values())if(!c.tid)tx(c,'lobby',l)};
const info=t=>({id:t.id,title:t.title,n:t.n,names:t.p.map(p=>cl.get(p).name)});
const each=(t,ev,f)=>t.p.forEach((p,i)=>tx(cl.get(p),ev,f(i)));
const upd=t=>each(t,'table',s=>({...info(t),seat:s}));
const startGame=t=>{t.started=true;each(t,'start',i=>({names:info(t).names,n:t.n,seat:i}));lobby()};
function leave(pid){
  const c=cl.get(pid);if(!c||!c.tid)return;const t=tables.get(c.tid);c.tid=null;if(!t)return;
  const i=t.p.indexOf(pid);t.p.splice(i,1);
  if(t.started||!t.p.length||i===0){t.p.forEach(p=>{const o=cl.get(p);o.tid=null;tx(o,'closed',{})});tables.delete(t.id)}
  else upd(t);
  lobby();
}
const ops={
  lobby:(pid,c)=>tx(c,'lobby',list()),
  create:(pid,c,b)=>{if(c.tid)return'Вы уже за столом';const n=[2,3,4].includes(+b.n)?+b.n:2;
    const t={id:String(seq++),title:clean(b.title),n,p:[pid],started:false};tables.set(t.id,t);c.tid=t.id;upd(t);lobby()},
  join:(pid,c,b)=>{const t=tables.get(b.tid);if(c.tid)return'Вы уже за столом';
    if(!t||t.started||t.p.length>=t.n)return'Стол недоступен';
    t.p.push(pid);c.tid=t.id;if(t.p.length===t.n)startGame(t);else{upd(t);lobby()}},
  start:(pid,c)=>{const t=tables.get(c.tid);if(!t||t.started||t.p[0]!==pid)return'Нельзя начать';startGame(t)},
  leave:pid=>leave(pid),
  relay:(pid,c,b)=>{const t=tables.get(c.tid);if(!t||!t.started)return;tx(cl.get(t.p[b.to]),'msg',{from:t.p.indexOf(pid),topic:b.topic,data:b.data})}
};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/events'){
    const pid=u.searchParams.get('pid');if(!pid)return res.end();
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    let c=cl.get(pid);if(c){clearTimeout(c.g);c.res=res}else cl.set(pid,c={res,tid:null});
    c.name=clean(u.searchParams.get('name'));
    tx(c,'lobby',list());
    const t=c.tid&&tables.get(c.tid);if(t&&!t.started)tx(c,'table',{...info(t),seat:t.p.indexOf(pid)});
    const k=setInterval(()=>res.write(': \n\n'),15000);
    req.on('close',()=>{clearInterval(k);if(c.res===res){c.res=null;c.g=setTimeout(()=>{leave(pid);cl.delete(pid)},20000)}});
    return;
  }
  if(u.pathname==='/api'&&req.method==='POST'){
    let s='';req.on('data',d=>{s+=d;if(s.length>65536)req.destroy()});
    req.on('end',()=>{let b={};try{b=JSON.parse(s)}catch(e){}
      const c=cl.get(b.pid);res.setHeader('Content-Type','application/json');
      if(!c)return res.end('{"err":"Нет соединения с сервером"}');
      const e=ops[b.op]&&ops[b.op](b.pid,c,b);res.end(JSON.stringify(e?{err:e}:{}))});
    return;
  }
  fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{res.writeHead(e?404:200,{'Content-Type':'text/html; charset=utf-8'});res.end(d)});
}).listen(process.env.PORT||3000,()=>console.log('Супер козел: порт '+(process.env.PORT||3000)));
