/*Mcng 112 updated 232131*/
const firebaseConfig = {
  apiKey: "AIzaSyBTeofEXBlzZmELtVAVZ-dctZmOGvf0Y34",
  authDomain: "notice-83ae5.firebaseapp.com",
  databaseURL: "https://notice-83ae5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "notice-83ae5",
  storageBucket: "notice-83ae5.appspot.com",
  messagingSenderId: "268106877488",
  appId: "1:268106877488:web:798beadfe45104297e7bf5",
  measurementId: "G-8EY4MCZKK2"
};
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const blurphpApp = firebase.initializeApp({
  apiKey: "AIzaSyCKmrlS4qrZCrMNRIfIRCWCbNgZT1uQ3ZI",
  authDomain: "blurphp.firebaseapp.com",
  databaseURL: "https://blurphp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "blurphp",
  storageBucket: "blurphp.appspot.com",
  messagingSenderId: "593904200464",
  appId: "1:593904200464:web:cea7bc1360532c20d99395",
  measurementId: "G-R494S2DPZ5"
}, "blurphpApp");
const blurphpDb = blurphpApp.database();
const loginApp = firebase.initializeApp({
  apiKey: "AIzaSyCZ9zUxDf3V9TvI3vOdgeZD7pLE4IuPrOE",
  authDomain: "logins-d615f.firebaseapp.com",
  databaseURL: "https://logins-d615f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "logins-d615f",
  storageBucket: "logins-d615f.appspot.com",
  messagingSenderId: "648022690285",
  appId: "1:648022690285:web:aefad61a2f46e6cf39f05b"
}, "loginApp");
const loginDb = loginApp.database();
(function captureMainQuery(){
  if (!location.pathname.startsWith("/main")) return;

  try{
    const qs = new URLSearchParams(location.search);
    const name  = qs.get("name");
    const email = qs.get("email");
    const photo = qs.get("photo") || "";

    if (email){
      localStorage.setItem("gmailLogin", JSON.stringify({
        name:  decodeURIComponent(name || ""),
        email: decodeURIComponent(email).toLowerCase(),
        photo: decodeURIComponent(photo || "")
      }));
      sessionStorage.setItem("justLoggedIn","1");
      history.replaceState({}, document.title, "/main"); // buang query
    }
  }catch(_){}
})();
(function(){
  const SESS_ROOT = 'singleSessions';
  const HB_MS = 15000;

  function makeToken(){
    if (crypto?.getRandomValues) {
      const a = new Uint32Array(4); crypto.getRandomValues(a);
      return Array.from(a).map(x=>x.toString(16)).join('-');
    }
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  }
  function keyify(s){
    return String(s||'').trim().toLowerCase().replace(/[.#$\[\]/\s]/g,'_');
  }

  let _session = null;

  async function startSingleSession(ownerId, onForcedLogout){
    await stopSingleSession();
    if (!ownerId) return;

    const token   = makeToken();
    const key     = keyify(ownerId);
    const sessRef = loginDb.ref(`${SESS_ROOT}/${key}`); 

    try { await sessRef.onDisconnect().remove(); } catch(_){}

    await sessRef.transaction(cur=>{
      const now = firebase.database.ServerValue.TIMESTAMP;
      if (!cur) {
        return { token, owner:key, createdAt:now, lastSeen:now };
      }
      if (cur.forceLogoutAt) return cur;
      if (cur.token && cur.token !== token) {
        return { ...cur, forceLogoutAt: now };
      }
      return { ...cur, token, lastSeen: now };
    });

    const onValue = sessRef.on('value', snap=>{
      const v = snap.val();
      if (!v) return;
      if (v.forceLogoutAt) return hardLogout('force');
      if (v.token && v.token !== token) return hardLogout('token-changed');
    });

    const hb = setInterval(()=>{
      sessRef.child('lastSeen')
        .set(firebase.database.ServerValue.TIMESTAMP)
        .catch(()=>{});
    }, HB_MS);

    async function hardLogout(){
      try { sessRef.off('value', onValue); } catch(_){}
      try { clearInterval(hb); } catch(_){}
      try { await sessRef.remove(); } catch(_){}
      try { await loginApp.auth().signOut(); } catch(_){}
      if (typeof onForcedLogout === 'function') onForcedLogout();
      else location.reload();
    }

    _session = { sessRef, onValue, hb, hardLogout };
    window.addEventListener('beforeunload', ()=>{
      try { clearInterval(hb); } catch(_){}
      try { sessRef.off('value', onValue); } catch(_){}
    });
  }

  async function stopSingleSession(){
    if (!_session) return;
    const { sessRef, onValue, hb } = _session;
    try { clearInterval(hb); } catch(_){}
    try { sessRef.off('value', onValue); } catch(_){}
    try { await sessRef.remove(); } catch(_){}
    _session = null;
  }

  // helper: tentukan ownerId dari login data (username utk @5g88.local, selain itu email)
  function getSessionOwnerFrom(loginData){
    const email = (loginData?.email||'').toLowerCase();
    if (!email) return null;
    if (email.endsWith('@5g88.local')) return email.split('@')[0]; // username
    return email; // Gmail/Facebook pakai email penuh
  }

  // expose
  window.startSingleSession = startSingleSession;
  window.stopSingleSession  = stopSingleSession;
  window.getSessionOwnerFrom = getSessionOwnerFrom;
})();

(function(){
  // === SETTING MUDAH ===
  const DEFAULT_MINUTES = 10080; // ganti default di sini (contoh: 20)
  const LOGIN_URL = "/login";
  const STORAGE_EXPIRE = "autoLogout.expireAt";
  const STORAGE_MIN = "autoLogout.minutes"; // kalau di-set, override DEFAULT_MINUTES
  const CHANNEL = "autoLogout-5g88";
  const TICK = 5000; // cek tiap 5 detik
  // (opsional) logout absolut walau aktif bergerak (null = mati)
  const ABSOLUTE_MAX_MS = null; // contoh: 8*60*60*1000 (8 jam)

  let bc = null, checkTimer = null, expireAt = null, absoluteExpireAt = null;

  function getMinutes(){
    const v = parseInt(localStorage.getItem(STORAGE_MIN) || "", 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_MINUTES;
  }
  const minutesToMs = (m)=> m*60*1000;
  const now = ()=> Date.now();

  function setExpireFromNow(){
    expireAt = now() + minutesToMs(getMinutes());
    localStorage.setItem(STORAGE_EXPIRE, String(expireAt));
    try { bc && bc.postMessage({t:"reset", expireAt}); } catch {}
  }
  function setAbsoluteExpireFromNow(){
    absoluteExpireAt = ABSOLUTE_MAX_MS ? (now() + ABSOLUTE_MAX_MS) : null;
  }
  function loadExpire(){
    const v = localStorage.getItem(STORAGE_EXPIRE);
    expireAt = v ? Number(v) : null;
  }
  async function doLogout(reason="timeout"){
    try { clearInterval(checkTimer); } catch {}
    try { loginApp?.auth && (await loginApp.auth().signOut()); } catch(_) {}
    try { localStorage.removeItem("gmailLogin"); } catch(_) {}
    try { localStorage.removeItem(STORAGE_EXPIRE); } catch(_) {}
    try { bc && bc.postMessage({t:"logout", reason}); } catch {}
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch(_){}
    window.location.href = LOGIN_URL;
  }
  function shouldLogout(){
    const t = now();
    if (expireAt && t >= expireAt) return true;
    if (absoluteExpireAt && t >= absoluteExpireAt) return true;
    return false;
  }
  function heartbeat(){
    loadExpire();
    if (shouldLogout()) doLogout("timeout");
  }
  function bindActivityReset(){
    const reset = ()=> setExpireFromNow();
    ["mousemove","mousedown","keydown","scroll","touchstart","pointerdown","wheel","focus"]
      .forEach(ev => window.addEventListener(ev, reset, {passive:true}));
    document.addEventListener("visibilitychange", ()=> { if (!document.hidden) reset(); });
    window.addEventListener("focus", reset);
  }
  function setupChannel(){
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (msg)=>{
        const d = msg?.data || {};
        if (d.t === "reset") {
          expireAt = Number(d.expireAt || 0) || expireAt;
          localStorage.setItem(STORAGE_EXPIRE, String(expireAt));
        } else if (d.t === "logout") {
          doLogout("multi-tab");
        }
      };
    } catch { bc = null; }
  }
  function start(){
    setupChannel();
    setExpireFromNow();
    setAbsoluteExpireFromNow();
    bindActivityReset();
    checkTimer = setInterval(heartbeat, TICK);
    heartbeat();
  }
  window.AutoLogout = {
    start,
    reset: setExpireFromNow,
    setMinutes: (m)=> {
      if (typeof m === "number" && m > 0) {
        localStorage.setItem(STORAGE_MIN, String(m));
        setExpireFromNow();
      }
    },
    stop: ()=> { try { clearInterval(checkTimer); } catch {} },

    // 🔍 DEBUG: lihat status timer
    status: ()=> {
      loadExpire();
      const left = expireAt ? Math.max(0, expireAt - now()) : null;
      return {
        minutesConfigured: getMinutes(),
        expireAt,
        msLeft: left,
        secLeft: left !== null ? Math.round(left/1000) : null,
        absoluteExpireAt
      };
    },

    // 🔍 DEBUG: paksa logout (cek kalau redirect jalan)
    forceLogout: ()=> doLogout("manual"),

    // 🔍 DEBUG: nyalakan log
    debugOn: ()=> {
      const log = (...a)=> console.log("[AutoLogout]", ...a);
      const _setExpireFromNow = setExpireFromNow;
      const _heartbeat = heartbeat;

      setExpireFromNow = function(){
        _setExpireFromNow();
        log("reset → expireAt:", new Date(expireAt).toLocaleTimeString());
      };
      heartbeat = function(){
        loadExpire();
        const left = expireAt ? (expireAt - now()) : null;
        log("tick → left(ms):", left);
        _heartbeat();
      };
      log("debug ON");
    }
  };
})();

(() => {
  try {
    const qs = new URLSearchParams(location.search);
    const name  = qs.get("name");
    const email = qs.get("email");
    const photo = qs.get("photo");
    const validEmail = (e)=> /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||"");

    if (email && validEmail(decodeURIComponent(email))) {
      localStorage.setItem("gmailLogin", JSON.stringify({
        name:  decodeURIComponent(name || ""),
        email: decodeURIComponent(email).toLowerCase(),
        photo: decodeURIComponent(photo || "")
      }));
      // tanda baru login supaya tidak ping-pong
      sessionStorage.setItem("justLoggedIn", "1");
      history.replaceState({}, document.title, location.origin + location.pathname);
    }
  } catch (_) {}
})();
// === Helper: cek tipe login & update tombol Change Password ===
function isUsernameLoginNow() {
  try {
    const login = JSON.parse(localStorage.getItem('gmailLogin') || '{}');
    const email = (login?.email || '').toLowerCase();
    return email.endsWith('@5g88.local');
  } catch {
    return false;
  }
}

function updateChangePwVisibility() {
  const btn = document.getElementById('changePwBtn');
  if (!btn) return;
  btn.style.display = isUsernameLoginNow() ? 'flex' : 'none';
}
window.addEventListener('load', () => {
  updateChangePwVisibility();
  window.renderMobileUserBtn && window.renderMobileUserBtn();
});
window.addEventListener('storage', (e)=> {
  if (e.key === 'gmailLogin') {
    updateChangePwVisibility();
    window.renderMobileUserBtn && window.renderMobileUserBtn();
  }
});
let userId = "";
// Notifikasi popup atas
const notifButton = document.getElementById("notifButton");
const notifDot = document.getElementById("notifDot");
const popup = document.getElementById("messagePopup");
const content = document.getElementById("messageContent");
const notifTooltip = document.getElementById("notifTooltip");

document.addEventListener("DOMContentLoaded", () => {
  const savedMessage = localStorage.getItem("latestNotifMessage");
  const savedTimestamp = localStorage.getItem("latestNotifTimestamp");

  const cur = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
  const curEmail = (cur.email || "guest").toLowerCase();
  const seenKey = `seenNotif_${savedTimestamp}_${curEmail}`;

  if (savedMessage && savedTimestamp && notifButton) {
    const alreadySeen = localStorage.getItem(seenKey);
    notifButton.dataset.message = savedMessage;
    notifButton.dataset.timestamp = savedTimestamp;
    if (!alreadySeen && notifDot) notifDot.style.display = "block";
  }
});

// Realtime notifikasi pesan baru dari Firebase
db.ref("notifikasi/pesanTerbaru").on("value", (snapshot) => {
  const data = snapshot.val();
  if (!data || !data.message || !data.timestamp) return;
  showNotification(data.message, data.timestamp);
});

function showNotification(message, timestamp) {
  const cur = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
  const curEmail = (cur.email || "guest").toLowerCase();
  const seenKey = `seenNotif_${timestamp}_${curEmail}`;
  const alreadySeen = localStorage.getItem(seenKey);

  if (!alreadySeen && notifButton) {
    notifButton.dataset.message = message;
    notifButton.dataset.timestamp = timestamp;
    localStorage.setItem("latestNotifMessage", message);
    localStorage.setItem("latestNotifTimestamp", timestamp);
    if (notifDot) notifDot.style.display = "block";
  }
}

if (notifButton) {
  notifButton.addEventListener("click", () => {
    const message = notifButton.dataset.message;
    const timestamp = Number(notifButton.dataset.timestamp);
    if (!message || !timestamp) return;

    if (popup.style.display === "block") {
      popup.style.display = "none";
      return;
    }

    const dateObj = new Date(timestamp);
    const isValidDate = !isNaN(dateObj.getTime());

    content.innerHTML = `
      <div>${message}</div>
      <div style="text-align:right;font-size:12px;color:#aaa;margin-top:10px;">
        ${isValidDate ? `
          ${String(dateObj.getDate()).padStart(2,'0')}/
          ${String(dateObj.getMonth()+1).padStart(2,'0')}/
          ${dateObj.getFullYear()} 
          ${String(dateObj.getHours()).padStart(2,'0')}:
          ${String(dateObj.getMinutes()).padStart(2,'0')}:
          ${String(dateObj.getSeconds()).padStart(2,'0')}
        ` : `Waktu tidak valid`}
      </div>
    `;

    popup.style.display = "block";
    setTimeout(() => {
      const rect = notifButton.getBoundingClientRect();
      popup.style.position = "fixed";
      popup.style.top = `${rect.bottom + 4.1}px`;
      popup.style.left = "auto";
      popup.style.right = `${window.innerWidth - rect.right}px`;
    }, 0);

    if (notifDot) notifDot.style.display = "none";
    const cur = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
    const curEmail = (cur.email || "guest").toLowerCase();
    const seenKey = `seenNotif_${timestamp}_${curEmail}`;
    localStorage.setItem(seenKey, "1");
  });
}

// Klik luar = tutup popup (biarkan seperti punyamu)
document.addEventListener("click", function (event) {
  if (popup && popup.style.display === "block" && !popup.contains(event.target) && !notifButton?.contains(event.target)) {
    popup.style.display = "none";
  }
});
window.addEventListener("blur", () => {
  if (popup && popup.style.display === "block") {
    popup.style.display = "none";
  }
});
// ===== DROPDOWNS (GameLog & Bank Resit) – versi terpadu =====
const gameLogBtn        = document.getElementById("gameLogBtn");
const gameLogDropdown   = document.getElementById("gameLogDropdown");
const bankResitBtn      = document.getElementById("bankResitBtn");
const bankResitDropdown = document.getElementById("bankResitDropdown");
const gameLinksBtn      = document.getElementById("gameLinksBtn");
const gameLinksDropdown = document.getElementById("gameLinksDropdown");

function closeAllDropdowns() {
  if (gameLogDropdown)   gameLogDropdown.style.display   = "none";
  if (bankResitDropdown) bankResitDropdown.style.display = "none";
  if (gameLinksDropdown) gameLinksDropdown.style.display = "none";
}

function toggleDropdown(btnEl, ddEl) {
  if (!btnEl || !ddEl) return;
  const rect = btnEl.getBoundingClientRect();
  const willOpen = ddEl.style.display !== "block";

  // Tutup semua sebelum buka salah satu
  closeAllDropdowns();

  if (willOpen) {
    ddEl.style.left = `${rect.left}px`;
    ddEl.style.top  = `${rect.bottom + 6}px`;
    ddEl.style.display = "block";
  }
}

// Klik tombol -> toggle & tutup yang lain otomatis
gameLogBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown(gameLogBtn, gameLogDropdown);
});

bankResitBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown(bankResitBtn, bankResitDropdown);
});
  
gameLinksBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown(gameLinksBtn, gameLinksDropdown);
});

// Klik di luar -> tutup semua dropdown
document.addEventListener("click", () => closeAllDropdowns());

const pageFrame = document.getElementById("pageFrame");
if (pageFrame) {
  pageFrame.addEventListener("load", () => {
    try {
      pageFrame.contentWindow.document.addEventListener("click", closeAllDropdowns);
    } catch (_) {}

    const origin = getChildOriginFromSrc(pageFrame.src);
    if (origin) {
      sendLoginToIframeReliable(pageFrame, 6, 200, origin);
      setTimeout(() => sendLoginToIframeReliable(pageFrame, 6, 250, origin), 800);
    }
  });
}
// Blur/ESC -> tutup semuanya
window.addEventListener("blur", closeAllDropdowns);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllDropdowns(); });
function closeMessage() {
  const popup = document.getElementById("messagePopup");
  if (popup) popup.style.display = "none";
}
const tabBar = document.getElementById("tabBar");
const menuIcon = document.getElementById("menuIcon");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const container = document.getElementById("mainContainer");

if (tabBar) {
  tabBar.style.display = "flex";
  tabBar.style.alignItems = "center";
  tabBar.style.padding = "10px 2px";
  tabBar.style.background = "#000";
}


