// Supports current and Classic agents. Monitoring must never affect application work.
let active = 0;
const allowed = new Set(['transaction_id','item_count','currency','order_id','total_value','outcome','error_code','action','page','site','app_version']);
const safe = work => { try { return work(); } catch { return undefined; } };
function fields(properties = {}) {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => allowed.has(key) && (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))).map(([key, value]) => ['event_properties.' + key, typeof value === 'string' ? value.slice(0,100) : value]));
}
export function rumEvent(name, properties = {}) {
  safe(() => globalThis.window?.dynatrace?.sendEvent?.({ 'event_properties.event_name': name, ...fields(properties) }));
}
export function beginRumAction(name, properties = {}) {
  if (!name || active) return { end() {} };
  const agent = globalThis.window;
  let action, classic, id;
  safe(() => {
    if (agent?.dynatrace?.userActions?.create) {
      const current = agent.dynatrace.userActions.current;
      action = current?.state === 'active' ? current : agent.dynatrace.userActions.create({ customName:name, completeAutomatically:false });
      if (action) { action.customName=name; action.completeAutomatically=false; action.event_properties={ ...action.event_properties, ...fields(properties) }; }
    } else if (agent?.dtrum?.enterAction) { classic=agent.dtrum; id=classic.enterAction(name); }
  });
  if (!action && !id) return { end() {} };
  active++;
  let ended=false;
  let timeout;
  const handle = { end(outcome='success', extra={}) {
    if (ended) return; ended=true; clearTimeout(timeout); active--;
    safe(() => { if(action) { action.event_properties={ ...action.event_properties, ...fields({...extra,outcome}) }; action.complete(); } else classic.leaveAction(id); });
    rumEvent('action_completed', {action:name,outcome,...properties,...extra});
  } };
  timeout=setTimeout(()=>handle.end('timeout'),120000);
  timeout.unref?.();
  return handle;
}
export async function withRumAction(name, work, properties = {}) {
  const action=beginRumAction(name,properties);
  try { const result=await work(); action.end('success'); return result; }
  catch(error) { const code=typeof error?.code === 'string' ? error.code.slice(0,100) : 'operation_failed';action.end('failure',{error_code:code});throw error; }
}
