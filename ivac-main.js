/* ivac-main.js — ALLEX IVAC Automation (Hosted Main)
 * UI: Login | BGD & OTP | Payment  — floating, draggable
 * Flows: mobile-verify → login/password or login-otp → token save
 *        application-info-submit → personal-info-submit → overview-submit
 *        pay-otp-sent → pay-otp-verify → pay-slot-time → pay-now
 * Safety: request dedupe, single-flight for OTP, per-origin backoff, abort-all
 * Note: No captcha solver. No CF/Turnstile bypass. If challenge shown, user completes it manually then retry.
 */

(() => {
  'use strict';

  /************** CONFIG **************/
  const API = {
    base: "https://api-payment.ivacbd.com",
    v2: "/api/v2",
    payment: "/payment",
    auth: "/auth",
  };

  const URLS = {
    // Auth
    mobileVerify: `${API.base}${API.v2}${API.payment}/mobile-verify`,
    login:        `${API.base}${API.v2}${API.payment}/login`,
    loginOtp:     `${API.base}${API.v2}${API.payment}/login-otp`,

    // App flow
    applicationSubmit: `${API.base}${API.v2}${API.payment}/application-info-submit`,
    personalSubmit:    `${API.base}${API.v2}${API.payment}/personal-info-submit`,
    overviewSubmit:    `${API.base}${API.v2}${API.payment}/overview-submit`,
    checkout:          `${API.base}${API.v2}${API.payment}/checkout`,

    // OTP + Payment
    payOtpSend:  `${API.base}${API.v2}${API.payment}/pay-otp-sent`,
    payOtpVerify:`${API.base}${API.v2}${API.payment}/pay-otp-verify`,
    slotTime:    `${API.base}${API.v2}${API.payment}/pay-slot-time`,
    payNow:      `${API.base}${API.v2}${API.payment}/pay-now`,
  };

  const UI_TXT = {
    title: "Allex@cyber2",
    v: "v3.3 | ALLEX | Updated",
  };

  /************** STATE **************/
  const kv = {
    get k(){ return JSON.parse(localStorage.getItem("ivac_kv") || "{}"); },
    set k(v){ localStorage.setItem("ivac_kv", JSON.stringify(v || {})); },
    read(key, def=null){ return (this.k[key] ?? def); },
    write(key, val){ const x=this.k; x[key]=val; this.k=x; },
    remove(key){ const x=this.k; delete x[key]; this.k=x; },
  };

  let bearerToken = kv.read("bearerToken",""); // saved after login/otp
  let active = new Map();                      // id -> AbortController
  let dedupe = new Set();                      // signature set
  const backoffMap = new Map();                // origin -> {fail, until}
  let otpFlight = false;                       // single-flight lock for OTP verify

  function makeSig(url, method, body){ return `${method}:${url}:${body?JSON.stringify(body).slice(0,200):""}`; }
  function originOf(url){ try{ return new URL(url).origin; }catch{ return "default"; } }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function now(){ return Date.now(); }

  async function backoffGuard(url){
    const o = originOf(url);
    const ent = backoffMap.get(o);
    if (ent && ent.until && ent.until > now()){
      const wait = ent.until - now();
      setStatus(`Backoff ${Math.ceil(wait/1000)}s…`, "#c77d00");
      await sleep(wait);
    }
  }
  function noteFailure(url){
    const o = originOf(url);
    const ent = backoffMap.get(o) || {fail:0, until:0};
    ent.fail = Math.min(ent.fail+1, 6);
    const wait = Math.floor((2 ** ent.fail) * 400 + Math.random()*300); // expo+jitter
    ent.until = now() + wait;
    backoffMap.set(o, ent);
  }
  function noteSuccess(url){
    const o = originOf(url);
    backoffMap.set(o, {fail:0, until:0});
  }

  /************** UI **************/
  const css = `
  .alx-root{position:fixed;right:20px;top:20px;z-index:999999;font-family:Inter,Segoe UI,Roboto,system-ui,sans-serif;}
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
  .alx-modal-card{width:520px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb}
  .alx-modal-title{font-weight:800;margin-bottom:10px}
  .alx-x{position:absolute;top:10px;right:14px;cursor:pointer;font-weight:800}
  `;

  function injectCSS(){ if(document.getElementById("alx-style")) return; const st=document.createElement("style"); st.id="alx-style"; st.textContent=css; document.head.appendChild(st); }

  function toast(msg, ok=true){
    const t=document.createElement("div"); t.className="alx-toast"; t.textContent=msg;
    t.style.background = ok? "linear-gradient(135deg,#059669,#065f46)":"linear-gradient(135deg,#b91c1c,#7f1d1d)";
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2200);
  }

  let statusEl;
  function setStatus(msg, color){
    if(!statusEl) return; statusEl.textContent=msg; if(color) statusEl.style.color=color;
  }

  // Draggable
  function makeDraggable(el, handle){
    let dragging=false, offX=0, offY=0;
    handle.addEventListener("mousedown", e=>{ dragging=true; const r=el.getBoundingClientRect(); offX = e.clientX - r.left; offY = e.clientY - r.top; e.preventDefault(); });
    document.addEventListener("mouseup", ()=>dragging=false);
    document.addEventListener("mousemove", e=>{
      if(!dragging) return; el.style.left = (e.clientX - offX) + "px"; el.style.top = (e.clientY - offY) + "px"; el.style.right="auto";
    });
  }

  // Build UI
  function buildUI(){
    injectCSS();
    const root = document.createElement("div"); root.className="alx-root";
    const card = document.createElement("div"); card.className="alx-card"; root.appendChild(card);

    const head = document.createElement("div"); head.className="alx-head"; head.textContent = UI_TXT.title; card.appendChild(head);

    const tabs = document.createElement("div"); tabs.className="alx-tabs"; card.appendChild(tabs);
    const tLogin = tabEl("Login"); const tBGD = tabEl("BGD & OTP"); const tPay = tabEl("Payment");
    tabs.append(tLogin,tBGD,tPay);

    const body = document.createElement("div"); body.className="alx-body"; card.appendChild(body);

    statusEl = document.createElement("div"); statusEl.className="alx-status"; statusEl.textContent="Ready";
    body.appendChild(statusEl);

    const viewLogin = loginView(); const viewBGD = bgdView(); const viewPay = payView();
    body.append(viewLogin, viewBGD, viewPay);
    switchTab(0);

    const footer = document.createElement("div"); footer.className="alx-footer";
    footer.textContent = `${UI_TXT.v} ${new Date().toISOString().slice(0,10)}`;
    card.appendChild(footer);

    document.body.appendChild(root);
    makeDraggable(root, head);

    function tabEl(txt){ const d=document.createElement("div"); d.className="alx-tab"; d.textContent=txt; d.onclick=()=>switchTab([tLogin,tBGD,tPay].indexOf(d)); return d; }
    function switchTab(i){
      [tLogin,tBGD,tPay].forEach((t,idx)=> t.classList.toggle("active", idx===i));
      [viewLogin,viewBGD,viewPay].forEach((v,idx)=> v.style.display = idx===i? "block":"none");
    }
  }

  // Views
  function loginView(){
    const box = document.createElement("div");

    const mobile = input("Enter mobile number (11 digits)");
    const pass = input("Enter password","password");
    const otp = input("Enter 6-digit OTP");
    const copyBtn = button("COPY ACCESS TOKEN","b-purple",()=>{ navigator.clipboard.writeText(bearerToken||""); toast("Access token copied"); });

    const row1 = row( button("SEND VERIFICATION","b-green", onMobileVerify),
                      button("AUTO","b-orange", onLoginAuto) );

    const row2 = row( button("LOGIN WITH PASSWORD","b-blue", onLoginWithPassword),
                      button("AUTO","b-orange", onLoginWithPassword) );

    const row3 = row( button("LOGIN WITH OTP","b-purple", onLoginWithOtp),
                      button("AUTO","b-orange", onLoginWithOtp) );

    const rowStop = row( button("STOP CURRENT","b-red", stopCurrent),
                         button("STOP ALL","b-red", stopAll) );

    box.append( mobile, row1, pass, row2, otp, row3, copyBtn, rowStop );

    function onLoginAuto(){ setStatus("Auto login sequence…"); }
    async function onMobileVerify(){
      const num = mobile.value.trim();
      if(!/^\d{11}$/.test(num)){ toast("Invalid mobile number", false); return; }
      const res = await request(URLS.mobileVerify, "POST", {mobile: num});
      res.ok ? toast("Verification sent") : toast(res.msg || "Failed", false);
    }
    async function onLoginWithPassword(){
      const num=mobile.value.trim(), pw=pass.value;
      if(!/^\d{11}$/.test(num) || !pw){ toast("Mobile/password required", false); return; }
      const res = await request(URLS.login, "POST", {mobile:num, password:pw});
      if(res.ok){
        bearerToken = res.data?.access_token || ""; kv.write("bearerToken", bearerToken);
        toast("Logged in (password) ✓");
      }else toast(res.msg || "Login failed", false);
    }
    async function onLoginWithOtp(){
      if(otpFlight){ toast("OTP verify in-progress", false); return; }
      const num=mobile.value.trim(), code=otp.value.trim();
      if(!/^\d{11}$/.test(num) || !/^\d{6}$/.test(code)){ toast("Mobile/OTP required", false); return; }
      otpFlight = true;
      try{
        const res = await request(URLS.loginOtp, "POST", {mobile:num, otp:code});
        if(res.ok){
          bearerToken = res.data?.access_token || ""; kv.write("bearerToken", bearerToken);
          toast("OTP verified! Token saved ✓");
        }else toast(res.msg || "OTP failed", false);
      } finally { otpFlight=false; }
    }

    return box;
  }

  function bgdView(){
    const box = document.createElement("div"); box.style.display="none";
    const tokenInp = tokenInput(); tokenInp.value = bearerToken; tokenInp.oninput = ()=>{ bearerToken = tokenInp.value.trim(); kv.write("bearerToken", bearerToken); };

    const rowA = row( button("APPLICATION","b-blue", submitApplication),
                      button("PERSONAL","b-green", submitPersonal) );
    const rowB = row( button("OVERVIEW","b-purple", submitOverview),
                      button("SEND OTP","b-orange", sendPayOtp) );

    const otpInp = input("Enter 6-digit Payment OTP");
    const rowC = row( button("RESEND OTP","b-blue", ()=>sendPayOtp(true)),
                      button("AUTO","b-orange", ()=>sendPayOtp(true)) );
    const rowD = row( button("VERIFY OTP","b-purple", verifyPayOtp),
                      button("AUTO","b-orange", verifyPayOtp) );

    const rowStop = row( button("STOP ALL","b-red", stopAll) );

    box.append( statusEl?document.createTextNode(""):document.createTextNode(""), tokenInp, rowA, rowB, otpInp, rowC, rowD, rowStop );

    async function submitApplication(){
      const res = await authed(URLS.applicationSubmit, "POST", kv.read("applicationInfo"));
      res.ok ? toast(res.msg || "Application submitted ✓") : toast(res.msg || "Application failed", false);
    }
    async function submitPersonal(){
      const res = await authed(URLS.personalSubmit, "POST", kv.read("personalInfo"));
      res.ok ? toast(res.msg || "Personal submitted ✓") : toast(res.msg || "Personal failed", false);
    }
    async function submitOverview(){
      const res = await authed(URLS.overviewSubmit, "POST", null);
      res.ok ? toast(res.msg || "Overview submitted ✓") : toast(res.msg || "Overview failed", false);
    }
    async function sendPayOtp(resend=false){
      const resq = {resend: resend?1:0};
      const res = await authed(URLS.payOtpSend, "POST", resq);
      res.ok ? toast("Payment OTP sent") : toast(res.msg || "OTP send failed", false);
    }
    async function verifyPayOtp(){
      if(otpFlight){ toast("OTP verify in-progress", false); return; }
      const code = (document.querySelector(".alx-body input[placeholder^='Enter 6-digit Payment OTP']")||{}).value?.trim();
      if(!/^\d{6}$/.test(code || "")){ toast("Valid 6-digit OTP required", false); return; }
      otpFlight = true;
      try{
        const res = await authed(URLS.payOtpVerify, "POST", {otp: code});
        res.ok ? toast("Payment OTP verified ✓") : toast(res.msg || "OTP verify failed", false);
      } finally { otpFlight=false; }
    }

    return box;
  }

  function payView(){
    const box = document.createElement("div"); box.style.display="none";
    const date = input("mm/dd/yyyy","date");
    const rowA = row( button("GET SLOTS","b-blue", getSlots),
                      button("AUTO","b-orange", getSlots) );
    const rowB = row( button("PAY NOW","b-purple", payNow),
                      button("AUTO","b-orange", payNow) );
    const rowStop = row( button("STOP ALL","b-red", stopAll) );
    box.append( date, rowA, rowB, rowStop );

    async function getSlots(){
      const d = date.value; if(!d){ toast("Select date", false); return; }
      const res = await authed(URLS.slotTime, "POST", {appointment_date: d});
      if(res.ok){
        const times = res.data?.slot_times || [];
        toast(times.length? `Slots: ${times.join(", ")}` : "No slots", !!times.length);
        kv.write("lastSlots", {date:d, times});
      } else toast(res.msg || "Slot fetch failed", false);
    }

    async function payNow(){
      const d = date.value; if(!d){ toast("Select date", false); return; }
      const pick = (kv.read("lastSlots")?.times || [])[0] || "09:00 - 09:59";
      const payload = {
        appointment_date: d,
        appointment_time: pick,
        selected_payment: { name:"VISA", slug:"visacard", link:"https://securepay.sslcommerz.com/gwprocess/v4/image/gw1/visa.png" }
      };
      const res = await authed(URLS.payNow, "POST", payload);
      if(res.ok){
        const url = res.data?.data?.url; if(url) window.open(url, "_blank");
        toast("Payment init ✓");
      } else toast(res.msg || "Pay failed", false);
    }
    return box;
  }

  function row(...children){ const d=document.createElement("div"); d.className="alx-row"; children.forEach(c=>d.appendChild(c)); return d; }
  function button(txt, cls, fn){ const b=document.createElement("button"); b.className=`alx-btn ${cls}`; b.textContent=txt; b.onclick=fn; return b; }
  function input(ph, type="text"){ const i=document.createElement("input"); i.className="alx-input"; i.placeholder=ph; i.type=type; return i; }
  function tokenInput(){ const i=document.createElement("input"); i.className="alx-token"; i.placeholder="Enter Bearer Token"; return i; }

  // Add/Edit Data modal (simple)
  function openDataModal(){
    const modal = document.createElement("div"); modal.className="alx-modal";
    const card = document.createElement("div"); card.className="alx-modal-card"; modal.appendChild(card);
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
      const i = document.createElement("input"); i.className="alx-input"; i.placeholder=lab; i.value = kv.read("data."+k,"");
      inputs[k]=i; card.appendChild(i);
    });

    const save = button("Save Data","b-green",()=>{
      const data = {};
      Object.keys(inputs).forEach(k=> data[k]=inputs[k].value.trim());
      // Map to payload shapes
      const app = {
        highcom: data.highcom||"1",
        webfile_id: data.webfile_id||"",
        webfile_id_repeat: data.webfile_id||"",
        ivac_id: data.ivac_id||"",
        visa_type: data.visa_type||"",
        family_count: data.family_count||"0",
        visit_purpose: data.visit_purpose||""
      };
      const per = {
        full_name: data.full_name||"",
        email_name: data.email_name||"",
        phone: data.phone||"",
        webfile_id: data.webfile_id||""
      };
      kv.write("applicationInfo", app);
      kv.write("personalInfo", per);
      toast("Saved ✓");
      modal.remove();
    });
    card.appendChild(save);

    document.body.appendChild(modal);
  }

  /************** ROUTER **************/
  async function request(url, method="GET", body=null, auth=false){
    await backoffGuard(url);

    const sig = makeSig(url, method, body);
    if(dedupe.has(sig)){ return {ok:false, msg:"Duplicate request suppressed"}; }
    dedupe.add(sig); setTimeout(()=>dedupe.delete(sig), 800); // short de-dupe window

    const ac = new AbortController(); const id = `${Date.now()}-${Math.random()}`; active.set(id, ac);

    const headers = {
      "accept": "application/json",
      "content-type": "application/json",
      "language": "en"
    };
    if(auth && bearerToken){ headers["authorization"] = `Bearer ${bearerToken}`; }

    const opts = {
      method, headers, signal: ac.signal,
      credentials: "include",
      mode: "cors",
      referrerPolicy: "strict-origin-when-cross-origin"
    };
    if(body) opts.body = JSON.stringify(body);

    try{
      const res = await fetch(url, opts);
      active.delete(id);

      // CF/Rate-limit awareness (no bypass)
      if([403, 409, 419, 429, 503].includes(res.status)){
        noteFailure(url);
        if(res.status===429) setStatus("Rate limited. Retrying later…","#b45309");
        if(res.status===403 || res.status===503) setStatus("Challenge or server busy. Complete challenge/refresh then retry.", "#b91c1c");
        return {ok:false, status:res.status, msg:`HTTP ${res.status}`};
      }
      if(!res.ok){
        noteFailure(url);
        const txt = await res.text().catch(()=> "");
        return {ok:false, status:res.status, msg:txt||`HTTP ${res.status}`};
      }

      noteSuccess(url);
      const data = await res.json().catch(()=> ({}));
      const msg = data?.message || data?.msg || "OK";
      return {ok:true, data, msg};

    }catch(e){
      active.delete(id); noteFailure(url);
      return {ok:false, msg:e.message||"Network error"};
    }
  }

  function stopCurrent(){
    // Abort last controller if any (best-effort)
    const last = Array.from(active.values()).pop();
    if(last){ last.abort(); toast("Stopped current"); }
  }
  function stopAll(){
    active.forEach(ac=>ac.abort()); active.clear(); toast("Stopped all");
  }

  async function authed(url, method, body){
    if(!bearerToken){ toast("Bearer token missing", false); return {ok:false, msg:"No token"}; }
    return request(url, method, body, true);
  }

  /************** ENTRY **************/
  buildUI();

  // global keyboard: Alt+D to open data modal
  window.addEventListener("keydown", (e)=>{
    if(e.altKey && (e.key==="d" || e.key==="D")){ openDataModal(); }
  });

  // Quick action entry points if you want to trigger from console
  window.__IVAC__ = {
    openDataModal,
    stopAll
  };

})();