menuIcon.addEventListener("click", () => {
  if (sidebar.classList.contains("active")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});
overlay.addEventListener("click", closeSidebar);
function openSidebar() {
  sidebar.classList.add("active");
  overlay.classList.add("active");
  container.classList.add("shrink");
  document.querySelector(".floating-logo").classList.add("shrink");
  document.querySelector('.header').classList.add('shrink');
  document.getElementById("tabBar").classList.add('shrink');
  document.getElementById("menuIcon").classList.add("active-menu-icon");
}

function closeSidebar() {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
  container.classList.remove("shrink");
  document.querySelector(".floating-logo").classList.remove("shrink");
  document.querySelector('.header').classList.remove('shrink');
  document.getElementById("tabBar").classList.remove('shrink');
  document.getElementById("menuIcon").classList.remove("active-menu-icon");
}

document.addEventListener("click", (e) => {
  const isSidebar = e.target.closest("#sidebar");
  const isMenuIcon = e.target.closest("#menuIcon");

  if (!isSidebar && !isMenuIcon && sidebar.classList.contains("active")) {
    closeSidebar();
  }
});
function saveTabs(tabs) {
  localStorage.setItem("openTabs", JSON.stringify(tabs));
}
function getTabs() {
  return JSON.parse(localStorage.getItem("openTabs")) || [];
}
const emptyState = document.getElementById('emptyState');
function updateEmptyState(){
  if (!emptyState) return;
  const tabs = getTabs();
  if (tabs.length === 0) emptyState.classList.remove('hidden');
  else emptyState.classList.add('hidden');
}
function normUrl(u){
  try{
    const x = new URL(String(u||""), location.href);
    x.hash = ""; // buang hash supaya sama
    return x.href.replace(/\/+$/, ""); // buang trailing slash
  }catch(e){
    return String(u||"").trim().replace(/\/+$/, "");
  }
}
function setActiveTabUrl(url){
  if(!url) return;
  localStorage.setItem("activeTabUrl", normUrl(url));
}

function applyActiveTabFromStorage(){
  const activeUrl = normUrl(localStorage.getItem("activeTabUrl") || "");
  document.querySelectorAll(".tab").forEach(el=>{
    const u = normUrl(el.dataset.url || "");
    el.classList.toggle("active-tab", u === activeUrl);
  });
}
function addTab(label, url, opt={}) {
  const L = String(label || "").trim().toUpperCase();
  const group = String(opt?.group || "none").toLowerCase();

  if (typeof isTabAllowed === "function" && !isTabAllowed(L)) return;

const existingTabs = getTabs();
const newUrl = normUrl(url);

// cari ikut label
const idx = existingTabs.findIndex(tab =>
  String(tab.label||"").trim().toUpperCase() === L
);

if (idx === -1) {
  existingTabs.push({ label: L, url: newUrl, group });
} else {
  // ✅ kalau tab dah ada, update url supaya konsisten
  existingTabs[idx].url = newUrl;
  existingTabs[idx].group = group;
}
saveTabs(existingTabs);

loadPage(newUrl);
renderTabs();
  updateGameLogCheckmarks();
  updateBankResitCheckmarks();
  updateGameLinksCheckmarks();
  updateEmptyState();

  setHeaderActiveByGroup(group, L);

  // LiveChat / Link Download / Item Collection kekal label
  const liveBtn = document.getElementById("liveChatBtn");
  const linkBtn = document.getElementById("linkDownloadBtn");
  const itemBtn = document.getElementById("itemBtn");
  const liveDot = document.getElementById("livechatDot");

  if (liveBtn) {
    if (L === "LIVE CHAT") {
      liveBtn.classList.add("active-livechat");
      if (liveDot) liveDot.style.display = "none";
      markLivechatAsRead();
    } else liveBtn.classList.remove("active-livechat");
  }

  linkBtn?.classList.toggle("active-linkdownload", L === "LINK DOWNLOAD");
  itemBtn?.classList.toggle("active-itemBtn", L === "ITEM COLLECTION");
}
function setHeaderActiveByGroup(group, labelUpper){
  const gameLogBtnEl = document.getElementById("gameLogBtn");
  const bankBtnEl    = document.getElementById("bankResitBtn");
  const listBtnEl    = document.getElementById("gameLinksBtn");

  gameLogBtnEl?.classList.remove("active-gamelog");
  bankBtnEl?.classList.remove("active-gamelog");
  listBtnEl?.classList.remove("active-gamelog");

  if(group === "gamelog") gameLogBtnEl?.classList.add("active-gamelog");
  if(group === "bank")    bankBtnEl?.classList.add("active-gamelog");
  if(group === "list")    listBtnEl?.classList.add("active-gamelog");

  // fallback lama utk tab lama yang tak ada group
  if(group === "none"){
    const gameLogLabels   = ["MEGA888", "PUSSY888", "918KISS", "SCR888H5","EVO888"];
    const bankResitLabels = ["MAYBANK","CIMB BANK","BANK ISLAM","RHB BANK","MAYBANK2U"];
    const gameLinksLabels = ["FIND GAME","TIPS GAME","LOGO GAME"];
    if (gameLogLabels.includes(labelUpper))   gameLogBtnEl?.classList.add("active-gamelog");
    if (bankResitLabels.includes(labelUpper)) bankBtnEl?.classList.add("active-gamelog");
    if (gameLinksLabels.includes(labelUpper)) listBtnEl?.classList.add("active-gamelog");
  }
}
// === Kirim login ke iframe secara andal dgn retries + delay ===
function getLoginPayload() {
  const u = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
  if (!u?.email) return null;
  return {
    type: "user-login",
    user: { name: u.name || "", email: u.email, photo: u.photo || "" }
  };
}
function getChildOriginFromSrc(src){
  try {
    const u = new URL(src);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
  } catch(_) {}
  return null; // << jangan fallback ke domain lain
}
function sendLoginToIframeReliable(iframe, tries=10, gap=250, forceOrigin=null){
  if (!iframe || !iframe.contentWindow) return;
  const payload = getLoginPayload();
  if (!payload) return;

  if (iframe._loginTicker) clearInterval(iframe._loginTicker);
  let count = 0;

  iframe._loginTicker = setInterval(() => {
    if (count++ >= tries) { clearInterval(iframe._loginTicker); iframe._loginTicker=null; return; }
    const origin = forceOrigin || getChildOriginFromSrc(iframe.src);
    if (!origin) return;
    try { iframe.contentWindow.postMessage(payload, origin); } catch(_) {}
  }, gap);
}

// 🔁 Jalankan saat tab LiveChat diklik — pakai fungsi RELIABLE
const liveChatBtn = document.getElementById("liveChatBtn");
if (liveChatBtn) {
  liveChatBtn.addEventListener("click", () => {
    setTimeout(() => {
      const frame = document.getElementById("pageFrame");
      if (frame) sendLoginToIframeReliable(frame, 8, 200);
    }, 250);
  });
}
function closeTab(label) {
  let tabs = getTabs().filter(tab => tab.label !== label);
  saveTabs(tabs);
  renderTabs();
  updateGameLogCheckmarks();
  updateBankResitCheckmarks();
  updateGameLinksCheckmarks();
  updateEmptyState();

  const gameLogBtn = document.getElementById("gameLogBtn");
  const liveBtn = document.getElementById("liveChatBtn");
  const linkBtn = document.getElementById("linkDownloadBtn");
  const bankResitBtnEl = document.getElementById("bankResitBtn");
  const gameLinksBtnEl = document.getElementById("gameLinksBtn");
  const itemBtn = document.getElementById("itemBtn");

  if (tabs.length > 0) {
    const lastTab = tabs[tabs.length - 1];
    loadPage(lastTab.url);

    // Set status aktif tombol sesuai tab terakhir
    const gameLogLabels = ["MEGA888", "PUSSY888", "918KISS", "SCR888H5","EVO888"];
    const bankResitLabels = ["MAYBANK", "CIMB BANK","BANK ISLAM","RHB BANK","MAYBANK2U"];
    const gameLinksLabels = ["FIND GAME","TIPS GAME","LOGO GAME"];
    
    gameLinksBtnEl?.classList.toggle("active-gamelog", gameLinksLabels.includes(lastTab.label));
    gameLogBtn?.classList.toggle("active-gamelog", gameLogLabels.includes(lastTab.label));
    bankResitBtnEl?.classList.toggle("active-gamelog", bankResitLabels.includes(lastTab.label));
    liveBtn?.classList.toggle("active-livechat", lastTab.label === "LIVE CHAT");
    linkBtn?.classList.toggle("active-linkdownload", lastTab.label === "LINK DOWNLOAD");
    itemBtn?.classList.toggle("active-itemBtn", lastTab.label === "ITEM COLLECTION");
  } else {
    // Tidak ada tab tersisa → matikan semua status aktif
    pageFrame.src = "";
    gameLogBtn?.classList.remove("active-gamelog");
    bankResitBtnEl?.classList.remove("active-gamelog");
    liveBtn?.classList.remove("active-livechat");
    linkBtn?.classList.remove("active-linkdownload");
    itemBtn?.classList.remove("active-itemBtn");
    gameLinksBtnEl?.classList.remove("active-gamelog");
  }
}
 
function renderTabs() {
  tabBar.innerHTML = "";
  const tabs = getTabs();

  tabs.forEach((tab, index) => {
    const tabElement = document.createElement("div");
    tabElement.className = "tab";
    tabElement.dataset.index = index;
    tabElement.dataset.label = tab.label;
    tabElement.dataset.url = normUrl(tab.url);

    // Style
    tabElement.style.padding = "6.5px 16px";
    tabElement.style.marginRight = "0px";
    tabElement.style.borderRadius = "8px 8px 0 0";
    tabElement.style.display = "inline-flex";
    tabElement.style.alignItems = "center";
    tabElement.style.fontSize = "14px";
    tabElement.style.userSelect = "none";
    tabElement.style.cursor = "pointer";

    // Klik efek
    tabElement.addEventListener("mousedown", () => {
      tabElement.style.filter = "brightness(0.7)";
    });
    tabElement.addEventListener("mouseup", () => {
      tabElement.style.filter = "none";
    });
    tabElement.addEventListener("mouseleave", () => {
      tabElement.style.filter = "none";
    });

    // Klik tab → buka page
    tabElement.onclick = () => {
    const u = normUrl(tab.url);
    setActiveTabUrl(u);
    loadPage(u);

      const gameLogBtn = document.getElementById("gameLogBtn");
      const liveBtn = document.getElementById("liveChatBtn");
      const linkBtn = document.getElementById("linkDownloadBtn");
      const bankResitBtnEl = document.getElementById("bankResitBtn");
      const gameLinksBtnEl = document.getElementById("gameLinksBtn");
      const itemBtn = document.getElementById("itemBtn");

      liveBtn?.classList.toggle("active-livechat", tab.label === "LIVE CHAT");
      linkBtn?.classList.toggle("active-linkdownload", tab.label === "LINK DOWNLOAD");
      itemBtn?.classList.toggle("active-itemBtn", tab.label === "ITEM COLLECTION");

      if (gameLogBtn) {
        const gameLogLabels = ["MEGA888", "PUSSY888", "918KISS", "SCR888H5", "EVO888"];
        gameLogBtn.classList.toggle("active-gamelog", gameLogLabels.includes(tab.label));
      }
      if (bankResitBtnEl) {
        const bankResitLabels = ["MAYBANK", "CIMB BANK", "BANK ISLAM", "RHB BANK", "MAYBANK2U"];
        bankResitBtnEl.classList.toggle("active-gamelog", bankResitLabels.includes(tab.label));
      }
      if (gameLinksBtnEl) {
        const gameLinksLabels = ["FIND GAME", "TIPS GAME", "LOGO GAME"];
        gameLinksBtnEl.classList.toggle("active-gamelog", gameLinksLabels.includes(tab.label));
      }

      applyActiveTabFromStorage(); // ✅ update highlight
    };

    const title = document.createElement("span");
    title.textContent = tab.label;
    title.style.pointerEvents = "none";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-tab";
    closeBtn.textContent = "×";
    closeBtn.style.marginLeft = "4px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.color = "red";
    closeBtn.style.transition = "all 0.2s ease";
    closeBtn.style.padding = "0";
    closeBtn.style.pointerEvents = "auto";

    closeBtn.onmouseover = () => closeBtn.style.color = "#ff1a1a";
    closeBtn.onmouseout  = () => closeBtn.style.color = "red";

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.label);
      applyActiveTabFromStorage(); // ✅ bila close tab, refresh highlight
    };

    tabElement.appendChild(title);
    tabElement.appendChild(closeBtn);
    tabBar.appendChild(tabElement);
  });

  // ✅ apply active tab lepas render siap
  applyActiveTabFromStorage();

  initSortableTabs();
  updateGameLogCheckmarks();
  updateBankResitCheckmarks();
  updateGameLinksCheckmarks();
  applyRenderedTabVisibility();
}
// === APPLY VISIBILITY KE SEMUA TAB YANG SEDANG DIRENDER ===
function applyRenderedTabVisibility() {
  const tabsDom = document.querySelectorAll(".tab");
  tabsDom.forEach(tabEl => {
    const label = (tabEl.dataset.label || "").trim().toUpperCase();
    if (!label) return;
    tabEl.style.display = isFeatureHidden(label) ? "none" : "inline-flex";
  });
}
function initSortableTabs() {
  if (!window.Sortable || !tabBar) return;

  // Destroy instance sebelumnya jika ada
  if (tabBar._sortable) {
    tabBar._sortable.destroy();
  }

  // Buat baru & simpan ke properti _sortable
  tabBar._sortable = Sortable.create(tabBar, {
    animation: 200,
    ghostClass: "dragging",
    onEnd: function (evt) {
      const tabs = getTabs();
      const [movedTab] = tabs.splice(evt.oldIndex, 1);
      tabs.splice(evt.newIndex, 0, movedTab);
      saveTabs(tabs);
      renderTabs(); // akan auto-panggil initSortableTabs()
    }
  });
}
function loadPage(url) {
  if (emptyState) emptyState.classList.add('hidden');
  const iframeLoader = document.getElementById("iframeLoader");
  const frame = document.getElementById("pageFrame");
  if (!frame) return;

  // Tunjuk loader
  iframeLoader.style.display = "flex";

  // Fungsi helper: pastikan hide hanya sekali
  let loaderDone = false;
  function hideLoader() {
    if (loaderDone) return;
    loaderDone = true;
    iframeLoader.style.display = "none";
    frame.onload = null;
  }

  // 1) Bila iframe betul-betul siap → hide
  frame.onload = hideLoader;

  // 2) Fallback: maksimum tunggu 1.5s saja
  setTimeout(hideLoader, 1500);  // boleh ubah jadi 1000 / 2000 ms ikut rasa

  // Load URL
frame.src = url;
setActiveTabUrl(url);          // ✅ simpan active url
closeSidebar();
applyActiveTabFromStorage(); 
}

  // Ceklis GameLog Dropdown
