import {timingSafeEqual,randomUUID} from 'node:crypto';
export const authError=(status,message)=>Object.assign(new Error(message),{status});
export function firebaseAuthorizer({verifyIdToken,hasAdmin}){
  return async req=>{
    const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
    if(!match)throw authError(401,'Sign in with Google to continue');
    let user;
    try{user=await verifyIdToken(match[1],true);}catch(e){if(e.code?.startsWith('auth/')&&!['auth/internal-error','auth/insufficient-permission'].includes(e.code))throw authError(401,'Your sign-in is invalid or expired. Sign in again.');throw authError(503,'Sign-in verification is unavailable');}
    if(!user.email||user.email_verified!==true||user.firebase?.sign_in_provider!=='google.com')throw authError(403,'A verified Google account is required');
    if(user.email.includes('/'))throw authError(403,'Invalid admin email');
    let allowed;try{allowed=await hasAdmin(user.email);}catch{throw authError(503,'Admin access could not be checked. Try again.');}
    if(!allowed)throw authError(403,'This account is not in the workshop admin list');
    return {uid:user.uid,email:user.email};
  };
}
export async function createAuthorizer({mode,adminToken,projectId}){
  if(mode==='local-token')return async req=>{const a=Buffer.from(req.headers.authorization||'');const b=Buffer.from('Bearer '+adminToken);if(!adminToken||a.length!==b.length||!timingSafeEqual(a,b))throw authError(401,'Local facilitator token required');return {email:'local-demo'};};
  if(mode!=='firebase'||!projectId)return async()=>{throw authError(503,'Firebase facilitator sign-in is not configured');};
  const {initializeApp,applicationDefault}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId,credential:applicationDefault()},'chaicart-'+randomUUID());
  return firebaseAuthorizer({verifyIdToken:(token,revoked)=>getAuth(app).verifyIdToken(token,revoked),hasAdmin:async email=>(await getFirestore(app).collection('admins').doc(email).get()).exists});
}
