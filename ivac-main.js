/* ivac-main.js — ALLEX IVAC Automation (Final, UI fixed + native mobile-verify)
 * - Floating panel (draggable) now reliably renders (injectUI -> append to body)
 * - mobile-verify uses **site's native form submit** (keeps hidden/CSRF/turnstile)
 * - Turnstile token is used only if user solved it (no solver/bypass here)
 * - Same-origin URL-encoded form POST + credentials:include
 * - Fallback router: /api/v2/payment → /api/payment → /api/v2
 * - OTP single-flight, de-dupe, STOP CURRENT/ALL
 * - Tabs: Login | BGD & OTP | Payment
 */

(() => {
  'use strict';

  /************** ROUTING **************/
  const ORIGIN = location.origin; // https://payment.ivacbd.com
  const ROUTE_BASES = [
    `${ORIGIN}/api/v2/payment`,
    `${ORIGIN}/api/payment`,
    `${ORIGIN}/api/v2`
  ];
  const EP = (base) => ({
    mobileVerify:  `${base}/mobile-verify`,
    login:         `${base}/login`,
    loginOtp:      `${base}/login-otp`,
    appSubmit:     `${base}/application-info-submit`,
    perSubmit:     `${base}/personal-info-submit`,
    overview:      `${base}/overview-submit`,
    slotTime:      `${base}/pay-slot-time`,
    payOtpSend:    `${base}/pay-otp-sent`,
    payOtpVerify:  `${base}/pay-otp-verify`,
    payNow:        `${base}/pay-now`,
    checkout:      `${base}/checkout`,
  });

  /************** UI CONST **************/
  const UI_TXT = { title: "Allex@cyber2", v: "v3.3 | ALLEX | Updated" };
  const TS_KEY = "ivac_turnstile_token";

  /************** STATE **************/
  const kv = {
    get k(){ return JSON.parse(localStorage.getItem("ivac_kv") || "{}"); },
    set k(v){ localStorage.setItem("ivac_kv", JSON.stringify(v || {})); },
    read(path, def=null){
      if(!path.includes(".")) return (this.k[path] ?? def);
      const seg = path.split("."); let t = this.k;
      for(const s of seg){ if(t == null) return def; t = t[s]; }
      return (t ?? def);
    },
    write(key, val){ const x=this.k; x[key]=val; this.k=x; },
  };
  let bearerToken = kv.read("bearerToken",""); // saved after login/otp
  const active = new Map();                    // id -> AbortController
  const dedupe = new Set();                    // simple request de-dupe
  const backoff = new Map();                   // origin -> {fail, until}
  let otpFlight = false;

  /************** UTIL **************/
  const css = `
  .alx-root{position:fixed;right:20px;top:20px;z-index:999999;font-family:Inter,Segoe UI,Roboto,system-ui,sans-serif}
  .alx-card{width:420px;background:#fff;border-radius:14px;border:2px solid #0b285a;box-shadow:0 10px 30px rgba(0,0,0,.15);overflow:hidden}
  .alx-head{padding:10px 14px;background:linear-gradient(135deg,#0b285a,#123c85);color:#fff;font-weight:700;text-align:center;cursor:move;user-select:none}
  .alx-tabs{display:flex;border-bottom:1px solid #eee}
  .alx-tab{flex:1;text-align:center;padding:10px;cursor:pointer;font-weight:600;color:#6b7280;border-bottom:3px solid transparent}
  .alx-tab.active{color:#2563eb;border-color:#2563eb}
  .alx-body{padding:16px}
  .alx-status{padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;text-align:center;font-size:14px;color:#374151;background:#fff}
  .alx-input,.alx-token{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin:6px 0;font-size:14px}
  .alx-token{background:#fff8e1}
  .alx-row{display:flex;gap:4%;margin:8px 0}
  .alx-btn{flex:1;padding:10px 12px;border:0;border-radius:9px;color:#fff;font-weight:700;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,.15)}
  .b-blue{background:linear-gradient(135deg,#3b82f6,#2563eb)}
  .b-green{background:linear-gradient(135deg,#10b981,#059669)}
  .b-purple{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}
  .b-orange{background:linear-gradient(135deg,#f59e0b,#d97706)}
  .b-red{background:linear-gradient(135deg,#ef4444,#b91c1c)}
  .alx-footer{padding:8px 14px;color:#6b7280;font-size:12px;border-top:1px solid #eee;text-align:center}
  .alx-toast{position:fixed;left:20px;bottom:20px;background:#111;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,.25);z-index:100000}
  .alx-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100000}
  .alx-modal-card{width:520px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb;position:relative}
  .alx-modal-title{font-weight:800;margin-bottom:10px}
  .alx-x{position:absolute;top:10px;right:14px;cursor:pointer;font-weight:800}
  `;
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
  const now = ()=> Date.now();
  const makeSig = (url, method, body)=> `${method}:${url}:${body?JSON.stringify(body).slice(0,200):""}`;
  function backoffInfo(url){ const o=new URL(url).origin; return backoff.get(o)||{fail:0,until:0}; }
  async function backoffGuard(url){ const ent=backoffInfo(url); if(ent.until>now()) await sleep(ent.until-now()); }
  function noteFail(url){ const o=new URL(url).origin; const e=backoff.get(o)||{fail:0,until:0}; e.fail=Math.min(e.fail+1,6); e.until=now()+Math.floor((2**e.fail)*400+Math.random()*300); backoff.set(o,e); }
  function noteOk(url){ const o=new URL(url).origin; backoff.set(o,{fail:0,until:0}); }

  function injectCSS(){ if(!document.getElementById("alx-style")){ const st=document.createElement("style"); st.id="alx-style"; st.textContent=css; document.head.appendChild(st); } }
  function toast(msg, ok=true){ const t=document.createElement("div"); t.className="alx-toast"; t.textContent=msg; t.style.background= ok? "linear-gradient(135deg,#059669,#065f46)":"linear-gradient(135deg,#b91c1c,#7f1d1d)"; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }

  let statusEl;
  function setStatus(msg, color){ if(statusEl){ statusEl.textContent=msg; if(color) statusEl.style.color=color; } }

  /************** TURNSTILE (capture on verify) **************/
  function startTurnstileWatcher(){
    function snapshot(){
      const inp = document.querySelector('input[name="captcha_token"]') ||
                  document.querySelector('input[name="cf-turnstile-response"]');
      const val = inp && inp.value ? inp.value.trim() : "";
      if (val) localStorage.setItem(TS_KEY, val);
      return val;
    }
    snapshot();
    const mo = new MutationObserver(()=>snapshot());
    mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
  }
  function focusTurnstileWidget(){
    const w = document.querySelector(".cf-turnstile, iframe[src*='challenges.cloudflare']");
    if (w){ w.scrollIntoView({behavior:"smooth",block:"center"}); w.style.outline="3px solid #f59e0b"; setTimeout(()=>w.style.outline="",1500); }
    else toast("Turnstile widget not visible here.", false);
  }

  /************** NATIVE mobile-verify (keeps hidden/CSRF) **************/
  function nativeMobileVerify(number) {
    let form = document.querySelector('form[action*="mobile-verify" i]');
    if (!form) {
      const authBox = document.querySelector('.tab-pane.active') ||
                      document.querySelector('#authentication, .tab-content') ||
                      document.body;
      form = authBox && authBox.querySelector('form');
    }
    if (!form) { toast("Auth form not found. Update selector.", false); return false; }

    const mobileInp =
      form.querySelector('input[name="mobile_no" i]') ||
      document.querySelector('input[name="mobile_no" i]');
    if (mobileInp) {
      mobileInp.value = number;
      mobileInp.dispatchEvent(new Event('input',{bubbles:true}));
      mobileInp.dispatchEvent(new Event('change',{bubbles:true}));
    }

    const t = localStorage.getItem(TS_KEY) ||
              (document.querySelector('input[name="captcha_token"]')||{}).value ||
              (document.querySelector('input[name="cf-turnstile-response"]')||{}).value || "";
    let tsInp =
      form.querySelector('input[name="captcha_token" i]') ||
      form.querySelector('input[name="cf-turnstile-response" i]');
    if (!tsInp && t) { tsInp=document.createElement('input'); tsInp.type='hidden'; tsInp.name='captcha_token'; form.appendChild(tsInp); }
    if (tsInp && t) tsInp.value = t;

    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
    return true;
  }

  /************** FETCH (fallback router, form-POST) **************/
  async function postFormMulti(kind, data, needTS=false, includeAuth=false){
    if (needTS) {
      const t = localStorage.getItem(TS_KEY) ||
                (document.querySelector('input[name="captcha_token"]')||{}).value ||
                (document.querySelector('input[name="cf-turnstile-response"]')||{}).value || "";
      if (!t) { setStatus("Solve Turnstile first, then try.", "#b45309"); return {ok:false,msg:"turnstile-missing"}; }
      data = { ...(data||{}), captcha_token: t };
    }

    const body = new URLSearchParams();
    Object.entries(data||{}).forEach(([k,v])=> body.append(k, v ?? ""));

    const headers = { accept: "application/json" };
    if (includeAuth && bearerToken) headers.authorization = `Bearer ${bearerToken}`;

    let lastErr = null;
    for (const base of ROUTE_BASES) {
      const url = EP(base)[kind];
      await backoffGuard(url);

      const sig = makeSig(url,"POST",data);
      if (dedupe.has(sig)) return {ok:false,msg:"deduped"};
      dedupe.add(sig); setTimeout(()=>dedupe.delete(sig),800);

      const ac = new AbortController(); const id=`${Date.now()}-${Math.random()}`; active.set(id, ac);
      try{
        const res = await fetch(url, { method:"POST", headers, body, credentials:"include", redirect:"manual", signal:ac.signal });
        active.delete(id);

        if (res.type==="opaqueredirect" || (res.status>=300 && res.status<400)) { lastErr={ok:false,msg:"redirect"}; continue; }
        if ([403,419,429,503].includes(res.status)) { noteFail(url); lastErr={ok:false,msg:`HTTP ${res.status}`}; return lastErr; }
        if (res.status===404 || res.status===405) { lastErr={ok:false,msg:`HTTP ${res.status}`}; continue; }
        if (!res.ok) { noteFail(url); lastErr={ok:false,msg:`HTTP ${res.status}`}; continue; }

        noteOk(url);
        const json = await res.json().catch(()=> ({}));
        return {ok:true, data:json, msg: json?.message||json?.msg||"OK", url};
      }catch(e){ active.delete(id); noteFail(url); lastErr={ok:false,msg:e.message||"Network"}; continue; }
    }
    return lastErr || {ok:false,msg:"no-route"};
  }

  /************** UI BUILD (FIXED: append to body) **************/
  let statusBox;
  function injectUI(){
    injectCSS();

    const root = document.createElement("div");
    root.className="alx-root";

    const card = document.createElement("div");
    card.className="alx-card";
    root.appendChild(card);

    const head = document.createElement("div");
    head.className="alx-head";
    head.textContent = UI_TXT.title;
    card.appendChild(head);

    const tabs = document.createElement("div");
    tabs.className="alx-tabs";
    card.appendChild(tabs);

    const tLogin = tabEl("Login");
    const tBGD   = tabEl("BGD & OTP");
    const tPay   = tabEl("Payment");
    tabs.append(tLogin,tBGD,tPay);

    const body = document.createElement("div");
    body.className="alx-body";
    card.appendChild(body);

    statusEl = document.createElement("div");
    statusEl.className="alx-status";
    statusEl.textContent="Ready";
    body.appendChild(statusEl);

    const viewLogin = loginView();
    const viewBGD   = bgdView();
    const viewPay   = payView();

    body.append(viewLogin, viewBGD, viewPay);
    switchTab(0);

    const footer = document.createElement("div");
    footer.className="alx-footer";
    footer.textContent = `${UI_TXT.v} ${new Date().toISOString().slice(0,10)}`;
    card.appendChild(footer);

    // >>> critical: actually render the panel
    document.body.appendChild(root);

    // drag handle
    makeDraggable(root, head);

    function tabEl(txt){
      const d=document.createElement("div");
      d.className="alx-tab";
      d.textContent=txt;
      d.onclick=()=>switchTab([tLogin,tBGD,tPay].indexOf(d));
      return d;
    }
    function switchTab(i){
      [tLogin,tBGD,tPay].forEach((t,idx)=> t.classList.toggle("active", idx===i));
      [viewLogin,viewBGD,viewPay].forEach((v,idx)=> v.style.display = idx===i? "block":"none");
    }
    function makeDraggable(el, handle){
      let dragging=false, offX=0, offY=0;
      handle.addEventListener("mousedown", e=>{ dragging=true; const r=el.getBoundingClientRect(); offX=e.clientX-r.left; offY=e.clientY-r.top; e.preventDefault(); });
      document.addEventListener("mouseup", ()=>dragging=false);
      document.addEventListener("mousemove", e=>{ if(!dragging) return; el.style.left=(e.clientX-offX)+"px"; el.style.top=(e.clientY-offY)+"px"; el.style.right="auto"; });
    }
  }

  /************** VIEWS **************/
  function row(...children){ const d=document.createElement("div"); d.className="alx-row"; children.forEach(c=>d.appendChild(c)); return d; }
  function button(txt, cls, fn){ const b=document.createElement("button"); b.className=`alx-btn ${cls}`; b.textContent=txt; b.onclick=fn; return b; }
  function input(ph, type="text"){ const i=document.createElement("input"); i.className="alx-input"; i.placeholder=ph; i.type=type; return i; }
  function tokenInput(){ const i=document.createElement("input"); i.className="alx-token"; i.placeholder="Enter Bearer Token"; return i; }

  function loginView(){
    const box = document.createElement("div");

    const ready = input("Ready"); ready.disabled = true;
    const tsBtn = button("SOLVE TURNSTILE","b-purple", focusTurnstileWidget);

    const mobile = input("Enter mobile number (11 digits)");
    const pass   = input("Enter password","password");
    const otp    = input("Enter 6-digit OTP");

    const row1 = row( button("SEND VERIFICATION","b-green", onMobileVerify),
                      button("AUTO","b-orange", ()=>setStatus("Auto login…")) );
    const row2 = row( button("LOGIN WITH PASSWORD","b-blue", onLoginWithPassword),
                      button("AUTO","b-orange", onLoginWithPassword) );
    const row3 = row( button("LOGIN WITH OTP","b-purple", onLoginWithOtp),
                      button("AUTO","b-orange", onLoginWithOtp) );

    const copyBtn = button("COPY ACCESS TOKEN","b-purple",()=>{
      navigator.clipboard.writeText(bearerToken||""); toast("Access token copied");
    });
    const rowStop = row( button("STOP CURRENT","b-red", stopCurrent),
                         button("STOP ALL","b-red", stopAll) );

    box.append(ready, tsBtn, mobile, row1, pass, row2, otp, row3, copyBtn, rowStop);

    async function onMobileVerify(){
      const num = mobile.value.trim();
      if(!/^\d{11}$/.test(num)){ toast("Invalid mobile number", false); return; }
      const token = localStorage.getItem(TS_KEY) ||
                    (document.querySelector('input[name="captcha_token"]')||{}).value ||
                    (document.querySelector('input[name="cf-turnstile-response"]')||{}).value || "";
      if (!token){ setStatus("Solve Turnstile first, then try.", "#b45309"); focusTurnstileWidget(); return; }
      const ok = nativeMobileVerify(num);
      if (ok) { setStatus("Submitting mobile-verify via native form…", "#0ea5e9"); toast("Submitting…"); }
    }
    async function onLoginWithPassword(){
      const num=mobile.value.trim(), pw=pass.value;
      if(!/^\d{11}$/.test(num) || !pw){ toast("Mobile/password required", false); return; }
      const res = await postFormMulti("login", { mobile_no:num, password:pw }, false, false);
      if(res?.ok){ bearerToken = res.data?.access_token || ""; kv.write("bearerToken", bearerToken); toast("Logged in (password) ✓"); }
      else toast(res?.msg || "Login failed", false);
    }
    async function onLoginWithOtp(){
      if(otpFlight){ toast("OTP verify in-progress", false); return; }
      const num=mobile.value.trim(), code=otp.value.trim();
      if(!/^\d{11}$/.test(num) || !/^\d{6}$/.test(code)){ toast("Mobile/OTP required", false); return; }
      otpFlight = true;
      try{
        const res = await postFormMulti("loginOtp", { mobile_no:num, otp:code }, false, false);
        if(res?.ok){ bearerToken = res.data?.access_token || ""; kv.write("bearerToken", bearerToken); toast("OTP verified! Token saved ✓"); }
        else toast(res?.msg || "OTP failed", false);
      } finally { otpFlight=false; }
    }

    return box;
  }

  function bgdView(){
    const box = document.createElement("div"); box.style.display="none";

    const note = input("Ready for BGD form submission"); note.disabled=true;
    const tokenInp = tokenInput(); tokenInp.value = bearerToken;
    tokenInp.oninput = ()=>{ bearerToken = tokenInp.value.trim(); kv.write("bearerToken", bearerToken); };

    const rowA = row( button("APPLICATION","b-blue", submitApplication),
                      button("PERSONAL","b-green", submitPersonal) );
    const rowB = row( button("OVERVIEW","b-purple", submitOverview),
                      button("SEND OTP","b-orange", ()=>sendPayOtp(false)) );

    const otpInp = input("Enter 6-digit Payment OTP");
    const rowC = row( button("RESEND OTP","b-blue", ()=>sendPayOtp(true)),
                      button("AUTO","b-orange", ()=>sendPayOtp(true)) );
    const rowD = row( button("VERIFY OTP","b-purple", verifyPayOtp),
                      button("AUTO","b-orange", verifyPayOtp) );

    const editBtn = button("ADD/EDIT DATA","b-purple", openDataModal);
    const stopBtn = button("STOP ALL","b-red", stopAll);

    box.append(note, tokenInp, rowA, rowB, otpInp, rowC, rowD, editBtn, stopBtn);

    async function submitApplication(){
      const res = await postFormMulti("appSubmit", kv.read("applicationInfo"), false, true);
      res?.ok ? toast(res.msg || "Application submitted ✓") : toast(res?.msg || "Application failed", false);
    }
    async function submitPersonal(){
      const res = await postFormMulti("perSubmit", kv.read("personalInfo"), false, true);
      res?.ok ? toast(res.msg || "Personal submitted ✓") : toast(res?.msg || "Personal failed", false);
    }
    async function submitOverview(){
      const res = await postFormMulti("overview", {}, false, true);
      res?.ok ? toast(res.msg || "Overview submitted ✓") : toast(res?.msg || "Overview failed", false);
    }
    async function sendPayOtp(resend=false){
      const res = await postFormMulti("payOtpSend", { resend: resend?1:0 }, false, true);
      res?.ok ? toast("Payment OTP sent") : toast(res?.msg || "OTP send failed", false);
    }
    async function verifyPayOtp(){
      if(otpFlight){ toast("OTP verify in-progress", false); return; }
      const code = otpInp.value.trim();
      if(!/^\d{6}$/.test(code)){ toast("Valid 6-digit OTP required", false); return; }
      otpFlight = true;
      try{
        const res = await postFormMulti("payOtpVerify", { otp: code }, false, true);
        res?.ok ? toast("Payment OTP verified ✓") : toast(res?.msg || "OTP verify failed", false);
      } finally { otpFlight=false; }
    }

    return box;
  }

  function payView(){
    const box = document.createElement("div"); box.style.display="none";

    const note = input("Ready for payment"); note.disabled=true;
    const date = input("mm/dd/yyyy","date");
    const rowA = row( button("GET SLOTS","b-blue", getSlots),
                      button("AUTO","b-orange", getSlots) );
    const rowB = row( button("PAY NOW","b-purple", payNow),
                      button("AUTO","b-orange", payNow) );
    const stopBtn = button("STOP ALL","b-red", stopAll);

    box.append(note, date, rowA, rowB, stopBtn);

    async function getSlots(){
      const d = date.value; if(!d){ toast("Select date", false); return; }
      const res = await postFormMulti("slotTime", { appointment_date: d }, false, true);
      if(res?.ok){
        const times = res.data?.slot_times || [];
        toast(times.length? `Slots: ${times.join(", ")}` : "No slots", !!times.length);
        kv.write("lastSlots", {date:d, times});
      } else toast(res?.msg || "Slot fetch failed", false);
    }
    async function payNow(){
      const d = date.value; if(!d){ toast("Select date", false); return; }
      const pick = (kv.read("lastSlots")?.times || [])[0] || "09:00 - 09:59";
      const payload = {
        appointment_date: d,
        appointment_time: pick,
        selected_payment: { name:"VISA", slug:"visacard", link:"https://securepay.sslcommerz.com/gwprocess/v4/image/gw1/visa.png" }
      };
      const res = await postFormMulti("payNow", payload, false, true);
      if(res?.ok){
        const url = res.data?.data?.url; if(url) window.open(url,"_blank");
        toast("Payment init ✓");
      } else toast(res?.msg || "Pay failed", false);
    }

    return box;
  }

  /************** DATA MODAL **************/
  function openDataModal(){
    const modal = document.createElement("div"); modal.className="alx-modal";
    const card  = document.createElement("div"); card.className="alx-modal-card"; modal.appendChild(card);
    const title = document.createElement("div"); title.className="alx-modal-title"; title.textContent="Custom Data Input"; card.appendChild(title);
    const x = document.createElement("div"); x.className="alx-x"; x.textContent="✕"; card.appendChild(x); x.onclick=()=>modal.remove();

    const fields = [
      ["highcom","Application Info → highcom"],
      ["webfile_id","Application Info → webfile_id"],
      ["ivac_id","Application Info → ivac_id"],
      ["visa_type","Application Info → visa_type"],
      ["family_count","Application Info → family_count"],
      ["visit_purpose","Application Info → visit_purpose"],
      ["full_name","Personal → full_name"],
      ["email_name","Personal → email"],
      ["phone","Personal → phone"],
    ];
    const inputs = {};
    fields.forEach(([k,lab])=>{
      const i=document.createElement("input"); i.className="alx-input"; i.placeholder=lab; i.value=kv.read("data."+k,"");
      inputs[k]=i; card.appendChild(i);
    });

    const save = document.createElement("button");
    save.className="alx-btn b-green"; save.textContent="Save Data";
    save.onclick=()=>{
      const data={}; Object.keys(inputs).forEach(k=> data[k]=inputs[k].value.trim());
      const app={ highcom:data.highcom||"1", webfile_id:data.webfile_id||"", webfile_id_repeat:data.webfile_id||"", ivac_id:data.ivac_id||"", visa_type:data.visa_type||"", family_count:data.family_count||"0", visit_purpose:data.visit_purpose||"" };
      const per={ full_name:data.full_name||"", email_name:data.email_name||"", phone:data.phone||"", webfile_id:data.webfile_id||"" };
      kv.write("applicationInfo",app); kv.write("personalInfo",per);
      toast("Saved ✓"); modal.remove();
    };
    card.appendChild(save);
    document.body.appendChild(modal);
  }

  /************** STOP **************/
  function stopCurrent(){ const last = Array.from(active.values()).pop(); if (last){ last.abort(); toast("Stopped current"); } }
  function stopAll(){ active.forEach(ac=>ac.abort()); active.clear(); toast("Stopped all"); }

  /************** ENTRY **************/
  (function init(){
    injectUI();
    startTurnstileWatcher();
    window.addEventListener("keydown",(e)=>{ if(e.altKey && (e.key==="d"||e.key==="D")) openDataModal(); });
    window.__IVAC__ = { openDataModal, stopAll, focusTurnstileWidget };
  })();

})();