function updateGameLogCheckmarks() {
  const tabs = getTabs();
  const labelsOpen = tabs.map(tab => tab.label);
  const dropdownLinks = document.querySelectorAll('#gameLogDropdown a');

  dropdownLinks.forEach(link => {
    const label = link.getAttribute("data-label");
    const icon = link.querySelector(".check-icon");
     if (labelsOpen.includes(label)) {
     link.classList.add("tab-open");
     icon.style.display = "inline";
     } else {
     link.classList.remove("tab-open");
     icon.style.display = "none";
    }
  });
}
function updateBankResitCheckmarks() {
  const tabs = getTabs();
  const labelsOpen = tabs.map(tab => tab.label);
  const dropdownLinks = document.querySelectorAll('#bankResitDropdown a');

  dropdownLinks.forEach(link => {
    const label = link.getAttribute("data-label");
    const icon = link.querySelector(".check-icon");
    if (labelsOpen.includes(label)) {
      link.classList.add("tab-open");
      if (icon) icon.style.display = "inline";
    } else {
      link.classList.remove("tab-open");
      if (icon) icon.style.display = "none";
    }
  });
}
function updateGameLinksCheckmarks() {
  const tabs = getTabs();
  const labelsOpen = tabs.map(tab => tab.label);
  const dropdownLinks = document.querySelectorAll('#gameLinksDropdown a');

  dropdownLinks.forEach(link => {
    const label = link.getAttribute("data-label");
    const icon = link.querySelector(".check-icon");
    if (labelsOpen.includes(label)) {
      link.classList.add("tab-open");
      if (icon) icon.style.display = "inline";
    } else {
      link.classList.remove("tab-open");
      if (icon) icon.style.display = "none";
    }
  });
}

