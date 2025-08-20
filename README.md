# 🇧🇩 IVAC Automation – ALLEX Final

**ALLEX Cyber2** দ্বারা তৈরি করা IVAC Automation Userscript।  
এটি একটি Tampermonkey script যা payment.ivacbd.com এবং ivacbd.com সাইটে **automation** + **retry** + **captcha solve** + **3D floating UI** সুবিধা যোগ করে।  

---

## ✨ Features
- 🏷 **Branding** → ALLEX (floating panel, footer, title সব জায়গায়)   
- ♻ **Retry system** → auto retry প্রতি **7 সেকেন্ড** পর পর (ON/OFF toggle + STOP button)  
- 🤖 **Captcha Auto Solve** → [Capsolver](https://capsolver.com/) API দিয়ে Turnstile bypass  
- 📌 **Floating draggable panel** with **3D UI**  
  - Tabs: **Login | BGD & OTP | Payment**  
- 📦 **Payload system intact** → applicationInfo, personalInfo, sendOtp ডাটা সেভ থাকবে  
- ⌨️ Hotkey: (Alt+D → Data modal)  

---

## ⚙️ Setup

### 1. Install Tampermonkey
- Chrome → [Tampermonkey Extension](https://www.tampermonkey.net/)  
- Firefox → [Tampermonkey Addon](https://addons.mozilla.org/firefox/addon/tampermonkey/)  

### 2. Add Userscript
- Repo থেকে **`ivac-userscript.user.js`** ফাইল ওপেন করে → Raw এ ক্লিক → Install  

```js
// ==UserScript==
// @name         IVAC Loader (ALLEX Final 3D)
// ...
// @match        https://payment.ivacbd.com/*
// @match        https://www.ivacbd.com/*
// ==/UserScript==
