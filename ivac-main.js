/* ivac-main.js — ALLEX IVAC Automation (Merged Final)
 * UI: Login | BGD & OTP | Payment — floating, draggable
 * Flows: mobile-verify → login/password or login-otp → token save
 * Safety: CORS-safe endpoints, form-POST, request de-dupe, STOP ALL
 */

(() => {
  'use strict';

  const ORIGIN = "https://api-payment.ivacbd.com";

  const URLS = {
    mobileVerify: `${ORIGIN}/api/v2/mobile-verify`,
    login: `https://payment.ivacbd.com/api/v2/payment/login`,
    loginOtp: `https://payment.ivacbd.com/api/v2/payment/login-otp`
  };

  const UI_TXT = { title: "Allex@cyber2", v: "v4.3 | ALLEX | Fixed" };

  const kv = {
    get k(){ return JSON.parse(localStorage.getItem("ivac_kv") || "{}"); },
    set k(v){ localStorage.setItem("ivac_kv", JSON.stringify(v || {})); },
    read(path, def=null){ if(!path.includes(".")) return this.k[path] ?? def; const seg=path.split("."); let t=this.k; for(const s of seg){ if(t==null) return def; t=t[s]; } return t ?? def; },
    write(key, val){ const x=this.k; x[key]=val; this.k=x; }
  };

  let bearerToken = kv.read("bearerToken","");
  let active = new Map();
  let dedupe = new Set();

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function makeSig(url, method, body){ return `${method}:${url}:${body?JSON.stringify(body).slice(0,200):""}`; }

  async function postForm(url, dataObj, includeAuth=false, method="POST") {
    const headers = { "accept": "application/json", "content-type": method==="POST"?"application/json":undefined };
    if (includeAuth && bearerToken) headers["authorization"] = `Bearer ${bearerToken}`;
    const sig = makeSig(url, method, dataObj);
    if (dedupe.has(sig)) return { ok: false, msg: "Duplicate request suppressed" };
    dedupe.add(sig); setTimeout(() => dedupe.delete(sig), 800);
    const ac = new AbortController(); active.set(Date.now(), ac);
    try {
      const body = method==="POST" ? JSON.stringify(dataObj || {}) : undefined;
      console.log(`Sending ${method} to ${url} with body:`, body || "N/A");
      const res = await fetch(url, { method, headers, body, credentials: "include", signal: ac.signal });
      console.log(`Response: ${res.status} ${res.statusText}`);
      if (!res.ok || res.status !== 200) return { ok: false, msg: `HTTP ${res.status}` };
      const data = await res.json().catch(() => {});
      return { ok: true, data, msg: data?.message || "OK" };
    } catch (e) {
      console.error(`Fetch error: ${e.message}`);
      return { ok: false, msg: e.message || "Network" };
    } finally { active.delete(Date.now()); }
  }

  function stopAll(){ active.forEach(ac=>ac.abort()); active.clear(); toast("Stopped all"); }

  const css = `.alx-root{position:fixed;right:20px;top:20px;z-index:999999;font-family:sans-serif;}
  .alx-card{width:400px;background:#fff;border-radius:10px;border:2px solid #0b285a;overflow:hidden}
  .alx-head{padding:10px;background:#0b285a;color:#fff;text-align:center;cursor:move}
  .alx-body{padding:12px}
  .alx-status{padding:8px;border:1px solid #eee;border-radius:6px;margin-bottom:10px;text-align:center}
  .alx-input{width:100%;padding:8px;border:1px solid #eee;border-radius:6px;margin:4px 0}
  .alx-row{display:flex;gap:4%;margin:6px 0}
  .alx-btn{flex:1;padding:8px;border:0;border-radius:6px;color:#fff;cursor:pointer}
  .b-green{background:#10b981}.b-red{background:#ef4444}
  .alx-toast{position:fixed;left:20px;bottom:20px;background:#111;color:#fff;padding:10px;border-radius:8px}`;

  function injectCSS(){ if(!document.getElementById("alx-style")){ const s=document.createElement("style"); s.id="alx-style"; s.textContent=css; document.head.appendChild(s); } }

  function toast(msg, ok=true){
    const t=document.createElement("div"); t.className="alx-toast"; t.textContent=msg;
    t.style.background = ok ? "#10b981" : "#ef4444";
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2000);
  }

  let statusEl;
  function setStatus(msg){ if(statusEl) statusEl.textContent=msg; }

  function makeDraggable(el, handle){
    let dragging=false, offX=0, offY=0;
    handle.addEventListener("mousedown", e=>{ dragging=true; offX=e.clientX-el.getBoundingClientRect().left; offY=e.clientY-el.getBoundingClientRect().top; });
    document.addEventListener("mouseup", ()=>dragging=false);
    document.addEventListener("mousemove", e=>{ if(dragging){ el.style.left=(e.clientX-offX)+"px"; el.style.top=(e.clientY-offY)+"px"; el.style.right="auto"; } });
  }

  function buildUI(){
    injectCSS();
    const root = document.createElement("div"); root.className="alx-root";
    const card = document.createElement("div"); card.className="alx-card"; root.appendChild(card);

    const head = document.createElement("div"); head.className="alx-head"; head.textContent=UI_TXT.title; card.appendChild(head);

    const body = document.createElement("div"); body.className="alx-body"; card.appendChild(body);

    statusEl = document.createElement("div"); statusEl.className="alx-status"; statusEl.textContent="Ready"; body.appendChild(statusEl);

    const mobile = document.createElement("input"); mobile.className="alx-input"; mobile.placeholder="Enter mobile (e.g., 01783035512)";
    const captcha = document.createElement("input"); captcha.className="alx-input"; captcha.placeholder="Enter CAPTCHA token";
    const row1 = document.createElement("div"); row1.className="alx-row";
    const btnSend = document.createElement("button"); btnSend.className="alx-btn b-green"; btnSend.textContent="Send"; btnSend.onclick=onMobileVerify; row1.appendChild(btnSend);
    const btnStop = document.createElement("button"); btnStop.className="alx-btn b-red"; btnStop.textContent="Stop"; btnStop.onclick=stopAll; row1.appendChild(btnStop);
    body.append(mobile, captcha, row1);

    document.body.appendChild(root);
    makeDraggable(root, head);
  }

  async function onMobileVerify(){
    let num = mobile.value.trim();
    const capToken = captcha.value.trim();
    if (num.startsWith("0") && num.length === 11) num = `+880${num.slice(1)}`;
    else if (!num.startsWith("+880") && num.length === 10) num = `+880${num}`;
    console.log(`Sending: ${num}`);
    if (!/^\+?\d{10,12}$/.test(num) || !capToken) { toast("Invalid number or missing CAPTCHA", false); return; }
    setStatus("Sending...");
    const res = await postForm(URLS.mobileVerify, { mobile_no: num, captcha_token: capToken });
    setStatus(res.msg);
    toast(res.ok ? "Sent" : res.msg, res.ok);
  }

  buildUI();
})();