window.addEventListener("load", () => {
  renderTabs();
  applyTabVisibility();  // <-- opsional, double check awal
  const tabs = getTabs();
  updateEmptyState();
  updateGameLogCheckmarks();
  updateGameLinksCheckmarks();
  const activeUrl = localStorage.getItem("activeTabUrl");
  const match = tabs.find(tab => tab.url === activeUrl);

  const liveBtn = document.getElementById("liveChatBtn");
  const linkBtn = document.getElementById("linkDownloadBtn");
  const gameLogBtn = document.getElementById("gameLogBtn");
  const bankResitBtnEl = document.getElementById("bankResitBtn");
  const gameLinksBtnEl = document.getElementById("gameLinksBtn");
  const itemBtn = document.getElementById("itemBtn");

  if (itemBtn) itemBtn.classList.remove("active-itemBtn");
  if (liveBtn) liveBtn.classList.remove("active-livechat");
  if (linkBtn) linkBtn.classList.remove("active-linkdownload");
  if (gameLogBtn) gameLogBtn.classList.remove("active-gamelog");
  if (bankResitBtnEl) bankResitBtnEl.classList.remove("active-gamelog");
  if (gameLinksBtnEl) gameLinksBtnEl.classList.remove("active-gamelog");

  if (match) {
    loadPage(match.url);
    updateGameLogCheckmarks();
    updateBankResitCheckmarks();
    updateGameLinksCheckmarks();
    updateEmptyState();
    
    if (match.label === "LIVE CHAT") {
      liveBtn.classList.add("active-livechat");
    }

    if (match.label === "LINK DOWNLOAD") {
      linkBtn.classList.add("active-linkdownload");
    }
    if (match.label === "ITEM COLLECTION") {
      itemBtn.classList.add("active-itemBtn");
    }
    const bankResitLabels = ["MAYBANK", "CIMB BANK","BANK ISLAM","RHB BANK","MAYBANK2U"];
    if (bankResitBtnEl && match && bankResitLabels.includes(match.label)) {
    bankResitBtnEl.classList.add("active-gamelog");
    }
    const gameLinksLabels = ["FIND GAME","TIPS GAME","LOGO GAME"];
    if (gameLinksBtnEl && match && gameLinksLabels.includes(match.label)) {
    gameLinksBtnEl.classList.add("active-gamelog");
    }
    const gameLogLabels = ["MEGA888", "PUSSY888", "918KISS", "SCR888H5"];
    if (gameLogBtn && gameLogLabels.includes(match.label)) {
      gameLogBtn.classList.add("active-gamelog");
    }
    } else if (tabs.length > 0) {
    loadPage(tabs[tabs.length - 1].url);
   }
});

const encodedAdmins = ["YWRtaW4xQGdtYWlsLmNvbQ==","NWc4OC5vZmZpY2FsQGdtYWlsLmNvbQ=="];
const _0xadmins = encodedAdmins.map(e => atob(e));
const allowedAdmins = [..._0xadmins, "admin@example.com"];

