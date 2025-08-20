/* ivac-main.js — ALLEX Final IVAC Automation
 * Features:
 * - Branding: ALLEX Final
 * - Password prompt removed
 * - Retry logic (7s interval toggle)
 * - Payload intact (Application, Personal, Overview)
 * - Capsolver API integration
 */

(() => {
  'use strict';

  /************** CONFIG **************/
  const ORIGIN = location.origin;
  const ROUTE_BASES = [
    `${ORIGIN}/api/v2/payment`,
    `${ORIGIN}/api/payment`,
    `${ORIGIN}/api/v2`,
  ];
  const CAPSOLVER_API_KEY = "CAP-84E9E9556FDC819C391840509EC863A076F57FF6ED95A460A94640FCA43D50BC"; // <-- এখানে API key বসাবে

  const EP = (base) => ({
    mobileVerify:  `${base}/mobile-verify`,
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

  /************** STORAGE **************/
  const kv = {
    get k(){ return JSON.parse(localStorage.getItem("ivac_kv") || "{}"); },
    set k(v){ localStorage.setItem("ivac_kv", JSON.stringify(v || {})); },
    read(path, def=null){ return (this.k[path] ?? def); },
    write(key, val){ const x=this.k; x[key]=val; this.k=x; },
  };

  let bearerToken = kv.read("bearerToken","");
  let retryTimer = null;

  /************** PAYLOAD **************/
  const payloadData = {
    applicationInfo: {
      highcom: "3",
      webfile_id: "BGDRV62DB025",
      webfile_id_repeat: "BGDRV62DB025",
      jvac_id: "2",
      visa_type: "6",
      family_count: "0",
      visit_purpose: "Person of indian origin and spouse"
    },
    personalInfo: {
      full_name: "JOYA DAS",
      email_name: "dmjesmin.bd@gmail.com",
      phone: "01783805512",
      webfile_id: "BGDRV62DB025",
      family: [
        { name: "MOMOTA RANI SAHA", webfile_no: "BGDRV5EE1D25" },
        { name: "SHAMO SAHA", webfile_no: "BGDRV5EE3725" },
        { name: "SHUKLA SAHA", webfile_no: "BGDRV5EDF A25" },
        { name: "MD ABDUR RAHMAN", webfile_no: "BGDRV5EE0825" }
      ]
    },
    overview: {
      mobile_no: "01783805512"
    }
  };

  /************** FETCH **************/
  async function postFormMulti(kind, data={}, includeAuth=false){
    const body = new URLSearchParams();
    Object.entries(data).forEach(([k,v])=> body.append(k, v ?? ""));
    const headers = { accept: "application/json" };
    if (includeAuth && bearerToken) headers.authorization = `Bearer ${bearerToken}`;
    for (const base of ROUTE_BASES) {
      const url = EP(base)[kind];
      try{
        const res = await fetch(url, { method:"POST", headers, body, credentials:"include" });
        if (!res.ok) continue;
        const json = await res.json().catch(()=> ({}));
        return {ok:true, data:json, msg: json?.message||json?.msg||"OK"};
      }catch(e){ continue; }
    }
    return {ok:false,msg:"Failed"};
  }

  /************** RETRY **************/
  function startRetry(fn){
    if(retryTimer) return;
    retryTimer = setInterval(fn, 7000);
  }
  function stopRetry(){
    if(retryTimer){ clearInterval(retryTimer); retryTimer=null; }
  }

  /************** CAPSOLVER **************/
  async function solveCaptcha(sitekey, url){
    if (!CAPSOLVER_API_KEY || CAPSOLVER_API_KEY.startsWith("PUT-")) {
      alert("Set your CAPSOLVER_API_KEY in script!");
      return;
    }
    const task = {
      clientKey: CAPSOLVER_API_KEY,
      task: { type:"AntiTurnstileTaskProxyLess", websiteURL:url, websiteKey:sitekey }
    };
    const create = await fetch("https://api.capsolver.com/createTask", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(task)
    }).then(r=>r.json());
    if(!create.taskId) return null;

    let token=null;
    for(let i=0;i<15;i++){
      await new Promise(r=>setTimeout(r,3000));
      const res = await fetch("https://api.capsolver.com/getTaskResult",{
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ clientKey:CAPSOLVER_API_KEY, taskId:create.taskId })
      }).then(r=>r.json());
      if(res.status==="ready"){ token=res.solution.token; break; }
    }
    if(token){ kv.write("captchaToken",token); alert("Captcha solved"); }
    return token;
  }

  /************** UI **************/
  function injectUI(){
    const root = document.createElement("div");
    root.style.position="fixed"; root.style.top="20px"; root.style.right="20px"; root.style.zIndex=999999;
    root.innerHTML = `
      <div style="width:320px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;font-family:sans-serif">
        <div style="padding:10px;background:#0b285a;color:#fff;font-weight:bold;text-align:center">ALLEX Final</div>
        <div id="alx-tabs" style="display:flex;border-bottom:1px solid #eee">
          <div id="tab-login" style="flex:1;padding:8px;text-align:center;cursor:pointer;font-weight:600;border-bottom:3px solid #2563eb;color:#2563eb">Login</div>
          <div id="tab-app" style="flex:1;padding:8px;text-align:center;cursor:pointer;font-weight:600;color:#6b7280">Application</div>
        </div>
        <div id="view-login" style="padding:12px">
          <input id="mobile" placeholder="Mobile Number" style="width:100%;margin:4px 0;padding:8px;border:1px solid #ccc;border-radius:6px">
          <input id="otp" placeholder="OTP Code" style="width:100%;margin:4px 0;padding:8px;border:1px solid #ccc;border-radius:6px">
          <button id="btn-send" style="width:100%;padding:8px;margin:4px 0;background:#2563eb;color:#fff;border:0;border-radius:6px">Send OTP</button>
          <button id="btn-login" style="width:100%;padding:8px;margin:4px 0;background:#10b981;color:#fff;border:0;border-radius:6px">Login</button>
          <button id="btn-retry" style="width:100%;padding:8px;margin:4px 0;background:#f59e0b;color:#fff;border:0;border-radius:6px">Start Retry</button>
          <button id="btn-stop" style="width:100%;padding:8px;margin:4px 0;background:#ef4444;color:#fff;border:0;border-radius:6px">Stop Retry</button>
        </div>
        <div id="view-app" style="padding:12px;display:none">
          <button id="btn-app" style="width:100%;padding:8px;margin:4px 0;background:#2563eb;color:#fff;border:0;border-radius:6px">App Info</button>
          <button id="btn-per" style="width:100%;padding:8px;margin:4px 0;background:#10b981;color:#fff;border:0;border-radius:6px">Personal Info</button>
          <button id="btn-over" style="width:100%;padding:8px;margin:4px 0;background:#8b5cf6;color:#fff;border:0;border-radius:6px">Overview</button>
          <button id="btn-cf" style="width:100%;padding:8px;margin:4px 0;background:#f59e0b;color:#fff;border:0;border-radius:6px">CF Solve</button>
          <button id="btn-sendpay" style="width:100%;padding:8px;margin:4px 0;background:#f59e0b;color:#fff;border:0;border-radius:6px">Send OTP</button>
          <button id="btn-verify" style="width:100%;padding:8px;margin:4px 0;background:#059669;color:#fff;border:0;border-radius:6px">Verify OTP</button>
          <button id="btn-slots" style="width:100%;padding:8px;margin:4px 0;background:#2563eb;color:#fff;border:0;border-radius:6px">Get Slots</button>
          <button id="btn-pay" style="width:100%;padding:8px;margin:4px 0;background:#16a34a;color:#fff;border:0;border-radius:6px">Pay Now</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    // Tabs
    document.getElementById("tab-login").onclick=()=>{
      document.getElementById("view-login").style.display="block";
      document.getElementById("view-app").style.display="none";
      document.getElementById("tab-login").style.color="#2563eb";
      document.getElementById("tab-app").style.color="#6b7280";
    };
    document.getElementById("tab-app").onclick=()=>{
      document.getElementById("view-login").style.display="none";
      document.getElementById("view-app").style.display="block";
      document.getElementById("tab-app").style.color="#2563eb";
      document.getElementById("tab-login").style.color="#6b7280";
    };

    // Buttons
    document.getElementById("btn-send").onclick=async()=>{
      const m=document.getElementById("mobile").value.trim();
      await postFormMulti("mobileVerify",{mobile_no:m});
    };
    document.getElementById("btn-login").onclick=async()=>{
      const m=document.getElementById("mobile").value.trim();
      const o=document.getElementById("otp").value.trim();
      const r=await postFormMulti("loginOtp",{mobile_no:m,otp:o});
      if(r.ok){ bearerToken=r.data.access_token; kv.write("bearerToken",bearerToken); stopRetry(); alert("Login success"); }
      else alert("Login failed");
    };
    document.getElementById("btn-retry").onclick=()=>startRetry(()=>document.getElementById("btn-login").click());
    document.getElementById("btn-stop").onclick=stopRetry;

    document.getElementById("btn-app").onclick=()=>postFormMulti("appSubmit",payloadData.applicationInfo,true);
    document.getElementById("btn-per").onclick=()=>postFormMulti("perSubmit",payloadData.personalInfo,true);
    document.getElementById("btn-over").onclick=()=>postFormMulti("overview",payloadData.overview,true);
    document.getElementById("btn-cf").onclick=()=>solveCaptcha("0x4AAAAAAABbbbbbcccddd", location.href); // <-- sitekey change
    document.getElementById("btn-sendpay").onclick=()=>postFormMulti("payOtpSend",{},true);
    document.getElementById("btn-verify").onclick=()=>{
      const o=prompt("Enter Payment OTP:");
      return postFormMulti("payOtpVerify",{otp:o},true);
    };
    document.getElementById("btn-slots").onclick=()=>{
      const d=prompt("Enter date mm/dd/yyyy:");
      return postFormMulti("slotTime",{appointment_date:d},true);
    };
    document.getElementById("btn-pay").onclick=()=>{
      const d=prompt("Enter date mm/dd/yyyy:");
      return postFormMulti("payNow",{appointment_date:d},true);
    };
  }

  /************** INIT **************/
  injectUI();
})();
