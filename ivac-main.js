/* ivac-main.js — ALLEX IVAC Automation (Merged Final)
 * UI: Login | BGD & OTP | Payment — floating, draggable
 * Flows: mobile-verify → login/password or login-otp → token save
 *        application-info-submit → personal-info-submit → overview-submit
 *        pay-otp-sent → pay-otp-verify → pay-slot-time → pay-now
 * Safety: CORS-safe same-origin endpoints, form-POST (no preflight),
 *         per-origin backoff, single-flight OTP, request de-dupe, STOP ALL
 * Hotkeys: Alt + D → Add/Edit Data modal
 */

(() => {
  'use strict';

  /************** SAME-ORIGIN ENDPOINTS (CORS-SAFE) **************/
  const ORIGIN = "https://api-payment.ivacbd.com";

  const URLS = {
    // Auth
    mobileVerify: `${ORIGIN}/api/v2/mobile-verify`,
    login: `https://payment.ivacbd.com/api/v2/payment/login`,
    loginOtp: `https://payment.ivacbd.com/api/v2/payment/login-otp`,

    // Application
    applicationSubmit: `https://payment.ivacbd.com/api/v2/payment/application-info-submit`,
    personalSubmit: `https://payment.ivacbd.com/api/v2/payment/personal-info-submit`,
    overviewSubmit: `https://payment.ivacbd.com/api/v2/payment/overview-submit`,
    checkout: `https://payment.ivacbd.com/api/v2/payment/checkout`,

    // Payment + OTP
    payOtpSend: `https://payment.ivacbd.com/api/v2/payment/pay-otp-sent`,
    payOtpVerify: `https://payment.ivacbd.com/api/v2/payment/pay-otp-verify`,
    slotTime: `https://payment.ivacbd.com/api/v2/payment/pay-slot-time`,
    payNow: `https://payment.ivacbd.com/api/v2/payment/pay-now`
  };

  const UI_TXT = {
    title: "Allex@cyber2",
    v: "v4.1 | ALLEX | Updated" // UPDATE: Bumped version
  };

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
    remove(key){ const x=this.k; delete x[key]; this.k=x; },
  };

  let bearerToken = kv.read("bearerToken","");
  let active = new Map();
  let dedupe = new Set();
  const backoffMap = new Map();
  let otpFlight = false;

  function makeSig(url, method, body){ return `${method}:${url}:${body?JSON.stringify(body).slice(0,200):""}`; }
  function originOf(url){ try{ return new URL(url).origin; }catch{ return "default"; } }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function now(){ return Date.now(); }

  async function backoffGuard(url){
    const o = originOf(url); const ent = backoffMap.get(o);
    if (ent && ent.until && ent.until > now()){
      const wait = ent.until - now();
      setStatus(`Backoff ${Math.ceil(wait/1000)}s…`, "#c77d00");
      await sleep(wait);
    }
  }
  function noteFailure(url){
    const o = originOf(url); const ent = backoffMap.get(o) || {fail:0, until:0};
    ent.fail = Math.min(ent.fail+1, 4);
    const wait = Math.floor((2 ** ent.fail) * 200 + Math.random()*100);
    ent.until = now() + wait; backoffMap.set(o, ent);
  }
  function noteSuccess(url){ const o=originOf(url); backoffMap.set(o, {fail:0, until:0}); }

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
  .alx-modal-card{width:520px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb;position:relative}
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

  function makeDraggable(el, handle){
    let dragging=false, offX=0, offY=0;
    handle.addEventListener("mousedown", e=>{ dragging=true; const r=el.getBoundingClientRect(); offX = e.clientX - r.left; offY = e.clientY - r.top; e.preventDefault(); });
    document.addEventListener("mouseup", ()=>dragging=false);
    document.addEventListener("mousemove", e=>{
      if(!dragging) return; el.style.left = (e.clientX - offX) + "px"; el.style.top = (e.clientY - offY) + "px"; el.style.right="auto";
    });
  }

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

  function row(...children){ const d=document.createElement("div"); d.className="alx-row"; children.forEach(c=>d.appendChild(c)); return d; }
  function button(txt, cls, fn){ const b=document.createElement("button"); b.className=`alx-btn ${cls}`; b.textContent=txt; b.onclick=fn; return b; }
  function input(ph, type="text"){ const i=document.createElement("input"); i.className="alx-input"; i.placeholder=ph; i.type=type; return i; }
  function tokenInput(){ const i=document.createElement("input"); i.className="alx-token"; i.placeholder="Enter Bearer Token"; return i; }

  /************** FORM-POST helper (NO PREFLIGHT) **************/
  async function getCsrfToken() {
    try {
      const res = await fetch(`${ORIGIN}/csrf-token`, { credentials: "include" });
      const data = await res.json();
      return data.csrf_token || "";
    } catch (e) {
      console.error("CSRF token fetch failed:", e.message);
      return "";
    }
  }

  async function postForm(url, dataObj, includeAuth=false, method="POST") {
    await backoffGuard(url);
    let body;
    if (method === "POST") {
      body = JSON.stringify(dataObj || {});
    } else if (method === "GET") {
      body = undefined;
    }
    const headers = {
      "accept": "application/json",
      "content-type": method === "POST" ? "application/json" : undefined,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    if (includeAuth && bearerToken) headers["authorization"] = `Bearer ${bearerToken}`;
    const csrfToken = await getCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
    const sig = makeSig(url, method, dataObj);
    if (dedupe.has(sig)) {
      console.warn(`Duplicate request suppressed: ${sig}`);
      return { ok: false, msg: "Duplicate request suppressed" };
    }
    dedupe.add(sig); setTimeout(() => dedupe.delete(sig), 800);
    const ac = new AbortController();
    const id = `${Date.now()}-${Math.random()}`; active.set(id, ac);
    try {
      console.log(`Sending ${method} to ${url} with body:`, body || "N/A");
      const res = await fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
        redirect: "manual",
        signal: ac.signal
      });
      active.delete(id);
      console.log(`Response: ${res.status} ${res.statusText}`);
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        setStatus("Redirect detected → অন্য origin? Same-origin রাখো.", "#b45309");
        return { ok: false, msg: "redirect" };
      }
      if ([403, 419, 429, 503].includes(res.status)) {
        noteFailure(url);
        const text = await res.text();
        console.warn(`Error ${res.status}: ${text}`);
        if (res.status === 429) setStatus("Rate limited. Retrying later…", "#b45309");
        if (res.status === 403 || res.status === 419) setStatus("CF/Session challenge — পেজে যা চাইছে আগে সেটি কমপ্লিট করে আবার চেষ্টা করুন.", "#b91c1c");
        return { ok: false, msg: `HTTP ${res.status}: ${text}` };
      }
      if (!res.ok || res.status !== 200) {
        noteFailure(url);
        const text = await res.text();
        console.warn(`Error ${res.status}: ${text}`);
        return { ok: false, msg: `HTTP ${res.status}: ${text}` };
      }
      noteSuccess(url);
      const data = await res.json().catch((e) => {
        console.error(`JSON parse error: ${e.message}`);
        return {};
      });
      console.log(`Response data:`, data);
      return { ok: true, data, msg: data?.message || data?.msg || "OK" };
    } catch (e) {
      active.delete(id); noteFailure(url);
      console.error(`Fetch error: ${e.message}`);
      return { ok: false, msg: e.message || "Network/CORS" };
    }
  }

  function stopCurrent(){
    const last = Array.from(active.values()).pop();
    if (last){ last.abort(); toast("Stopped current"); }
  }
  function stopAll(){ active.forEach(ac=>ac.abort()); active.clear(); toast("Stopped all"); }

  /************** VIEWS **************/
  function loginView(){
    const box = document.createElement("div");

    const ready = input("Ready"); ready.disabled = true;
    const mobile = input("Enter mobile number (e.g., 01783035512 or +8801712345678)");
    const captcha = input("Enter CAPTCHA token (leave blank if manual)");
    const pass = input("Enter password", "password");
    const otp = input("Enter 6-digit OTP");

    const row1 = row(
      button("SEND VERIFICATION", "b-green", onMobileVerify),
      button("SEND (GET)", "b-orange", () => onMobileVerifyWithMethod("GET"))
    );
    const row2 = row(
      button("LOGIN WITH PASSWORD", "b-blue", onLoginWithPassword),
      button("AUTO", "b-orange", onLoginWithPassword)
    );
    const row3 = row(
      button("LOGIN WITH OTP", "b-purple", onLoginWithOtp),
      button("AUTO", "b-orange", onLoginWithOtp)
    );
    const copyBtn = button("COPY ACCESS TOKEN", "b-purple", () => {
      navigator.clipboard.writeText(bearerToken || "");
      toast("Access token copied");
    });
    const rowStop = row(
      button("STOP CURRENT", "b-red", stopCurrent),
      button("STOP ALL", "b-red", stopAll)
    );

    box.append(ready, mobile, captcha, row1, pass, row2, otp, row3, copyBtn, rowStop);

    async function onMobileVerify(){
      let num = mobile.value.trim();
      const capToken = captcha.value.trim() || "";
      // Ensure 11-digit format if no country code
      if (!num.startsWith("+880") && /^\d{11}$/.test(num)) {
        num = `+880${num.slice(2)}`; // Convert 01712345678 to +8801712345678
      }
      console.log(`Mobile input: ${num}, CAPTCHA token: ${capToken}`);
      if (!/^\+?\d{10,12}$/.test(num)) { toast("Invalid mobile number (10-12 digits or +880)", false); return; }
      setStatus("Sending verification (POST)...");
      const res = await postForm(URLS.mobileVerify, { mobile_no: num, captcha_token: capToken }); // UPDATE: Preserve full number
      handleResponse(res);
    }

    async function onMobileVerifyWithMethod(method){
      let num = mobile.value.trim();
      const capToken = captcha.value.trim() || "";
      if (!num.startsWith("+880") && /^\d{11}$/.test(num)) {
        num = `+880${num.slice(2)}`;
      }
      console.log(`Mobile input: ${num}, CAPTCHA token: ${capToken}, Method: ${method}`);
      if (!/^\+?\d{10,12}$/.test(num)) { toast("Invalid mobile number (10-12 digits or +880)", false); return; }
      setStatus(`Sending verification (${method})...`);
      const res = await postForm(URLS.mobileVerify, { mobile_no: num, captcha_token: capToken }, false, method);
      handleResponse(res);
    }

    async function onLoginWithPassword(){
      let num = mobile.value.trim(), pw = pass.value;
      if (!num.startsWith("+880") && /^\d{11}$/.test(num)) {
        num = `+880${num.slice(2)}`;
      }
      console.log(`Mobile: ${num}, Password: ${pw}`);
      if (!/^\+?\d{10,12}$/.test(num) || !pw) { toast("Mobile/password required", false); return; }
      setStatus("Logging in with password...");
      const res = await postForm(URLS.login, { mobile_no: num, password: pw });
      if (res.ok) {
        bearerToken = res.data?.access_token || res.data?.token || "";
        kv.write("bearerToken", bearerToken);
        toast("Logged in (password) ✓");
      } else toast(res.msg || "Login failed", false);
    }
    async function onLoginWithOtp(){
      if (otpFlight) { toast("OTP verify in-progress", false); return; }
      let num = mobile.value.trim(), code = otp.value.trim();
      if (!num.startsWith("+880") && /^\d{11}$/.test(num)) {
        num = `+880${num.slice(2)}`;
      }
      console.log(`Mobile: ${num}, OTP: ${code}`);
      if (!/^\+?\d{10,12}$/.test(num) || !/^\d{6}$/.test(code)) { toast("Mobile/OTP required", false); return; }
      otpFlight = true;
      setStatus("Verifying OTP...");
      try {
        const res = await postForm(URLS.loginOtp, { mobile_no: num, otp_code: code });
        if (res.ok) {
          bearerToken = res.data?.access_token || res.data?.token || "";
          kv.write("bearerToken", bearerToken);
          toast("OTP verified! Token saved ✓");
        } else toast(res.msg || "OTP failed", false);
      } finally { otpFlight = false; }
    }

    function handleResponse(res) {
      if (res.msg.includes("403") || res.msg.includes("419")) {
        toast("CAPTCHA required. Complete it in the browser first and paste token.", false);
        window.open(URLS.mobileVerify, "_blank");
      } else {
        res.ok ? toast("Verification sent") : toast(res.msg || "Failed", false);
      }
    }

    return box;
  }

  function bgdView(){
    const box = document.createElement("div"); box.style.display="none";

    const note = input("Ready for BGD form submission"); note.disabled = true;
    const tokenInp = tokenInput(); tokenInp.value = bearerToken;
    tokenInp.oninput = () => { bearerToken = tokenInp.value.trim(); kv.write("bearerToken", bearerToken); };

    const rowA = row(
      button("APPLICATION", "b-blue", submitApplication),
      button("PERSONAL", "b-green", submitPersonal)
    );
    const rowB = row(
      button("OVERVIEW", "b-purple", submitOverview),
      button("SEND OTP", "b-orange", () => sendPayOtp(false))
    );
    const otpInp = input("Enter 6-digit Payment OTP");
    const rowC = row(
      button("RESEND OTP", "b-blue", () => sendPayOtp(true)),
      button("AUTO", "b-orange", () => sendPayOtp(true))
    );
    const rowD = row(
      button("VERIFY OTP", "b-purple", verifyPayOtp),
      button("AUTO", "b-orange", verifyPayOtp)
    );
    const editBtn = button("ADD/EDIT DATA", "b-purple", openDataModal);
    const stopBtn = button("STOP ALL", "b-red", stopAll);

    box.append(note, tokenInp, rowA, rowB, otpInp, rowC, rowD, editBtn, stopBtn);

    async function submitApplication(){
      const res = await postForm(URLS.applicationSubmit, kv.read("applicationInfo"), true);
      res.ok ? toast(res.msg || "Application submitted ✓") : toast(res.msg || "Application failed", false);
    }
    async function submitPersonal(){
      const res = await postForm(URLS.personalSubmit, kv.read("personalInfo"), true);
      res.ok ? toast(res.msg || "Personal submitted ✓") : toast(res.msg || "Personal failed", false);
    }
    async function submitOverview(){
      const res = await postForm(URLS.overviewSubmit, {}, true);
      res.ok ? toast(res.msg || "Overview submitted ✓") : toast(res.msg || "Overview failed", false);
    }
    async function sendPayOtp(resend=false){
      const res = await postForm(URLS.payOtpSend, { resend: resend ? 1 : 0 }, true);
      res.ok ? toast("Payment OTP sent") : toast(res.msg || "OTP send failed", false);
    }
    async function verifyPayOtp(){
      if (otpFlight) { toast("OTP verify in-progress", false); return; }
      const code = otpInp.value.trim();
      if (!/^\d{6}$/.test(code)) { toast("Valid 6-digit OTP required", false); return; }
      otpFlight = true;
      try {
        const res = await postForm(URLS.payOtpVerify, { otp: code }, true);
        res.ok ? toast("Payment OTP verified ✓") : toast(res.msg || "OTP verify failed", false);
      } finally { otpFlight = false; }
    }

    return box;
  }

  function payView(){
    const box = document.createElement("div"); box.style.display="none";

    const note = input("Ready for payment"); note.disabled = true;
    const date = input("mm/dd/yyyy", "date");
    const rowA = row(
      button("GET SLOTS", "b-blue", getSlots),
      button("AUTO", "b-orange", getSlots)
    );
    const rowB = row(
      button("PAY NOW", "b-purple", payNow),
      button("AUTO", "b-orange", payNow)
    );
    const stopBtn = button("STOP ALL", "b-red", stopAll);

    box.append(note, date, rowA, rowB, stopBtn);

    async function getSlots(){
      const d = date.value; if (!d) { toast("Select date", false); return; }
      const res = await postForm(URLS.slotTime, { appointment_date: d }, true);
      if (res.ok) {
        const times = res.data?.slot_times || [];
        toast(times.length ? `Slots: ${times.join(", ")}` : "No slots", !!times.length);
        kv.write("lastSlots", { date: d, times });
      } else toast(res.msg || "Slot fetch failed", false);
    }

    async function payNow(){
      const d = date.value; if (!d) { toast("Select date", false); return; }
      const pick = (kv.read("lastSlots")?.times || [])[0] || "09:00 - 09:59";
      const payload = {
        appointment_date: d,
        appointment_time: pick,
        selected_payment: { name: "VISA", slug: "visacard", link: "https://securepay.sslcommerz.com/gwprocess/v4/image/gw1/visa.png" }
      };
      const res = await postForm(URLS.payNow, payload, true);
      if (res.ok) {
        const url = res.data?.data?.url; if (url) window.open(url, "_blank");
        toast("Payment init ✓");
      } else toast(res.msg || "Pay failed", false);
    }

    return box;
  }

  /************** DATA MODAL (Add/Edit) **************/
  function openDataModal(){
    const modal = document.createElement("div"); modal.className="alx-modal";
    const card = document.createElement("div"); card.className="alx-modal-card"; modal.appendChild(card);
    const title = document.createElement("div"); title.className="alx-modal-title"; title.textContent="Custom Data Input"; card.appendChild(title);
    const x = document.createElement("div"); x.className="alx-x"; x.textContent="✕"; card.appendChild(x); x.onclick=()=>modal.remove();

    const fields = [
      ["highcom", "Application Info → highcom"],
      ["webfile_id", "Application Info → webfile_id"],
      ["ivac_id", "Application Info → ivac_id"],
      ["visa_type", "Application Info → visa_type"],
      ["family_count", "Application Info → family_count"],
      ["visit_purpose", "Application Info → visit_purpose"],
      ["full_name", "Personal → full_name"],
      ["email_name", "Personal → email"],
      ["phone", "Personal → phone"],
    ];
    const inputs = {};
    fields.forEach(([k, lab]) => {
      const i = document.createElement("input"); i.className="alx-input"; i.placeholder=lab; i.value = kv.read("data."+k, "");
      inputs[k] = i; card.appendChild(i);
    });

    const save = button("Save Data", "b-green", () => {
      const data = {};
      Object.keys(inputs).forEach(k => data[k] = inputs[k].value.trim());
      const app = {
        highcom: data.highcom || "1",
        webfile_id: data.webfile_id || "",
        webfile_id_repeat: data.webfile_id || "",
        ivac_id: data.ivac_id || "",
        visa_type: data.visa_type || "",
        family_count: data.family_count || "0",
        visit_purpose: data.visit_purpose || ""
      };
      const per = {
        full_name: data.full_name || "",
        email_name: data.email_name || "",
        phone: data.phone || "",
        webfile_id: data.webfile_id || ""
      };
      kv.write("applicationInfo", app);
      kv.write("personalInfo", per);
      toast("Saved ✓");
      modal.remove();
    });
    card.appendChild(save);
    document.body.appendChild(modal);
  }

  /************** ENTRY **************/
  buildUI();

  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D")) { openDataModal(); }
  });

  window.__IVAC__ = { openDataModal, stopAll };
})();