function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function cleanUrl() {
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkLogin() {
  try{
    const gl = JSON.parse(localStorage.getItem("gmailLogin") || "null");
    if (gl?.email) return true;
  }catch(_){}
  if (sessionStorage.getItem("justLoggedIn") === "1") {
    sessionStorage.removeItem("justLoggedIn");
    return true;
  }

  const returnTo = encodeURIComponent(location.href);
  location.replace(`/login?redirect=${returnTo}`);
  return false;
}

function initLivechatNotifListener(userIdParam) {
  const login = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
  if (!login?.email || !userIdParam) return;

  blurphpDb.ref("chats/" + userIdParam).on("value", (snapshot) => {
    let hasUnread = false;
    snapshot.forEach((child) => {
      const msg = child.val();
      if (msg.from === "admin" && msg.seenByUser !== true) {
        hasUnread = true;
      }
    });
    const livechatDot = document.getElementById("livechatDot");
    if (livechatDot) livechatDot.style.display = hasUnread ? "inline" : "none";
  });
}

function markLivechatAsRead() {
  const cur = JSON.parse(localStorage.getItem("gmailLogin") || "{}");
  if (!cur?.email || !userId) return;

  const chatRef = blurphpDb.ref("chats/" + userId);

  chatRef.once("value", (snapshot) => {
    if (!snapshot.exists()) return;

    const updates = {};
    snapshot.forEach((child) => {
      const v = child.val();
      if (v?.from === "admin" && v?.seenByUser !== true) {
        updates[child.key + "/seenByUser"] = true;
        updates[child.key + "/readAt"] = Date.now(); // optional
      }
    });

    if (Object.keys(updates).length) {
      chatRef.update(updates).catch(()=>{});
    }
  });
}
// === GLOBAL CUSTOM TABS (BLURPHP) ==========================
let uiCustomTabs = {}; // node: settings/uiCustomTabs

function normPlaceStrict(p){
  p = String(p||"").toLowerCase().trim();
  return (p === "header") ? "header" : "sidebar";
}
function normGroupStrict(g){
  g = String(g||"").toLowerCase().trim();
  if (g.includes("gamelog")) return "gamelog";
  if (g.includes("bank"))    return "bank";
  if (g.includes("list"))    return "list";
  return "none";
}

function getContainers(){
  return {
    sidebar: document.getElementById("sidebar"),
    sidebarCustomWrap: document.getElementById("customSidebarTabs"), // ✅ tambah
    gameLogDropdown: document.getElementById("gameLogDropdown"),
    bankResitDropdown: document.getElementById("bankResitDropdown"),
    gameLinksDropdown: document.getElementById("gameLinksDropdown")
  };
}

function clearCustomRendered(){
  document.querySelectorAll("[data-customtab='1']").forEach(el => el.remove());
  const wrap = document.getElementById("customSidebarTabs");
  if (wrap) wrap.innerHTML = "";
}

const SIDEBAR_ICON = "https://i.imgur.com/WDjH3BZ.png"; // sama macam menu lain

function buildLink(label, url, kind="dropdown", meta={}){ 
  const a = document.createElement("a");
  a.href = "#";
  a.setAttribute("data-customtab","1");
  a.setAttribute("data-feature", label);
  a.setAttribute("data-label", label);
  if(meta?.group) a.setAttribute("data-group", meta.group);

  a.addEventListener("click", (e)=>{
    e.preventDefault();
    addTab(label, url, { group: meta?.group || "none" });
    try { closeSidebar(); } catch(_){}
  });

  if(kind === "sidebar"){
    a.innerHTML = `<img src="${SIDEBAR_ICON}" alt="icon" class="menu-img"> ${label}`;
    return a;
  }

  a.innerHTML = `
    ${label}
    <svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" style="display:none;">
      <path fill="currentColor" d="M9 22l-10-10.598 2.798-2.859 7.149 7.473 13.144-14.016 2.909 2.806z"/>
    </svg>
  `;
  return a;
}

function renderCustomTabs(){
  const c = getContainers();
  if (!c.sidebar) return;

  clearCustomRendered();

  // ✅ simpan id sekali
  const list = Object.entries(uiCustomTabs || {})
    .map(([id, item]) => ({ id, ...(item||{}) }))
    .filter(x => x && x.enabled !== false);

  list.forEach(item => {
    const rawLabel = item.label || item.name || item.tabName || item.title || item.text;
    const rawUrl   = item.url || item.href || item.tabUrl || item.link;

    const label = String(rawLabel || "").trim().toUpperCase();
    const url   = String(rawUrl || "").trim();
    if (!label || !url) return;

    if (typeof isFeatureHidden === "function" && isFeatureHidden(label)) return;

    const place = normPlaceStrict(item.place);
    const group = normGroupStrict(item.group);

    if (place === "header") {
      if (group === "gamelog" && c.gameLogDropdown) {
        c.gameLogDropdown.appendChild(buildLink(label, url, "dropdown", { group:"gamelog" }));
        return;
      }
      if (group === "bank" && c.bankResitDropdown) {
        c.bankResitDropdown.appendChild(buildLink(label, url, "dropdown", { group:"bank" }));
        return;
      }
      if (group === "list" && c.gameLinksDropdown) {
        c.gameLinksDropdown.appendChild(buildLink(label, url, "dropdown", { group:"list" }));
        return;
      }
    }

    // default sidebar
    const linkSidebar = buildLink(label, url, "sidebar", { group:"none" });
    if (c.sidebarCustomWrap) c.sidebarCustomWrap.appendChild(linkSidebar);
    else c.sidebar.appendChild(linkSidebar);
  });

  updateGameLogCheckmarks();
  updateBankResitCheckmarks();
  updateGameLinksCheckmarks();
  applySidebarVisibility();
}
// === GLOBAL UI VISIBILITY (BLURPHP) ==========================
let uiVisibility = {};  // diisi dari settings/uiVisibility

// Helper: cek apakah feature di-hide di server
function isFeatureHidden(label){
  return !!(uiVisibility && uiVisibility[label]);
}

// Map nama feature → ID tombol header di homepage
const HEADER_FEATURE_MAP = {
  "LIVE CHAT":      "liveChatBtn",
  "LINK DOWNLOAD":  "linkDownloadBtn",
  "GAMELOG":        "gameLogBtn",
  "BANK RECEIPT":   "bankResitBtn",
  "LIST TYPE":      "gameLinksBtn",
  "ITEM COLLECTION":"itemBtn",
  // contoh tambahan:
  // "CHANGE PASSWORD": "changePwBtn",
};

// Map untuk item sidebar (pakai data-feature di HTML)
const SIDEBAR_FEATURE_SELECTOR = '[data-feature]';

// Sembunyikan / tampilkan tombol header
function applyHeaderVisibility(){
  Object.entries(HEADER_FEATURE_MAP).forEach(([label, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isFeatureHidden(label) ? "none" : "";
  });
}

// Sembunyikan / tampilkan item sidebar
function applySidebarVisibility() {
  const links = document.querySelectorAll('#sidebar a');
  if (!links.length) return;

  links.forEach(link => {
    const attrLabel = (link.getAttribute('data-feature') || '').trim();
    const textLabel = (link.textContent || '').trim().toUpperCase();
    const label = attrLabel || textLabel;
    const hide = isFeatureHidden(label);
    link.style.display = hide ? 'none' : '';
  });
}
function applyDropdownVisibility(){
  const sels = [
    "#gameLogDropdown a",
    "#bankResitDropdown a",
    "#gameLinksDropdown a"
  ];

  sels.forEach(sel=>{
    document.querySelectorAll(sel).forEach(a=>{
      const attr = (a.getAttribute("data-feature") || a.getAttribute("data-label") || "").trim();
      const txt  = (a.textContent || "").trim().toUpperCase();
      const label = (attr || txt).toUpperCase();
      a.style.display = isFeatureHidden(label) ? "none" : "";
    });
  });

  // kalau tengah open dropdown, tutup supaya nampak effect terus
  closeAllDropdowns();
}
// Filter tab yang sudah terbuka di tabBar
function applyTabVisibility(){
  const tabs = getTabs();         // fungsi ini sudah ada di script kamu
  const filtered = tabs.filter(t => 
  !isFeatureHidden(String(t.label || "").trim().toUpperCase()));
  if (filtered.length !== tabs.length){
    saveTabs(filtered);           // sudah ada juga
    renderTabs();                 // sudah ada
    updateGameLogCheckmarks();   // sudah ada
    updateBankResitCheckmarks(); // sudah ada
    updateGameLinksCheckmarks(); // sudah ada
    updateEmptyState();          // sudah ada
  }
}

// Optional: blokir buka tab untuk feature yang di-hide
// PANGGIL ini di awal fungsi addTab()
function isTabAllowed(label){
  return !isFeatureHidden(label);
}
// ⬇️ GANTI seluruh blok ini
document.addEventListener("DOMContentLoaded", async () => {
  const forceLogout = sessionStorage.getItem("forceLogout");
  if (forceLogout === "1") {
    sessionStorage.removeItem("forceLogout");
    cleanUrl();
  }

  updateChangePwVisibility();
  if (!checkLogin()) return;

  const loginDataRaw = localStorage.getItem("gmailLogin");
  let sessionData = null;

  try {
    sessionData = JSON.parse(loginDataRaw);
  } catch (e) {
    console.error("❌ Failed to parse login data:", e);
    localStorage.removeItem("gmailLogin");
    window.location.href = "https://5g88-home.vercel.app/";
    return;
  }

  if (!sessionData || !sessionData.email) {
    window.location.href = "https://5g88-home.vercel.app/";
    return;
  }

  // ✅ 1) RTDB rules `auth != null` → login anon di project loginApp
  async function ensureAnonAuth(maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const auth = loginApp.auth();
        if (auth.currentUser) return true;
        await auth.signInAnonymously();
        return true;
      } catch (err) {
        console.warn(`[AnonAuth] Percobaan ${i+1} gagal:`, err?.message || err);
        await new Promise(r => setTimeout(r, 400));
      }
    }
    return false;
  }

  const authed = await ensureAnonAuth();
  if (!authed) {
    console.warn("⚠️ Anonymous auth gagal. Single-session tidak bisa menulis ke RTDB.");
    // lanjutkan UI tanpa enforcement
  }

  // ✅ 2) Auto-logout inactivity
  window.AutoLogout && window.AutoLogout.start();

  // ✅ 3) Single-Session
  try {
    const ownerId = window.getSessionOwnerFrom(sessionData);
    await window.startSingleSession(ownerId, () => {
      try { localStorage.removeItem('gmailLogin'); } catch (_){}
      try { sessionStorage.setItem('forceLogout','1'); } catch (_){}
      try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch (_){}
      window.location.href = "/login?dup=1";
    });
  } catch (e) {
    console.warn('[single-session] gagal start:', e);
  }

  // ======= SEMUA YANG DI BAWAH INI BUTUH sessionData =======
  let userId = (sessionData.email || '').toLowerCase().replace(/\./g, '_');
  let loginAuth = null;
  try { loginAuth = loginApp.auth(); } catch (_) {}

  // Admin override (paksa logout user tertentu)
  const myOverrideRef = loginDb.ref('logins/admin_override/' + userId);
  let lastAt = 0;
  myOverrideRef.on('value', async (snap) => {
    const v = snap.val();
    if (!v || v.forceLogout !== true) return;
    if (v.at && v.at <= lastAt) return;
    lastAt = v.at || Date.now();

    try { loginApp.auth && (await loginApp.auth().signOut()); } catch (_){}
    localStorage.removeItem('gmailLogin');
    sessionStorage.setItem('forceLogout', '1');
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch (_){}

    myOverrideRef.remove().catch(()=>{});
    window.location.href = "/login?blocked=1";
  });

  // User diblok
  loginDb.ref(`logins/blocked_users/${userId}`).on("value", async (s) => {
    if (s.val() === true) {
      try { if (loginAuth) await loginAuth.signOut(); } catch(_) {}
      localStorage.removeItem("gmailLogin");
      try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch(_){}
      window.location.href = "/login?blocked=1";
    }
  });

  // Simpan info user di blurphp + status online
  const sanitizedEmail = sessionData.email.toLowerCase().replace(/\./g, '_');
  blurphpDb.ref('users/' + sanitizedEmail).update({
    name: sessionData.name,
    email: sessionData.email,
    photoURL: sessionData.photo || '',
    lastLoginTime: Date.now()
  });

  const connectedRef = blurphpDb.ref(".info/connected");
  const onlineRef = blurphpDb.ref("users/" + sanitizedEmail + "/online");
  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      onlineRef.set(true);
      onlineRef.onDisconnect().set(false);
    }
  });

  window.addEventListener("beforeunload", () => {
    try { blurphpDb.ref("users/" + sanitizedEmail + "/online").set(false); } catch (_){}
    try { blurphpDb.ref("chats/" + userId).off(); } catch (_){}
    try { loginDb.ref("logins/admin_override/" + userId).off(); } catch (_){}
  });

  // Livechat: bunyi + dot notifikasi
  let lastNotifTime = 0;
  let userHasInteracted = false;
  document.body.addEventListener("click", () => { userHasInteracted = true; });

