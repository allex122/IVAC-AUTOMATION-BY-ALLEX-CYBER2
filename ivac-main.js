// ==UserScript==
// @name         IVAC Loader (ALLEX Final 3D)
// @namespace    allex.ivac
// @version      3.5.0
// @description  ALLEX IVAC Automation (Repo ready, Retry + Capsolver + 3D UI)
// @match        https://payment.ivacbd.com/*
// @match        https://www.ivacbd.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /************** BRANDING **************/
  const BRAND = { title: "ALLEX", ver: "v3.5" };

  /************** CAPSOLVER CONFIG **************/
  const CAPSOLVER_API_KEY = "CAP-84E9E9556FDC819C391840509EC863A076F57FF6ED95A460A94640FCA43D50BC"; // তোমার Capsolver key বসাও
  const TS_KEY = "ivac_turnstile_token";

  async function solveCaptcha(siteKey, url) {
    try {
      const taskRes = await fetch("https://api.capsolver.com/createTask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientKey: CAPSOLVER_API_KEY,
          task: { type: "AntiTurnstileTaskProxyLess", websiteKey: siteKey, websiteURL: url }
        })
      }).then(r => r.json());

      if (!taskRes.taskId) throw new Error("Task create failed");

      let token = null;
      for (let i = 0; i < 20; i++) {
        await sleep(5000);
        const res = await fetch("https://api.capsolver.com/getTaskResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey: CAPSOLVER_API_KEY, taskId: taskRes.taskId })
        }).then(r => r.json());
        if (res.status === "ready" && res.solution?.token) {
          token = res.solution.token;
          break;
        }
      }

      if (token) {
        localStorage.setItem(TS_KEY, token);
        toast("Captcha solved ✔");
        return token;
      } else {
        toast("Captcha solve failed", false);
        return null;
      }
    } catch (e) {
      toast("Capsolver error: " + e.message, false);
      return null;
    }
  }

  /************** ROUTING **************/
  const ORIGIN = location.origin;
  const ROUTE_BASES = [
    `${ORIGIN}/api/v2/payment`,
    `${ORIGIN}/api/payment`,
    `${ORIGIN}/api/v2`,
  ];
  const EP = (base) => ({
    mobileVerify: `${base}/mobile-verify`,
    loginOtp: `${base}/login-otp`,
    appSubmit: `${base}/application-info-submit`,
    perSubmit: `${base}/personal-info-submit`,
    overview: `${base}/overview-submit`,
    slotTime: `${base}/pay-slot-time`,
    payOtpSend: `${base}/pay-otp-sent`,
    payOtpVerify: `${base}/pay-otp-verify`,
    payNow: `${base}/pay-now`,
    checkout: `${base}/checkout`,
  });

  /************** STATE **************/
  let bearerToken = "";
  let statusEl;
  let retryEnabled = false;
  let retryTimer = null;
  let otpFlight = false;

  /************** UTILS **************/
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function toast(msg, ok = true) {
    const t = document.createElement("div");
    t.className = "alx-toast";
    t.textContent = msg;
    t.style.background = ok ? "linear-gradient(135deg,#059669,#065f46)" : "linear-gradient(135deg,#b91c1c,#7f1d1d)";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function setStatus(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      if (color) statusEl.style.color = color;
    }
  }

  /************** RETRY **************/
  async function makeRequest(kind, data, includeAuth = false) {
    const body = new URLSearchParams();
    Object.entries(data || {}).forEach(([k, v]) => body.append(k, v ?? ""));
    const headers = { accept: "application/json" };
    if (includeAuth && bearerToken) headers.authorization = `Bearer ${bearerToken}`;

    let lastErr = null;
    for (const base of ROUTE_BASES) {
      const url = EP(base)[kind];
      try {
        const res = await fetch(url, { method: "POST", headers, body, credentials: "include" });
        if (!res.ok) { lastErr = { ok: false, msg: "HTTP " + res.status }; continue; }
        const json = await res.json().catch(() => ({}));
        toast("✔ Success " + kind);
        stopRetry();
        return { ok: true, data: json };
      } catch (e) {
        lastErr = { ok: false, msg: e.message || "Network" };
      }
    }
    toast("✖ Failed " + kind, false);
    return lastErr || { ok: false };
  }

  function startRetry(kind, data, includeAuth = false) {
    if (retryTimer) stopRetry();
    retryEnabled = true;
    retryTimer = setInterval(() => {
      if (retryEnabled) makeRequest(kind, data, includeAuth);
    }, 7000);
    toast("Retry started (" + kind + ")");
  }
  function stopRetry() {
    retryEnabled = false;
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    toast("Retry stopped");
  }

  /************** PAYLOAD DATA **************/
  const payloadData = {
    applicationInfo: {
      highcom: "3",
      webfile_id: "BGDRV62D0B25",
      webfile_id_repeat: "BGDRV62D0B25",
      ivac_id: "2",
      visa_type: "6",
      family_count: "0",
      visit_purpose: "Person of indian origin and spouse"
    },
    personalInfo: {
      full_name: "JOYA DAS",
      email_name: "dmjjesmin.bd@gmail.com",
      phone: "01783035512",
      webfile_id: "BGDRV62D0B25"
    },
    sendOtp: { mobile_no: "01783035512" }
  };

  /************** 3D CSS **************/
  function injectCSS() {
    if (document.getElementById("alx-style")) return;
    const st = document.createElement("style");
    st.id = "alx-style";
    st.textContent = `
      .alx-root { position: fixed; right: 20px; top: 20px; z-index: 999999; font-family: Inter,Segoe UI,Roboto,sans-serif; }
      .alx-card { width: 440px; background: rgba(255,255,255,0.95); border-radius: 16px; box-shadow: 0 15px 35px rgba(0,0,0,.25); backdrop-filter: blur(12px); overflow: hidden; }
      .alx-head { padding: 12px 16px; background: linear-gradient(135deg,#0b285a,#123c85); color: #fff; font-weight: 800; font-size: 18px; text-align: center; cursor: move; user-select: none; }
      .alx-tabs { display: flex; border-bottom: 1px solid #eee; }
      .alx-tab { flex: 1; text-align: center; padding: 12px; cursor: pointer; font-weight: 600; color: #6b7280; transition: all .25s ease; }
      .alx-tab.active { color: #2563eb; border-bottom: 4px solid #2563eb; background: linear-gradient(to top,#f3f4f6,#fff); box-shadow: 0 4px 12px rgba(37,99,235,.3); }
      .alx-body { padding: 18px; }
      .alx-status { padding: 10px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 12px; text-align: center; font-size: 14px; font-weight: 600; background: linear-gradient(to right,#f9fafb,#fff); }
      .alx-input { width: 100%; padding: 11px; border: 1px solid #e5e7eb; border-radius: 10px; margin: 7px 0; font-size: 14px; background: #fff; box-shadow: inset 0 2px 4px rgba(0,0,0,.05); }
      .alx-row { display: flex; gap: 5%; margin: 10px 0; }
      .alx-btn { flex: 1; padding: 11px 14px; border: 0; border-radius: 12px; color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 5px 12px rgba(0,0,0,.2); transition: transform .15s, box-shadow .2s; }
      .alx-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,.3); }
      .alx-btn:active { transform: translateY(2px); box-shadow: 0 3px 6px rgba(0,0,0,.2) inset; }
      .b-blue{background:linear-gradient(135deg,#3b82f6,#2563eb);}
      .b-green{background:linear-gradient(135deg,#10b981,#059669);}
      .b-purple{background:linear-gradient(135deg,#8b5cf6,#7c3aed);}
      .b-orange{background:linear-gradient(135deg,#f59e0b,#d97706);}
      .b-red{background:linear-gradient(135deg,#ef4444,#b91c1c);}
      .alx-footer { padding: 10px 16px; color: #6b7280; font-size: 12px; border-top: 1px solid #eee; text-align: center; background: #f9fafb; }
      .alx-toast { position: fixed; left: 20px; bottom: 20px; background: #111; color: #fff; padding: 12px 16px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,.3); z-index: 100000; }
    `;
    document.head.appendChild(st);
  }

  /************** UI BUILD **************/
  function injectUI() {
    injectCSS();

    const root = document.createElement("div");
    root.className = "alx-root";

    const card = document.createElement("div");
    card.className = "alx-card";
    root.appendChild(card);

    const head = document.createElement("div");
    head.className = "alx-head";
    head.textContent = BRAND.title;
    card.appendChild(head);

    const tabs = document.createElement("div");
    tabs.className = "alx-tabs";
    card.appendChild(tabs);

    const tLogin = tabEl("Login");
    const tBGD   = tabEl("BGD & OTP");
    const tPay   = tabEl("Payment");
    tabs.append(tLogin,tBGD,tPay);

    const body = document.createElement("div");
    body.className = "alx-body";
    card.appendChild(body);

    statusEl = document.createElement("div");
    statusEl.className = "alx-status";
    statusEl.textContent = "Ready";
    body.appendChild(statusEl);

    const viewLogin = loginView();
    const viewBGD   = bgdView();
    const viewPay   = payView();
    body.append(viewLogin, viewBGD, viewPay);
    switchTab(0);

    const footer = document.createElement("div");
    footer.className = "alx-footer";
    footer.textContent = `${BRAND.ver}`;
    card.appendChild(footer);

    document.body.appendChild(root);

    function tabEl(txt){ const d=document.createElement("div"); d.className="alx-tab"; d.textContent=txt; d.onclick=()=>switchTab([tLogin,tBGD,tPay].indexOf(d)); return d; }
    function switchTab(i){ [tLogin,tBGD,tPay].forEach((t,idx)=> t.classList.toggle("active", idx===i)); [viewLogin,viewBGD,viewPay].forEach((v,idx)=> v.style.display = idx===i? "block":"none"); }
  }

  /************** VIEWS (simplified) **************/
  function loginView(){
    const box=document.createElement("div");
    const btn1=button("AUTO SOLVE CAPTCHA","b-purple",async()=>{
      const widget=document.querySelector(".cf-turnstile");const siteKey=widget?.getAttribute("data-sitekey")||"";if(!siteKey){toast("Sitekey not found",false);return;}await solveCaptcha(siteKey,location.href);
    });
    box.append(btn1);
    return box;
  }
  function bgdView(){
    const box=document.createElement("div"); box.style.display="none";
    const btn=button("START RETRY APP","b-green",()=>startRetry("appSubmit",payloadData.applicationInfo,true));
    const stop=button("STOP RETRY","b-red",stopRetry);
    box.append(btn,stop);
    return box;
  }
  function payView(){
    const box=document.createElement("div"); box.style.display="none";
    const btn=button("PAY NOW","b-purple",()=>makeRequest("payNow",{ appointment_date:"08/25/2025", appointment_time:"09:00 - 09:59" },true));
    box.append(btn);
    return box;
  }

  function button(txt,cls,fn){ const b=document.createElement("button"); b.className="alx-btn "+cls; b.textContent=txt; b.onclick=fn; return b; }

  /************** ENTRY **************/
  injectUI();

})();
