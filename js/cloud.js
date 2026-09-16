import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, deleteDoc, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDANjPaoek0JR-XNCwpuHaMG7JzfVgryNQ',
  authDomain: 'mc-skin-editor-27782.firebaseapp.com',
  projectId: 'mc-skin-editor-27782',
  storageBucket: 'mc-skin-editor-27782.firebasestorage.app',
  messagingSenderId: '472138898361',
  appId: '1:472138898361:web:8fa557805707b5a6153468'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
const listeners = [];

function emit(){listeners.forEach(fn=>fn(currentUser));}
function textureToDataUrl(){
  if(window.SkinForge?.getTextureDataUrl)return window.SkinForge.getTextureDataUrl();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const source=document.querySelector('#skinCanvas');
  if(!source)throw new Error('Skin canvas not found');
  canvas.getContext('2d').drawImage(source,0,0,64,64);
  return canvas.toDataURL('image/png');
}
function id(){return crypto.randomUUID();}

onAuthStateChanged(auth,user=>{currentUser=user;emit();});
window.SkinCloud={
  onAuthStateChanged(fn){listeners.push(fn);fn(currentUser);},
  get user(){return currentUser;},
  async register(email,password){return createUserWithEmailAndPassword(auth,email,password);},
  async login(email,password){return signInWithEmailAndPassword(auth,email,password);},
  async logout(){return signOut(auth);},
  async resetPassword(email){return sendPasswordResetEmail(auth,email);},
  async saveSkin(name='Untitled Skin',skinId=null){
    if(!currentUser)throw new Error('Sign in to use cloud saving.');
    const skin=skinId||id();
    const ref=doc(db,'users',currentUser.uid,'skins',skin);
    const existing=await getDoc(ref);
    const version=(existing.exists()?Number(existing.data().version||0):0)+1;
    const data={id:skin,name:String(name||'Untitled Skin').slice(0,100),png:textureToDataUrl(),version,updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
    await setDoc(ref,data,{merge:true});
    await setDoc(doc(ref,'versions',String(version)),{version,png:data.png,createdAt:serverTimestamp()});
    return {id:skin,version};
  },
  async listSkins(){
    if(!currentUser)return [];
    const q=query(collection(db,'users',currentUser.uid,'skins'),orderBy('updatedAt','desc'));
    const snap=await getDocs(q);
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  },
  async loadSkin(skinId){
    if(!currentUser)throw new Error('Sign in to load cloud skins.');
    const snap=await getDoc(doc(db,'users',currentUser.uid,'skins',skinId));
    if(!snap.exists())throw new Error('Skin no longer exists.');
    return snap.data();
  },
  async deleteSkin(skinId){
    if(!currentUser)throw new Error('Sign in to manage cloud skins.');
    await deleteDoc(doc(db,'users',currentUser.uid,'skins',skinId));
  }
};
