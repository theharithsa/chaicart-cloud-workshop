import {createTelemetry} from './telemetry.js';
import {createAuthorizer,authError} from './auth.js';
import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const MENU = [
  {id:'coffee',name:'Filter Coffee',description:'Rich coffee, frothy milk, and a fresh start.',price:35,icon:'☕',tag:'Coffee break'},
  {id:'masala',name:'Signature Masala',description:'Bold Assam tea, warming spices, a little everyday magic.',price:25,icon:'☕',tag:'Bestseller'},
  {id:'ginger',name:'Adrak Kick',description:'Fresh ginger. Strong brew. Your afternoon, rescued.',price:30,icon:'🫚',tag:'Fresh & fiery'},
  {id:'elaichi',name:'Elaichi Comfort',description:'Fragrant cardamom and silky milk. Take a slow sip.',price:30,icon:'🌿',tag:'A little calmer'},
  {id:'samosa',name:'Samosa Duo',description:'Two golden pockets of potato, peas and crunchy joy.',price:40,icon:'🥟',tag:'Chai’s best friend'}
];
const sleep = ms => new Promise(r=>setTimeout(r,ms));
class Pool {
  active=0; waiting=[]; size=50;
  acquire(timeout) {
    if(this.active<this.size){this.active++;return Promise.resolve();}
    if(this.waiting.length>=1000)return Promise.reject(new Error('Pool queue full'));
    return new Promise((resolve,reject)=>{
      const entry={resolve,timer:setTimeout(()=>{this.waiting=this.waiting.filter(x=>x!==entry);reject(new Error('Connection is not available'));},timeout)};
      this.waiting.push(entry);
    });
  }
  release(){this.active--;this.drain();}
  drain(){while(this.active<this.size&&this.waiting.length){const e=this.waiting.shift();clearTimeout(e.timer);this.active++;e.resolve();}}
  resize(size){this.size=size;this.drain();}
}
const publicDir=fileURLToPath(new URL('./public/',import.meta.url));
export async function createApp({adminToken=process.env.ADMIN_TOKEN, dataDir=process.env.DATA_DIR||'data', timeout=Number(process.env.POOL_TIMEOUT_MS||30000), gatewayDelay=Number(process.env.GATEWAY_DELAY_MS||205), customerAuthorizer, authMode=process.env.AUTH_MODE||'firebase', authorizer, firebaseConfig={apiKey:process.env.FIREBASE_API_KEY,authDomain:process.env.FIREBASE_AUTH_DOMAIN,projectId:process.env.FIREBASE_PROJECT_ID,appId:process.env.FIREBASE_APP_ID}}={}) {
  const logs=[];
  const telemetry=createTelemetry('chaicart-demo',{onLog:entry=>{logs.push(entry);if(logs.length>500)logs.shift();console.log(JSON.stringify(entry));}});
  const authorize=authorizer||await createAuthorizer({mode:authMode,adminToken,projectId:firebaseConfig.projectId,observe:(name,attributes,work)=>telemetry.span(name,attributes,work)});
  const demoSessions=new Map();
  const customer=customerAuthorizer||authorize.customer|| (async req=>{
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');const session=demoSessions.get(token);
    if(authMode!=='local-token'||!session||session.expires<Date.now())throw authError(401,'Sign in to place or view orders');
    return session.user;
  });
  async function authenticate(req, role, verify){
    return telemetry.span('auth.verify.'+role,{'auth.method':authMode,'user.role':role},async()=>{
      try { const identity=await verify(req);telemetry.enrich({'user.id':identity.uid||'local-demo','user.email':identity.email,'user.role':role});telemetry.recordAuth('success',role,authMode);telemetry.log('INFO','Identity verified',{'event.name':'auth.identity.verified','auth.outcome':'success'});return identity; }
      catch(error){telemetry.recordAuth('failure',role,authMode);telemetry.log(error.status===503?'ERROR':'WARN','Identity verification rejected',{'event.name':'auth.identity.rejected','auth.outcome':'failure','error.type':String(error.status||500)});throw error;}
    });
  }
  const publicOrder=order=>{const {lookupToken,customerUid,...visible}=order;return visible;};
  const pool=new Pool();
  let state={orders:[],events:[]}, mode='healthy', erpPaused=false;
  await mkdir(dataDir,{recursive:true});
  try{state=JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let saving=Promise.resolve();
  function persist(){const snapshot=JSON.stringify(state);const task=saving.then(async()=>{const p=path.join(dataDir,'state.json');await writeFile(p+'.tmp',snapshot);await rename(p+'.tmp',p);});saving=task.catch(()=>{});return task;}
  const traces=[], samples=[], changes=[];
  function log(level,service,message,extra={}){telemetry.log(level,message,{component:service,...extra});}
  function change(message){const e={timestamp:new Date().toISOString(),message};changes.push(e);if(changes.length>100)changes.shift();log('INFO','payment-service',message);}
  async function span(localTrace,service,name,work,parentId){
    return telemetry.span(name,{'chaicart.component':service,'chaicart.simulated':service.includes('demo')||['cart-service','payment-service','event-worker'].includes(service)},async current=>{
      const s={service,name,spanId:current.spanContext().spanId==='0000000000000000'?randomBytes(8).toString('hex'):current.spanContext().spanId,parentId,start:Date.now(),status:'OK'};
      localTrace.spans.push(s);
      try{return await work(s);}catch(e){s.status='ERROR';throw e;}finally{s.duration=Date.now()-s.start;}
    });
  }
  const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw Object.assign(new Error('Request too large'),{status:413});}try{return JSON.parse(text||'{}');}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
  async function fulfill(order,trace){
    await span(trace,'event-worker','OrderPlaced → business systems',async()=>{
      for(const system of ['CRM','SCM','HCM','BI','ERP'])await telemetry.span('business.event.'+system,{'order.id':order.id,'business.system':system,'chaicart.simulated':true},async()=>{const status=system==='ERP'&&erpPaused?'queued':'completed';state.events.push({id:randomUUID(),orderId:order.id,system,status,timestamp:new Date().toISOString()});telemetry.enrich({'business.event.status':status});});
      if(state.events.length>3000)state.events.splice(0,state.events.length-3000);
      await telemetry.span('orders.persist',{'order.id':order.id,'storage.type':'local-file'},()=>persist());
    });
  }
  telemetry.gauges('chaicart.payment.pool.capacity','{connection}',()=>pool.size);
  telemetry.gauges('chaicart.payment.pool.active','{connection}',()=>pool.active);
  telemetry.gauges('chaicart.payment.pool.waiting','{request}',()=>pool.waiting.length);
  telemetry.gauges('chaicart.fulfillment.backlog','{event}',()=>state.events.filter(e=>e.status==='queued').length);
  telemetry.gauges('chaicart.fulfillment.backlog.age','s',()=>{const queued=state.events.filter(e=>e.status==='queued');return queued.length?(Date.now()-Math.min(...queued.map(e=>Date.parse(e.timestamp))))/1000:0;});
  const server=http.createServer((req,res)=>telemetry.request(req,res,async()=>{
    const started=Date.now();const url=new URL(req.url,'http://localhost');
    const sc=telemetry.current()?.spanContext();
    const trace={traceId:sc&&sc.traceId!=='00000000000000000000000000000000'?sc.traceId:randomBytes(16).toString('hex'),timestamp:new Date().toISOString(),path:url.pathname,spans:[]};
    res.setHeader('x-trace-id',trace.traceId);
    telemetry.enrich({'chaicart.scenario':mode});
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('content-security-policy',"default-src 'self'; style-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com https://js-cdn.dynatrace.com; connect-src 'self' https://*.dynatrace.com https://*.dynatrace-managed.com https://*.googleapis.com https://*.firebaseapp.com https://*.web.app; frame-src https://*.firebaseapp.com https://*.web.app https://accounts.google.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    res.on('finish',()=>{
      if(!url.pathname.startsWith('/api/admin')){
        const sample={time:Date.now(),duration:Date.now()-started,status:res.statusCode,path:url.pathname};samples.push(sample);if(samples.length>5000)samples.shift();
      }
    });
    try{
      if(url.pathname.startsWith('/api/admin')){
        const identity=await authenticate(req,'facilitator',authorize);telemetry.enrich({'user.id':identity.uid||'local-demo','user.email':identity.email,'user.role':'facilitator'});
        if(req.method==='GET'&&url.pathname==='/api/admin/session')return json(res,200,identity);
        if(req.method==='GET'&&url.pathname==='/api/admin/telemetry'){
          const recent=samples.filter(x=>x.time>Date.now()-60000);const checkout=recent.filter(x=>x.path==='/api/checkout');const durations=checkout.map(x=>x.duration).sort((a,b)=>a-b);const good=checkout.filter(x=>x.status<400&&x.duration<2000).length;
          return json(res,200,{mode,erpPaused,pool:{size:pool.size,active:pool.active,waiting:pool.waiting.length},metrics:{requestsPerMinute:recent.length,checkouts:checkout.length,p95:durations[Math.max(0,Math.ceil(durations.length*.95)-1)]||0,errorRate:checkout.length?checkout.filter(x=>x.status>=400).length/checkout.length*100:0,sli:checkout.length?good/checkout.length*100:null,slo:99.9,badRequests:checkout.length-good,allowedBadRequests:checkout.length*.001},logs:logs.slice(-80),traces:traces.slice(-30),changes,orders:state.orders.slice(-30).reverse(),events:state.events.slice(-100).reverse()});
        }
        if(req.method==='POST'&&url.pathname==='/api/admin/scenario'){
          const b=await body(req);
          if(!b||!['healthy','pool-exhaustion','gateway-down','erp-down'].includes(b.scenario))return json(res,400,{error:'Unknown scenario'});
          mode=b.scenario;erpPaused=mode==='erp-down';pool.resize(mode==='pool-exhaustion'?5:50);
          telemetry.enrich({'chaicart.scenario':mode});log('INFO','facilitator','Scenario changed',{'event.name':'scenario.changed',scenario:mode});
          change(mode==='pool-exhaustion'?'Deploy payment-service v2.3.1: maximumPoolSize=5 (was 50), FINOPS-482; load test skipped':`Rollback / scenario: ${mode}; maximumPoolSize=50`);
          if(!erpPaused){for(const event of state.events)if(event.status==='queued')event.status='completed';await persist();}
          return json(res,200,{mode});
        }
        return json(res,404,{error:'Not found'});
      }
      if(req.method==='POST'&&url.pathname==='/api/auth/demo'){
        if(authMode!=='local-token')return json(res,404,{error:'Not found'});
        for(const [key,s]of demoSessions)if(s.expires<Date.now())demoSessions.delete(key);
        if(demoSessions.size>=200)return json(res,429,{error:'Too many demo sessions; restart the local demo'});
        const token=randomBytes(32).toString('hex');const user={uid:randomUUID(),email:'Local demo customer'};demoSessions.set(token,{user,expires:Date.now()+3600000});telemetry.enrich({'user.id':user.uid,'user.role':'customer'});telemetry.log('INFO','Local demo session created',{'event.name':'auth.session.created','auth.method':'local-demo'});return json(res,201,{token,user,demo:true});
      }
      if(req.method==='GET'&&url.pathname==='/api/auth/me'){const user=await authenticate(req,'customer',customer);telemetry.enrich({'user.id':user.uid,'user.email':user.email});return json(res,200,user);}
      if(req.method==='GET'&&url.pathname==='/api/orders'){const user=await authenticate(req,'customer',customer);telemetry.enrich({'user.id':user.uid,'user.email':user.email,'user.role':'customer'});return json(res,200,{orders:state.orders.filter(x=>x.customerUid===user.uid).slice(-20).reverse().map(publicOrder)});}
      if(req.method==='GET'&&url.pathname==='/api/auth/config')return json(res,200,{mode:authMode,configured:authMode==='local-token'?Boolean(adminToken):Boolean(firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId),...(authMode==='firebase'?{firebase:firebaseConfig}:{})});
      if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{status:'ok',service:'chaicart',storage:'local-file-demo'});
      if(req.method==='GET'&&url.pathname==='/api/menu')return json(res,200,{items:MENU,deliveryFee:10});
      if(req.method==='POST'&&url.pathname==='/api/checkout'){
        const user=await authenticate(req,'customer',customer);telemetry.enrich({'user.id':user.uid,'user.email':user.email,'user.role':'customer'});
        const b=await body(req);
        if(!b||!Array.isArray(b.items)||!b.items.length||b.items.length>10||!b.items.every(x=>MENU.some(m=>m.id===x.id)&&Number.isInteger(x.quantity)&&x.quantity>0&&x.quantity<=20)||!['Mumbai','Bengaluru','Hyderabad','Delhi','Pune'].includes(b.city))return json(res,400,{error:'Choose a city and valid cart items'});
        const orderId='CC-'+randomBytes(5).toString('hex').toUpperCase();
        telemetry.enrich({'order.id':orderId,'cart.item_count':b.items.reduce((n,x)=>n+x.quantity,0),'payment.method':'simulated-payfast'});
        let order;
        try{
          await span(trace,'checkout-service','POST /api/checkout',async root=>{
            const items=await span(trace,'cart-service','Validate cart & calculate total',async()=>b.items.map(x=>({...x,price:MENU.find(m=>m.id===x.id).price})),root.spanId);
            const total=10+items.reduce((sum,x)=>sum+x.price*x.quantity,0);
            telemetry.enrich({'cart.total_value':total,'cart.currency':'INR'});telemetry.recordCart(total,items.reduce((n,x)=>n+x.quantity,0));
            await span(trace,'payment-service','Process demo payment',async payment=>{
              await span(trace,'payment-service','Pool.getConnection',async()=>{const poolStarted=performance.now();log('INFO','payment-service','Pool stats',{maximumPoolSize:pool.size,active:pool.active,waiting:pool.waiting.length,trace_id:trace.traceId});try{await pool.acquire(timeout);telemetry.recordOperation('payment.pool.acquire','success',(performance.now()-poolStarted)/1000);}catch(e){telemetry.recordOperation('payment.pool.acquire','failure',(performance.now()-poolStarted)/1000);throw e;}},payment.spanId);
              try{
                await span(trace,'orders-db-demo','INSERT pending payment',()=>sleep(12),payment.spanId);
                await span(trace,'payfast-demo','Demo gateway charge',async()=>{await sleep(gatewayDelay);if(mode==='gateway-down')throw new Error('PayFast gateway unavailable');},payment.spanId);
                await span(trace,'orders-db-demo','UPDATE payment result',()=>sleep(5),payment.spanId);
              }finally{pool.release();}
            },root.spanId);
            order={customerUid:user.uid,id:orderId,lookupToken:randomBytes(24).toString('hex'),city:b.city,items,total,createdAt:Date.now(),traceId:trace.traceId,transactionId:res.getHeader('x-transaction-id')};
            telemetry.enrich({'order.id':order.id,'transaction.id':order.transactionId});log('INFO','checkout','Order placed',{'event.name':'order.placed','order.id':order.id});
            state.orders.push(order);if(state.orders.length>1000)state.orders.shift();await fulfill(order,trace);
          });
          trace.status=201;json(res,201,{...publicOrder(order),etaMinutes:10});
        }catch(e){trace.status=504;log('ERROR','payment-service',e.message,{trace_id:trace.traceId});json(res,504,{error:'Payment could not complete. Please try again.',traceId:trace.traceId});}
        finally{traces.push(trace);if(traces.length>100)traces.shift();}
        return;
      }
      if(req.method==='GET'&&url.pathname.startsWith('/api/orders/')){
        const user=await authenticate(req,'customer',customer);telemetry.enrich({'user.id':user.uid,'user.email':user.email,'user.role':'customer'});
        const order=state.orders.find(x=>x.id===url.pathname.split('/').pop()&&x.customerUid===user.uid);
        if(!order)return json(res,404,{error:'Order not found'});
        telemetry.enrich({'order.id':order.id,'transaction.id':order.transactionId||res.getHeader('x-transaction-id')});const age=Date.now()-order.createdAt;return json(res,200,{...publicOrder(order),status:age<10000?'Brewing':age<20000?'Packing':age<30000?'Rider assigned':'Delivered',demoTimeline:true});
      }
      const files={'/':'index.html','/rum-identity.js':'rum-identity.js','/rum-actions.js':'rum-actions.js','/app.js':'app.js','/customer-auth.js':'customer-auth.js','/style.css':'style.css','/facilitator':'facilitator.html','/facilitator.js':'facilitator.js'};
      if(req.method==='GET'&&files[url.pathname]){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(publicDir,files[url.pathname])));return;}
      json(res,404,{error:'Chai not found',path:url.pathname});
    }catch(e){log('ERROR','checkout-service',e.message,{trace_id:trace.traceId});if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Something went wrong'});else res.end();}
  }));
  return {server,pool,telemetry,close:async()=>{await new Promise(r=>server.close(r));await saving;await telemetry.shutdown();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if((process.env.AUTH_MODE||'firebase')==='firebase'&&!process.env.FIREBASE_PROJECT_ID)console.warn('Firebase sign-in is unconfigured: facilitator APIs fail closed.');
  const app=await createApp();app.server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('ChaiCart listening on '+(process.env.PORT||8080)));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await app.close();process.exit(0);});
}
