let user=null,token='',auth,signOutFn,googleSignIn,mode='firebase';
const listeners=[];
export const currentCustomer=()=>user;
export const customerHeaders=async()=>{if(!user)throw new Error('Sign in before ordering');return {authorization:'Bearer '+(auth?await auth.currentUser.getIdToken():token)};};
export const onCustomerChange=fn=>listeners.push(fn);
function changed(){for(const fn of listeners)fn(user);}
export async function signInCustomer(){
 if(mode==='local-token'){const res=await fetch('/api/auth/demo',{method:'POST'});const data=await res.json();if(!res.ok)throw new Error(data.error);token=data.token;user=data.user;changed();}
 else if(googleSignIn)await googleSignIn();else throw new Error('Firebase sign-in is not configured');
}
export async function signOutCustomer(){if(auth)await signOutFn(auth);token='';user=null;changed();}
export async function initializeCustomerAuth(){
 const response=await fetch('/api/auth/config');const config=await response.json();mode=config.mode;
 const button=document.querySelector('#customer-login');
 if(mode==='local-token'){button.disabled=false;button.textContent='Use demo customer';return;}
 if(!config.configured){button.textContent='Sign-in unavailable';document.querySelector('#customer-name').textContent='Firebase configuration is required to order.';return;}
 const {initializeApp}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
 const {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,setPersistence,inMemoryPersistence,signOut}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
 auth=getAuth(initializeApp(config.firebase));signOutFn=signOut;await setPersistence(auth,inMemoryPersistence);googleSignIn=()=>signInWithPopup(auth,new GoogleAuthProvider());
 onAuthStateChanged(auth,u=>{user=u?{uid:u.uid,email:u.email}:null;changed();});button.disabled=false;button.textContent='Sign in with Google';
}
