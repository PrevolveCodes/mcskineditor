const cloud = () => window.SkinCloud;
const $ = s => document.querySelector(s);

function esc(s) { return String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
function showDialog(html) {
  const d = $('#dialog');
  d.innerHTML = html;
  d.classList.remove('hidden');
  d.querySelector('[data-close]')?.addEventListener('click', () => d.classList.add('hidden'));
  return d;
}
function closeDialog() { $('#dialog')?.classList.add('hidden'); }
function toast(message) { const t=$('#toast'); if(!t)return; t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
function errorText(e) {
  const code = e?.code || '';
  const map = {
    'auth/email-already-in-use':'That email is already registered.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/weak-password':'Use a stronger password.',
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/invalid-login-credentials':'Email or password is incorrect.',
    'auth/network-request-failed':'Firebase could not connect. Check your internet connection.'
  };
  return map[code] || e?.message || 'Something went wrong.';
}
function accountDialog() {
  if (cloud()?.user) {
    const u=cloud().user;
    showDialog(`<div class="dialog-card"><button class="dialog-x" data-close>×</button><h2>Cloud Account</h2><p>Signed in as <b>${esc(u.email || 'Firebase account')}</b></p><div class="dialog-actions"><button id="cloudSyncNow" class="primary">Sync Now</button><button id="cloudLogout">Log Out</button></div><p class="dialog-note">Your skins are private to your Firebase account. This editor uses Firestore; Firebase Storage is not used.</p></div>`);
    $('#cloudSyncNow').onclick=async()=>{closeDialog();await refreshLibrary();toast('Cloud library refreshed');};
    $('#cloudLogout').onclick=async()=>{await cloud().logout();closeDialog();};
    return;
  }
  showDialog(`<div class="dialog-card"><button class="dialog-x" data-close>×</button><h2>Cloud Account</h2><div class="auth-tabs"><button class="auth-tab active" data-auth="login">Log In</button><button class="auth-tab" data-auth="register">Create Account</button></div><form id="authForm"><label>Email<input id="authEmail" type="email" autocomplete="email" required></label><label>Password<input id="authPassword" type="password" autocomplete="current-password" minlength="6" required></label><button class="primary wide" type="submit">Log In</button><button id="resetPassword" type="button" class="link-btn">Forgot password?</button><div id="authError" class="auth-error"></div></form><p class="dialog-note">Cloud sync is optional. Local editing continues to work without an account.</p></div>`);
  let mode='login';
  const form=$('#authForm');
  document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>{mode=b.dataset.auth;document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x===b));$('#authPassword').autocomplete=mode==='login'?'current-password':'new-password';form.querySelector('button[type=submit]').textContent=mode==='login'?'Log In':'Create Account';$('#resetPassword').style.display=mode==='login'?'block':'none';});
  form.onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPassword').value;const err=$('#authError');err.textContent='';try{if(mode==='login')await cloud().login(email,password);else await cloud().register(email,password);closeDialog();toast('Cloud account connected');}catch(ex){err.textContent=errorText(ex);}};
  $('#resetPassword').onclick=async()=>{const email=$('#authEmail').value.trim();if(!email){$('#authError').textContent='Enter your email first.';return;}try{await cloud().resetPassword(email);$('#authError').textContent='Password reset email sent.';}catch(e){$('#authError').textContent=errorText(e);}};
}

async function refreshLibrary() {
  const list=$('#libraryList');
  if(!list)return;
  if(!cloud()?.user){list.innerHTML='<div class="empty">Sign in to sync skins across devices.</div>';return;}
  list.innerHTML='<div class="empty">Loading cloud skins…</div>';
  try {
    const skins=await cloud().listSkins();
    if(!skins.length){list.innerHTML='<div class="empty">No cloud skins yet. Use Save to upload this skin.</div>';return;}
    list.innerHTML=skins.map(s=>`<div class="library-item"><div><b>${esc(s.name)}</b><small>Version ${Number(s.version||1)}</small></div><div class="library-actions"><button data-load="${esc(s.id)}">Load</button><button data-delete="${esc(s.id)}">Delete</button></div></div>`).join('');
    list.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>loadCloudSkin(b.dataset.load));
    list.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this cloud skin?'))return;try{await cloud().deleteSkin(b.dataset.delete);await refreshLibrary();toast('Cloud skin deleted');}catch(e){toast(errorText(e));}});
  } catch(e) { list.innerHTML=`<div class="empty">${esc(errorText(e))}</div>`; }
}

async function loadCloudSkin(id) {
  try {
    const skin=await cloud().loadSkin(id);
    const res=await fetch(skin.png); const blob=await res.blob();
    const file=new File([blob], `${skin.name || 'cloud-skin'}.png`, {type:'image/png'});
    const dt=new DataTransfer(); dt.items.add(file); const input=$('#fileInput'); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    toast(`Loaded ${skin.name || 'skin'}`);
  } catch(e) { toast(errorText(e)); }
}

async function cloudSave() {
  if(!cloud()?.user){accountDialog();return;}
  const name=prompt('Cloud skin name:', 'My Skin');
  if(name===null)return;
  try { $('#syncState').textContent='Cloud saving…'; const result=await cloud().saveSkin(name); $('#syncState').textContent='Cloud saved'; toast(`Saved to cloud · v${result.version}`); await refreshLibrary(); }
  catch(e){$('#syncState').textContent='Local';toast(errorText(e));}
}

window.addEventListener('DOMContentLoaded',()=>{
  cloud().onAuthStateChanged(async user=>{
    const account=$('#accountBtn');
    if(account) account.textContent=user?'Account ✓':'Account';
    const state=$('#syncState');
    if(state) state.textContent=user?'Cloud ready':'Local';
    await refreshLibrary();
  });
  $('#accountBtn')?.addEventListener('click',accountDialog);
  $('#saveBtn')?.addEventListener('click',cloudSave);
  $('#refreshLibrary')?.addEventListener('click',refreshLibrary);
});