const chatsRef = blurphpDb.ref("chats/" + userId);
chatsRef.off("child_added");

chatsRef.on("child_added", (snapshot) => {
  const msg = snapshot.val();
  if (!msg || msg.from !== "admin") return;

  // ✅ kalau dah dibaca, jangan nyalakan dot
  if (msg.seenByUser === true) return;

  const livechatDot = document.getElementById("livechatDot");
  const notifSound  = document.getElementById("notifSound");

  const timestamp = msg.time || msg.atMs || Date.now();

  if (timestamp > lastNotifTime) {
    lastNotifTime = timestamp;

    if (livechatDot) livechatDot.style.display = "inline";

    if (notifSound && userHasInteracted && typeof notifSound.play === "function") {
      notifSound.currentTime = 0;
      notifSound.play().catch(() => {});
    }
  }
});

  // indikator unread
  initLivechatNotifListener(userId);

  // UI header nama/email
  const userNameText = document.getElementById("userNameText");
  const dropdownContent = document.getElementById("dropdownContent");
  const userEmailElem = document.getElementById("userEmail");
  const dropdownWrapper = document.querySelector(".user-dropdown");
  const userButton = document.getElementById("userName");

  if (userNameText && dropdownContent && dropdownWrapper && userButton) {
    const loginData = JSON.parse(localStorage.getItem("gmailLogin"));
    const nameParts = (loginData.name || '').trim().split(" ");
    const displayName = (nameParts.length >= 2 && nameParts[0].toLowerCase() === nameParts[1].toLowerCase())
      ? nameParts[0] : (loginData.name || '');
    userNameText.textContent = displayName;
    if (userEmailElem) userEmailElem.textContent = loginData.email;
    window.renderMobileUserBtn && window.renderMobileUserBtn();
    updateChangePwVisibility();

    dropdownWrapper.addEventListener("mouseenter", () => {
      dropdownContent.style.display = "block";
    });
    dropdownWrapper.addEventListener("mouseleave", () => {
      if (dropdownWrapper.classList.contains("force-open")) return;
      dropdownContent.style.display = "none";
      userButton.classList.remove("active-user-button");
    });
    userButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdownWrapper.classList.toggle("force-open");
      dropdownContent.style.display = isOpen ? "block" : "none";
      userButton.classList.toggle("active-user-button", isOpen);
    });
    document.addEventListener("click", (e) => {
      if (!dropdownWrapper.contains(e.target)) {
        dropdownContent.style.display = "none";
        dropdownWrapper.classList.remove("force-open");
        userButton.classList.remove("active-user-button");
      }
    });
  }
  // === BACA GLOBAL UI VISIBILITY DARI BLURPHP (SATU NODE SAJA) ===
