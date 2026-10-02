const base=process.env.BASE_URL||'http://localhost:8080';
const rate=Number(process.env.RATE||60),seconds=Number(process.env.SECONDS||45);
if(!Number.isInteger(rate)||rate<1||rate>100||!Number.isInteger(seconds)||seconds<1||seconds>120)throw new Error('RATE must be 1–100; SECONDS 1–120');
let pending=0,sent=0,success=0,failed=0;const deadline=Date.now()+seconds*1000;
console.log(`Sending demo orders to ${base}: ${rate}/s for ${seconds}s`);
await new Promise(resolve=>{const timer=setInterval(()=>{if(Date.now()>=deadline){clearInterval(timer);resolve();return;}if(pending>=1100)return;pending++;sent++;fetch(base+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({city:'Mumbai',items:[{id:'masala',quantity:1}]}),signal:AbortSignal.timeout(40000)}).then(r=>{if(r.ok)success++;else failed++;}).catch(()=>failed++).finally(()=>pending--);},1000/rate);});
while(pending)await new Promise(r=>setTimeout(r,200));
console.log({sent,success,failed});
