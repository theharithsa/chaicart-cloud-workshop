import { beginRumAction } from './rum-actions.js';
// Random browser identity, not a hardware ID. Never used for authorization.
const key = 'chaicart-rum-browser-id';
let browserId;
function anonymousIdentity() {
  if (browserId) return browserId;
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^browser:[0-9a-f-]{36}$/.test(saved)) browserId = saved;
  } catch { /* Storage may be unavailable in private browsing. */ }
  browserId ||= 'browser:' + crypto.randomUUID();
  try { localStorage.setItem(key, browserId); } catch { /* Keep the ID for this page. */ }
  return browserId;
}
let timer;
export function identifyRumUser(email = '') {
  clearInterval(timer);
  const identity = email || anonymousIdentity();
  let attempts = 0;
  const identify = () => {
    try { if (window.dynatrace?.identifyUser) { window.dynatrace.identifyUser(identity); return true; } if (window.dtrum) { window.dtrum.identifyUser(identity); return true; } } catch { /* RUM must not interrupt the app. */ }
    return false;
  };
  if (!identify()) timer = setInterval(() => { if (identify() || ++attempts >= 20) clearInterval(timer); }, 500);
}
identifyRumUser();

// Name only known workshop links; never include query strings, answers or team codes.
const pages = { 'day1-slides.html':'Day 1 Slides', 'day2-slides.html':'Day 2 Slides', 'facilitator-guide.html':'Facilitator Guide', 'facilitator.html':'Facilitator Notes', 'workshop-flow.html':'Workshop Flow', 'index.html':'Workshop Home' };
document.addEventListener('click', event => {
  const link=event.target?.closest?.('a[href]');if(!link)return;
  let target;try{target=new URL(link.href,location.href);}catch{return;}
  const name=target.origin===location.origin ? pages[target.pathname.split('/').pop()] : target.hostname==='gmu.inspi.in' ? 'ChaiCart Live' : target.hostname==='chaicart-workshop-vh-20261003.azurewebsites.net' ? 'ChaiCart Demo' : undefined;
  if(name){const action=beginRumAction('Open '+name);action.end();}
});
