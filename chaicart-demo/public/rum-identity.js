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