blurphpDb.ref('settings/uiVisibility').on('value', (snap) => {
  uiVisibility = snap.val() || {};
  applyHeaderVisibility();
  applySidebarVisibility();
  applyDropdownVisibility();        // ✅ NEW
  applyTabVisibility();             // ✅ filter openTabs (yang existing)
  applyRenderedTabVisibility();     // ✅ NEW (hide tab DOM yang sedang nampak)

  // ✅ refresh checkmarks terus (kalau dropdown tengah buka)
  updateGameLogCheckmarks();
  updateBankResitCheckmarks();
  updateGameLinksCheckmarks();

  // ✅ kalau custom tabs render ikut hide/show, re-render sekali
  renderCustomTabs();
});
  blurphpDb.ref('settings/uiCustomTabs').on('value', (snap) => {
  uiCustomTabs = snap.val() || {};
  renderCustomTabs();
});
}); // ⬅️ tutup DOMContentLoaded

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("gmailLogin");
    sessionStorage.setItem("forceLogout", "1");
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
    window.location.href = "/login";
  });
}
window.renderMobileUserBtn = function renderMobileUserBtn(){ 
  const btn = document.getElementById('menuUserBtn');
  if (!btn) return;
  let login, label = 'User';
  try {
    login = JSON.parse(localStorage.getItem('gmailLogin') || '{}');
    const fullName = (login?.name || '').trim();
    const parts = fullName.split(' ').filter(Boolean);
    const dedupName = (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase())
      ? parts[0]
      : fullName;
    label = dedupName || (login?.email ? login.email.split('@')[0] : 'User');
  } catch(_){}
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-right:6px">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
    <span>${label}</span>
  `;
};
(function setAriaLabels(){
  const pairs = [
    ['bankResitBtn','Bank Resit'],
    ['gameLinksBtn','List Type'],
    ['liveChatBtn','LiveChat'],
    ['linkDownloadBtn','Link Download'],
    ['gameLogBtn','Game Log'],
    ['userName','Account'],
    ['notifButton','Notice'],
    ['itemBtn','Item ColLection'],
  ];
  pairs.forEach(([id,label])=>{
    const el = document.getElementById(id);
    if (el){ el.setAttribute('aria-label', label); el.title = label; }
  });
})();
function updateDateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const timeString = `${hours}:${minutes}:${seconds} ${day} ${month} ${year}`;
  document.getElementById('dateTime').textContent = timeString;
}
setInterval(updateDateTime, 1000);
updateDateTime();
// ✅ SATU handler postMessage gabungan (aman & rapi)
window.addEventListener("message", async (e) => {
  const allowedOrigins = new Set([
    "https://searcfile.github.io",
    "https://5g88-home.vercel.app",
  ]);
  if (!allowedOrigins.has(e.origin)) {
    console.warn("❌ Diterima dari origin tidak dibenarkan:", e.origin);
    return;
  }

  // pastikan pesan benar-benar dari iframe kita
  const frame = document.getElementById("pageFrame");
  if (!frame || e.source !== frame.contentWindow) return;

  const data = e.data || {};

  // 1) Handshake login
if (data.type === "child-ready" || data.type === "request-login") {
  const payload = getLoginPayload();
  if (payload) e.source.postMessage(payload, e.origin);  // balas langsung ke origin pengirim
  try { sendLoginToIframeReliable(frame, 4, 200, e.origin); } catch(_) {}
  return;
}

  // 2) Aksi lain
  const livechatDot = document.getElementById("livechatDot");
  if (data.action === "show-livechat-notif" && livechatDot) { livechatDot.style.display = "block"; return; }
  if (data.action === "hide-livechat-notif" && livechatDot) { livechatDot.style.display = "none";  return; }

  // Fallback salin gambar bila ClipboardItem tidak didukung
  async function copyBlobFrom(urlOrData) {
    const resp = await fetch(urlOrData);
    const blob = await resp.blob();

    if (window.ClipboardItem && navigator.clipboard?.write) {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(urlOrData);
      alert("Browser tidak mendukung salin gambar langsung. URL gambar telah disalin.");
    } else {
      alert("Clipboard API tidak didukung di browser ini.");
    }
  }

  if (data.action === "copy-image-base64" && data.base64) {
    try { await copyBlobFrom(data.base64); console.log("✅ Gambar (base64) disalin."); }
    catch (err) { console.error("❌ Gagal:", err); alert("❌ Gagal salin gambar."); }
    return;
  }

  if (data.action === "copy-image" && data.url) {
    try { await copyBlobFrom(data.url); console.log("✅ Gambar (URL) disalin."); }
    catch (err) { console.error("❌ Gagal:", err); }
    return;
  }
});

  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    loadingScreen.style.display = "none";
  }
let isDown = false;
let startX, scrollLeft;

tabBar.addEventListener('mousedown', (e) => {
  isDown = true;
  startX = e.pageX - tabBar.offsetLeft;
  scrollLeft = tabBar.scrollLeft;
});

tabBar.addEventListener('mouseleave', () => {
  isDown = false;
});

tabBar.addEventListener('mouseup', () => {
  isDown = false;
});

tabBar.addEventListener('mousemove', (e) => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - tabBar.offsetLeft;
  const walk = (x - startX) * 1.5;
  tabBar.scrollLeft = scrollLeft - walk;
});
tabBar.addEventListener('wheel', (e) => {
  if (e.deltaY !== 0) {
    e.preventDefault();
    tabBar.scrollLeft += e.deltaY;
  }
});
(function(){
  const btn = document.getElementById('changePwBtn');
  if (!btn) return;

  // set state awal secara dinamis
  updateChangePwVisibility();

  // Elemen modal
  const modal   = document.getElementById('cpModal');
  const closeX  = document.getElementById('cpClose');
  const cancel  = document.getElementById('cpCancel');
  const submit  = document.getElementById('cpSubmit');
  const inOld   = document.getElementById('cpOld');
  const inNew   = document.getElementById('cpNew');
  const inNew2  = document.getElementById('cpNew2');
  const errBox  = document.getElementById('cpErr');
  const okBox   = document.getElementById('cpOk');

  function openCp(){
    // cek ulang status login SAAT INI (bukan nilai lama)
    if (!isUsernameLoginNow()) return;
    errBox.style.display = 'none'; errBox.textContent = '';
    okBox.style.display  = 'none'; okBox.textContent  = '';
    inOld.value = inNew.value = inNew2.value = '';
    modal.style.display = 'flex';
    setTimeout(()=>inOld.focus(), 0);
  }
  function closeCp(){ modal.style.display = 'none'; }
  function showErr(msg){ errBox.textContent = msg; errBox.style.display='block'; okBox.style.display='none'; }
  function showOk(msg){  okBox.textContent  = msg; okBox.style.display='block'; errBox.style.display='none'; }

  btn.addEventListener('click', openCp);
  closeX.addEventListener('click', closeCp);
  cancel.addEventListener('click', closeCp);
  window.addEventListener('click', (e)=>{ if(e.target === modal) closeCp(); });
  
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}
async function doChange(){
  const oldPw = inOld.value.trim();
  const newPw = inNew.value.trim();
  const newPw2= inNew2.value.trim();

  if (!oldPw || !newPw || !newPw2) { showErr('All fields are required to be filled in.'); return; }
  if (newPw.length < 6)            { showErr('New password must be at least 6 characters.'); return; }
  if (newPw !== newPw2)            { showErr('Confirm password does not match.'); return; }
  if (newPw === oldPw)             { showErr('New password cannot be the same as current.'); return; }

  try{
    // ambil username dari sesi (email pseudo: <username>@5g88.local)
    const login = JSON.parse(localStorage.getItem('gmailLogin') || '{}');
    const email = (login?.email || '').toLowerCase();
    if (!email.endsWith('@5g88.local')) {
      showErr('This account type cannot change password here.');
      return;
    }
    const uname = email.split('@')[0];

    // 1) ambil akun dari RTDB
    const ref  = loginDb.ref(`logins/user_accounts/${uname}`);
    const snap = await ref.get();
    if (!snap.exists()) { showErr('Username does not exist.'); return; }
    const user = snap.val();
    if (user.active === false) { showErr('This account is deactivated.'); return; }

    // 2) verifikasi password lama
    const oldHash = await sha256Hex(oldPw);
    if (oldHash !== user.passwordHash) { showErr('Wrong current password.'); return; }

    // 3) simpan password baru (hash) + metadata
    const newHash = await sha256Hex(newPw);
    await ref.update({
      passwordHash: newHash,
      updatedAt: Date.now(),
      passwordVersion: (user.passwordVersion || 0) + 1   // opsional untuk invalidasi sesi lama
    });

    // 4) (opsional) catat audit
    try {
      await loginDb.ref(`logins/password_change_logs/${uname}`).push({
        at: Date.now(),
        ua: navigator.userAgent || '',
        result: 'ok'
      });
    } catch(_) {}

    // 5) selesai
    showOk('Password changed successfully ✅');
    setTimeout(() => {
      // rekomendasi: paksa re-login
      localStorage.removeItem('gmailLogin');
      window.location.href = '/login?pw_changed=1';
    }, 1000);
  }catch(err){
    showErr('Failed to change password. ' + (err?.message || ''));
  }
}
  submit.addEventListener('click', doChange);
  [inOld,inNew,inNew2].forEach(i=>i.addEventListener('keydown',(e)=>{ if(e.key==='Enter') doChange(); }));
})();
// ====== ❄️ SNOW EFFECT – MERRY CHRISTMAS ❄️ ======
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    // Hanya aktif di bulan Desember (0 = Jan, 11 = Des)
    const now = new Date();
    if (now.getMonth() !== 11) return;  // kalau mau selalu ON, hapus 2 baris ini

    const flakesCount = 80; // jumlah kepingan salju (atur sesuka hati)

    const snowLayer = document.createElement('div');
    snowLayer.className = 'snow-layer';
    document.body.appendChild(snowLayer);

    for (let i = 0; i < flakesCount; i++) {
      const flake = document.createElement('span');
      flake.className = 'snowflake';
      flake.textContent = '✻'; // bintang salju putih (bukan emoji)

      // Posisi horizontal random
      flake.style.left = Math.random() * 100 + 'vw';

      // Ukuran random
      const size = 8 + Math.random() * 12;   // 8px – 20px
      flake.style.fontSize = size + 'px';

      // Durasi jatuh random
      const duration = 6 + Math.random() * 10;  // 6s – 16s
      flake.style.animationDuration = duration + 's';

      // Delay random biar nggak bareng-bareng
      const delay = Math.random() * 10;
      flake.style.animationDelay = delay + 's';

      // Opacity sedikit beda-beda
      flake.style.opacity = (0.5 + Math.random() * 0.5).toFixed(2);

      snowLayer.appendChild(flake);
    }
  });
})();
// ===== 🎄 CHRISTMAS MUSIC SYSTEM =====
(function () {

  // ✅ 1) SWITCH UTAMA (tukar true/false)
  const CHRISTMAS_MUSIC_ENABLED = false; // ❌ OFF (dah lepas Christmas)
  // const CHRISTMAS_MUSIC_ENABLED = true; // ✅ ON (bila nak hidupkan semula)

  const music = document.getElementById("christmasMusic");
  const btn   = document.getElementById("musicToggle");
  if (!music || !btn) return;

  // ✅ 2) Kalau OFF → terus matikan semuanya, hide button, clear storage
  if (!CHRISTMAS_MUSIC_ENABLED) {
    try { music.pause(); } catch(e){}
    music.currentTime = 0;
    music.remove();                 // buang audio element dari DOM
    btn.style.display = "none";     // sembunyi button
    localStorage.removeItem("christmasMusic"); // buang state lama
    return;                         // STOP script
  }

  music.volume = 0.3;
  let isPlaying = false;
  let pausedByHidden = false;

  function setLabel(on){
    btn.textContent = on ? "🔊 MUSIC ON" : "🎵 MUSIC OFF";
  }

  function startMusic() {
    music.play().then(() => {
      isPlaying = true;
      pausedByHidden = false;
      setLabel(true);
      localStorage.setItem("christmasMusic", "on");
    }).catch(err => {
      console.log("Autoplay blocked:", err);
    });
  }

  function stopMusic() {
    music.pause();
    isPlaying = false;
    pausedByHidden = false;
    setLabel(false);
    localStorage.setItem("christmasMusic", "off");
  }

  const savedState = localStorage.getItem("christmasMusic");
  setLabel(savedState === "on");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isPlaying) {
      stopMusic();
    } else {
      localStorage.setItem("christmasMusic", "on");
      startMusic();
    }
  });

  function resumeIfWanted() {
    if (!isPlaying && localStorage.getItem("christmasMusic") === "on") {
      startMusic();
    }
  }

  ["pointerdown", "keydown"].forEach(ev => {
    const handler = () => {
      resumeIfWanted();
      document.removeEventListener(ev, handler);
    };
    document.addEventListener(ev, handler);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!music.paused) {
        music.pause();
        pausedByHidden = true;
      }
    } else {
      const state = localStorage.getItem("christmasMusic");
      if (pausedByHidden && state === "on") {
        music.play().then(() => {
          isPlaying = true;
          setLabel(true);
        }).catch(()=>{});
      }
    }
  });
})();
