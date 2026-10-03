import {timingSafeEqual,randomUUID} from 'node:crypto';
export const authError=(status,message)=>Object.assign(new Error(message),{status});
export function firebaseCustomerAuthorizer({verifyIdToken}){
 return async req=>{
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
  if(!match)throw authError(401,'Sign in to place or view orders');
  let user;
  try{user=await verifyIdToken(match[1],true);}catch(e){throw authError(e.code?.startsWith('auth/')?401:503,'Your sign-in could not be verified. Sign in again.');}
  if(!user.uid||!user.email||user.email_verified!==true||user.firebase?.sign_in_provider!=='google.com')throw authError(403,'A verified Google account is required');
  return {uid:user.uid,email:user.email};
 };
}
export function firebaseAuthorizer({verifyIdToken,hasAdmin}){
 const customer=firebaseCustomerAuthorizer({verifyIdToken});
 const admin=async req=>{
  const user=await customer(req);
  if(user.email.includes('/'))throw authError(403,'Invalid admin email');
  let allowed;try{allowed=await hasAdmin(user.email);}catch{throw authError(503,'Admin access could not be checked. Try again.');}
  if(!allowed)throw authError(403,'This account is not in the workshop admin list');
  return user;
 };
 admin.customer=customer;return admin;
}
export function firebaseCredential({projectId,serviceAccountJson,applicationDefault,cert}){
  if(!serviceAccountJson)return applicationDefault();
  try{
    const account=JSON.parse(serviceAccountJson);
    if(account.type!=='service_account'||account.project_id!==projectId||!account.client_email||!account.private_key)throw new Error('Invalid credential');
    return cert(account);
  }catch{
    // Never include credential contents or SDK parse errors in startup logs.
    throw new Error('Firebase service-account configuration is invalid or unresolved. Check the Key Vault reference and project.');
  }
}
export async function createAuthorizer({mode,adminToken,projectId,serviceAccountJson=process.env.FIREBASE_SERVICE_ACCOUNT_JSON}){
  if(mode==='local-token')return async req=>{const a=Buffer.from(req.headers.authorization||'');const b=Buffer.from('Bearer '+adminToken);if(!adminToken||a.length!==b.length||!timingSafeEqual(a,b))throw authError(401,'Local facilitator token required');return {email:'local-demo'};};
  if(mode!=='firebase'||!projectId)return async()=>{throw authError(503,'Firebase facilitator sign-in is not configured');};
  const {initializeApp,applicationDefault,cert}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');
  const credential=firebaseCredential({projectId,serviceAccountJson,applicationDefault,cert});
  const app=initializeApp({projectId,credential},'chaicart-'+randomUUID());
  return firebaseAuthorizer({verifyIdToken:(token,revoked)=>getAuth(app).verifyIdToken(token,revoked),hasAdmin:async email=>(await getFirestore(app).collection('admins').doc(email).get()).exists});
}
