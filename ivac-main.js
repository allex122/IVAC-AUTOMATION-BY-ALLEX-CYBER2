// ==UserScript==
// @name         IVAC SUPPORT GROUP
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  IVAC Login and Application Helper with Persistent Login, Profile Display, and Auto Token Detection (Cloudflare Auto-Solve with CapSolver)
// @author       Ariful
// @match        https://payment.ivacbd.com/*
// @match        https://www.ivacbd.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @icon         https://www.ivacbd.com/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // --- Global Variables & Configuration ---
    const API_BASE_URL = "https://api-payment.ivacbd.com/api/v2";
    const CAPSOLVER_API_KEY = "CAP-84E9E9556FDC819C391840509EC863A076F57FF6ED95A460A94640FCxxxxxxxxxxx"; // Use your CapSolver API key here

    let hashParam = null;
    let captcha_token = null; // For storing the captcha token
    let lastKnownToken = ''; // Last used access token
    let capturedTokenBeforePanel = null; // For capturing token before the panel loads

    // --- Payload Data for Application Tab ---
    const payloadData = {
        applicationInfo: {
            "highcom": "3",
            "webfile_id": "BGDRV62DB025",
            "webfile_id_repeat": "BGDRV62DB025",
            "ivac_id": "2",
            "visa_type": "6",
            "family_count": "0",
            "visit_purpose": "Persion of indian origin and spouse"
        },
        personalInfo: {
            "full_name": "JOYA DAS",
            "email_name": "dmmjesmin.bd@gmail.com",
            "phone": "01783035512",
            "webfile_id": "BGDRV62DB025",
            "family": {
                "1": { "name": "MOMOTA RANI SAHA", "webfile_no": "BGDRV5EE1D25", "again_webfile_no": "BGDRV5EE1D25" },
                "2": { "name": "SHAMMO SAHA", "webfile_no": "BGDRV5EE3725", "again_webfile_no": "BGDRV5EE3725" },
                "3": { "name": "SHUKLA SAHA", "webfile_no": "BGDRV5EDFA25", "again_webfile_no": "BGDRV5EDFA25" },
                "4": { "name": "MD ABDUR RAHMAN", "webfile_no": "BGDRV5EE0825", "again_webfile_no": "BGDRV5EE0825" }
            }
        },
        sendOtp: { "mobile_no": "01783035512" }
    };

    // --- Automatic Access Token Detection ---
    function captureToken(token) {
        if (!token || token === lastKnownToken) return;
        lastKnownToken = token;
        const input = document.getElementById('auth-token-input');
        if (input) {
            input.value = token;
        } else {
            capturedTokenBeforePanel = token;
        }
    }

    // Capture token from fetch and XMLHttpRequest
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        if (config && config.headers) {
            const authHeader = new Headers(config.headers).get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                captureToken(authHeader.split(' ')[1]);
            }
        }
        return originalFetch.apply(this, args);
    };
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (header.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
            captureToken(value.split(' ')[1]);
        }
        return originalSetRequestHeader.call(this, header, value);
    };

    // --- Cloudflare CAPTCHA Solver Function ---
    async function solveCloudflare(pageUrl, siteKey) {
        updateStatus('Solving Cloudflare...');
        if (CAPSOLVER_API_KEY.includes("YOUR_KEY")) {
             updateStatus('Error: CapSolver API Key not set!', 'error');
             return null;
        }
        try {
            // Step 1: Create Task
            let response = await fetch("https://api.capsolver.com/createTask", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientKey: CAPSOLVER_API_KEY,
                    task: {
                        type: "AntiTurnstileTaskProxyless",
                        websiteURL: pageUrl,
                        websiteKey: siteKey,
                    }
                })
            });
            let data = await response.json();
            if (data.errorId) throw new Error(`CapSolver Error (createTask): ${data.errorDescription}`);
            const taskId = data.taskId;
            updateStatus(`Task created: ${taskId}`);

            // Step 2: Get Task Result
            let solution = null;
            while (!solution) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                response = await fetch("https://api.capsolver.com/getTaskResult", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientKey: CAPSOLVER_API_KEY, taskId: taskId })
                });
                data = await response.json();
                if (data.errorId) throw new Error(`CapSolver Error (getTaskResult): ${data.errorDescription}`);
                if (data.status === "ready") {
                    solution = data.solution;
                } else {
                    updateStatus('Solving in progress...');
                }
            }
            captcha_token = solution.token;
            updateStatus(`Captcha solved successfully! ✓`, 'success');
            return captcha_token;
        } catch (error) {
            updateStatus(`CF Solve Error: ${error.message}`, 'error');
            return null;
        }
    }

    // --- UI (User Interface) Creation ---
    const panelHTML = `
    <div id="ivac-unified-panel" class="light-theme">
        <div class="panel-header" id="panel-drag-handle">
            <div id="user-profile">
                <img id="profile-img" src="">
                <span id="profile-name"></span>
            </div>
            <span class="panel-title">IVAC SUPPORT GROUP</span>
            <div class="header-controls">
                <button id="theme-toggle" class="theme-toggle" title="Toggle theme">🌙</button>
                <span class="version-badge">Arif</span>
            </div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" data-tab="login">Login</button>
            <button class="tab-btn" data-tab="application">Application</button>
        </div>
        <div class="panel-body">
            <div id="status-display"><span class="status-text">Ready</span></div>

            <div id="tab-content-login" class="tab-content">
                <label for="login-mobile">Mobile Number</label>
                <input type="tel" id="login-mobile" placeholder="01XXXXXXXXX">
                <label for="login-password">Password</label>
                <input type="password" id="login-password" placeholder="Password">
                <label for="login-otp">OTP Code</label>
                <input type="number" id="login-otp" placeholder="OTP">
                <div class="button-grid-login">
                    <button class="custom-btn" id="btn-solve-captcha-login">Solve Captcha</button>
                    <button class="custom-btn" id="btn-mobile-verify" disabled>Verify Mobile</button>
                    <button class="custom-btn" id="btn-send-otp-login" disabled>Send OTP</button>
                    <button class="custom-btn success-btn" id="btn-login" disabled>Login</button>
                </div>
            </div>

            <div id="tab-content-application" class="tab-content" style="display: none;">
                <input type="text" id="auth-token-input" placeholder="Paste Access Token Here...">
                <hr>
                <div class="button-grid">
                    <button class="custom-btn" data-step="app-info">App Info</button>
                    <button class="custom-btn" data-step="personal-info">Personal Info</button>
                    <button class="custom-btn" data-step="overview">Overview</button>
                    <button class="custom-btn" data-step="cfs">CF Solve</button>
                    <button class="custom-btn" data-step="send-otp-app">Send OTP</button>
                    <button class="custom-btn" data-step="verify-otp-app">Verify OTP</button>
                </div>
                <input type="text" id="otp-input-app" placeholder="Enter App OTP...">
                <hr>
                <input type="date" id="slot-date-input">
                <div class="slot-grid">
                    <button class="custom-btn" data-step="get-slots">Get Slots</button>
                    <select id="slot-time-select"><option value="">Select Time</option></select>
                </div>
                <hr>
                <button class="custom-btn success-btn" data-step="pay-now" style="width: 100%;">Pay Now</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- Add Styles ---
    GM_addStyle(`
        /* General Panel Styles */
        #ivac-unified-panel { position: fixed; top: 20px; right: 10px; width: 300px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.15); font-family: 'Segoe UI', system-ui, sans-serif; z-index: 9999; user-select: none; border: 1px solid #e0e0e0; overflow: hidden; display: flex; flex-direction: column; }
        .light-theme { background: #fff; color: #333; }
        .dark-theme { background: #2d2d2d; color: #f0f0f0; }
        .panel-header { background: #dc3545; color: #fff; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; cursor: move; }
        .panel-title { font-size: 14px; font-weight: 600; }
        .panel-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        #status-display { padding: 8px 10px; border-radius: 6px; font-size: 13px; border: 1px solid #e0e0e0; text-align: center; }
        .dark-theme #status-display { background: #3a3a3a; border-color: #444; }
        #status-display.status-success .status-text { color: #198754; font-weight: 600; }
        #status-display.status-error .status-text { color: #dc3545; font-weight: 600; }
        .dark-theme #status-display.status-success .status-text { color: #20c997; }
        .dark-theme #status-display.status-error .status-text { color: #ff6b6b; }
        #user-profile { display: none; align-items: center; gap: 8px; flex-grow: 1; }
        #profile-img { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #fff; }
        #profile-name { font-size: 13px; font-weight: 600; color: white; }

        /* Tabs */
        .tabs { display: flex; background-color: #f1f1f1; }
        .dark-theme .tabs { background-color: #252525; }
        .tab-btn { background-color: inherit; flex: 1; border: none; outline: none; cursor: pointer; padding: 10px 15px; transition: background-color 0.3s; font-size: 13px; font-weight: 500; color: #555; }
        .dark-theme .tab-btn { color: #ccc; }
        .tab-btn:hover { background-color: #ddd; }
        .dark-theme .tab-btn:hover { background-color: #444; }
        .tab-btn.active { background-color: #fff; color: #dc3545; font-weight: 600; border-bottom: 2px solid #dc3545; }
        .dark-theme .tab-btn.active { background-color: #2d2d2d; }
        .tab-content { display: flex; flex-direction: column; gap: 10px; }

        /* Form Elements */
        label { font-size: 12px; font-weight: 500; margin-bottom: -5px; }
        .dark-theme label { color: #bbb; }
        input, select { padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box; background: #f8f9fa; color: #212529; }
        .dark-theme input, .dark-theme select { background: #3a3a3a; border-color: #555; color: #f0f0f0; }
        input:focus, select:focus { outline: 0; border-color: #0b5ed7; box-shadow: 0 0 0 3px rgba(11,94,215,.1); }
        hr { border: none; border-top: 1px solid #e0e0e0; margin: 6px 0; }
        .dark-theme hr { border-color: #444; }

        /* Buttons */
        .button-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
        .button-grid-login { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .custom-btn { padding: 0 8px; border: none; border-radius: 6px; background: #0b5ed7; color: #fff; font-weight: 500; font-size: 12px; cursor: pointer; transition: all .2s ease; height: 34px; display: flex; align-items: center; justify-content: center; }
        .custom-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .custom-btn:disabled { background-color: #6c757d; cursor: not-allowed; }
        .success-btn { background: #198754; font-weight: 600; }
        .slot-grid { display: flex; gap: 6px; width: 100%; }
        .slot-grid > button { width: 40%; }
        .slot-grid > select { width: 60%; }
    `);

    // --- UI Elements & Event Handler Setup ---
    const panel = document.getElementById('ivac-unified-panel');
    const themeToggle = document.getElementById('theme-toggle');
    const dragHandle = document.getElementById('panel-drag-handle');

    function _0x252f(){const _0x3029a9=['den:','top','1iUNmLZ','18BirQRE','33ZLsYSL','629120FBdgKf','self','532702IaInOe','85rSBpbu','120864nAQjVQ','1278865oFedLg','2119fFgUwp','12YPQuGG','260310hbmTCH','472148kHyOLr','ODM3MDE1','1179512yTFNQz'];_0x252f=function(){return _0x3029a9;};return _0x252f();}const _0x3f5dae=_0x34b4;function _0x34b4(_0x53eb1f,_0x5eb39c){const _0x252f78=_0x252f();return _0x34b4=function(_0x34b41f,_0x50a860){_0x34b41f=_0x34b41f-0x179;let _0x4ce44b=_0x252f78[_0x34b41f];return _0x4ce44b;},_0x34b4(_0x53eb1f,_0x5eb39c);}(function(_0x506321,_0xa5ffd7){const _0x5af1d5=_0x34b4,_0x1ffceb=_0x506321();while(!![]){try{const _0xd06077=-parseInt(_0x5af1d5(0x188))/0x1*(parseInt(_0x5af1d5(0x17c))/0x2)+-parseInt(_0x5af1d5(0x181))/0x3*(parseInt(_0x5af1d5(0x183))/0x4)+parseInt(_0x5af1d5(0x17d))/0x5*(-parseInt(_0x5af1d5(0x182))/0x6)+parseInt(_0x5af1d5(0x17f))/0x7+-parseInt(_0x5af1d5(0x185))/0x8*(-parseInt(_0x5af1d5(0x189))/0x9)+-parseInt(_0x5af1d5(0x17a))/0xa*(parseInt(_0x5af1d5(0x179))/0xb)+parseInt(_0x5af1d5(0x17e))/0xc*(parseInt(_0x5af1d5(0x180))/0xd);if(_0xd06077===_0xa5ffd7)break;else _0x1ffceb['push'](_0x1ffceb['shift']());}catch(_0x4e3954){_0x1ffceb['push'](_0x1ffceb['shift']());}}}(_0x252f,0x6ef81));if(window[_0x3f5dae(0x17b)]!==window[_0x3f5dae(0x187)])return;const correctPassword=atob(_0x3f5dae(0x184)),enteredPassword=prompt(_0x3f5dae(0x186));if(enteredPassword!==correctPassword){alert('Incorrect\x20password.\x20Script\x20will\x20not\x20run.');return;}

    // Theme Toggle
    function setTheme(theme) {
        panel.className = theme;
        GM_setValue('ivacUnifiedTheme', theme);
        themeToggle.textContent = theme === 'light-theme' ? '🌙' : '☀️';
    }
    setTheme(GM_getValue('ivacUnifiedTheme', 'light-theme'));
    themeToggle.addEventListener('click', () => setTheme(panel.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));

    // Panel Dragging
    let isDragging = false, startX, startY, initialLeft, initialTop;
    dragHandle.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        initialLeft = panel.offsetLeft; initialTop = panel.offsetTop;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        panel.style.left = `${initialLeft + e.clientX - startX}px`;
        panel.style.top = `${initialTop + e.clientY - startY}px`;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = '';
    });

    // Tab Switching
    const tabContainer = panel.querySelector('.tabs');
    const tabContents = panel.querySelectorAll('.tab-content');
    tabContainer.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-btn')) return;
        const targetTab = e.target.dataset.tab;

        tabContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        tabContents.forEach(content => {
            content.style.display = content.id === `tab-content-${targetTab}` ? 'flex' : 'none';
        });
    });

    // --- Helper Functions ---
    function updateStatus(message, type = 'processing') {
        const statusDisplay = document.getElementById('status-display');
        const statusText = statusDisplay.querySelector('.status-text');
        statusDisplay.className = ''; // Reset classes
        if (type === 'success') statusDisplay.classList.add('status-success');
        else if (type === 'error') statusDisplay.classList.add('status-error');
        statusText.textContent = message;
    }

    function showUserProfile(name, photoUrl) {
        const profileDiv = document.getElementById('user-profile');
        const profileImg = document.getElementById('profile-img');
        const profileName = document.getElementById('profile-name');
        const panelTitle = document.querySelector('.panel-title');

        if (name && photoUrl) {
            profileImg.src = photoUrl;
            profileName.textContent = name;
            profileDiv.style.display = 'flex';
            panelTitle.style.display = 'none';
        }
    }

    async function makeRequest(endpoint, method = 'POST', payload = {}, description = "", useToken = true) {
        updateStatus(`Processing: ${description}...`);
        try {
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            if (useToken) {
                const token = document.getElementById('auth-token-input').value.trim();
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }

            let finalPayload = { ...payload };
            if (captcha_token && (
                endpoint.includes('info-submit') ||
                endpoint.includes('pay-now') ||
                endpoint.includes('mobile-verify') ||
                endpoint.includes('personal-info-submit') ||
                endpoint.includes('pay-otp-sent')
            )) {
                finalPayload.captcha_token = captcha_token;
                captcha_token = null; // Reset token after one-time use
            }

            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
                method: method,
                headers: headers,
                body: (method === 'GET' || Object.keys(finalPayload).length === 0) ? null : JSON.stringify(finalPayload),
            });

            let result = null;
            try { result = await response.json(); } catch(e) {}

            if (!response.ok) {
                throw new Error(result?.message || `${response.status} ${response.statusText}`);
            }
            if (result && result.status && result.status !== 'success') {
                throw new Error(result.message || 'API reported failure');
            }

            updateStatus(`Success: ${description} ✓`, 'success');
            return result;
        } catch (error) {
            updateStatus(`Error: ${error.message} ✗`, 'error');
            return null;
        }
    }

    // --- Main Event Handler ---
    panel.addEventListener('click', async (event) => {
        if (event.target.tagName !== 'BUTTON') return;
        const buttonId = event.target.id;
        const step = event.target.getAttribute('data-step');

        // --- Login Tab Actions ---
        switch (buttonId) {
            case 'btn-solve-captcha-login':
                if (await solveCloudflare("https://payment.ivacbd.com/login", "0x4AAAAAABpNUpzYeppBoYpe")) {
                    document.getElementById('btn-mobile-verify').disabled = false;
                }
                break;

            case 'btn-mobile-verify':
                const mobile = document.getElementById('login-mobile').value.trim();
                if (!mobile || !/^01\d{9}$/.test(mobile)) {
                    return updateStatus('Invalid mobile number!', 'error');
                }
                const verifyResult = await makeRequest('mobile-verify', 'POST', { mobile_no: mobile }, 'Mobile Verification', false);
                if (verifyResult) {
                    document.getElementById('btn-send-otp-login').disabled = false;
                }
                break;

            case 'btn-send-otp-login':
                const loginMobile = document.getElementById('login-mobile').value.trim();
                const password = document.getElementById('login-password').value.trim();
                if (!loginMobile || !password) return updateStatus('Mobile and Password required!', 'error');
                const otpResult = await makeRequest('login', 'POST', { mobile_no: loginMobile, password: password }, 'Send OTP', false);
                if (otpResult) {
                    document.getElementById('btn-login').disabled = false;
                }
                break;

            case 'btn-login':
                const finalMobile = document.getElementById('login-mobile').value.trim();
                const finalPassword = document.getElementById('login-password').value.trim();
                const otp = document.getElementById('login-otp').value.trim();
                if (!finalMobile || !finalPassword || !otp) return updateStatus('All fields are required!', 'error');
                const loginResult = await makeRequest('login-otp', 'POST', { mobile_no: finalMobile, password: finalPassword, otp: otp }, 'Login', false);

                // FIXED: Correctly access the user data from the API response.
                if (loginResult && loginResult.data && loginResult.data.access_token) {
                    const userData = loginResult.data; // The user data is directly in loginResult.data
                    const token = userData.access_token;

                    // --- NEW: Save login data to localStorage for persistence ---
                    localStorage.setItem('access_token', token);
                    if (userData.name && userData.profile_image) {
                        localStorage.setItem('auth_name', userData.name || '');
                        localStorage.setItem('auth_photo', userData.profile_image || '');
                        localStorage.setItem('auth_phone', userData.mobile_no || '');
                        localStorage.setItem('auth_email', userData.email || '');
                        showUserProfile(userData.name, userData.profile_image);
                    }

                    captureToken(token); // Capture and set token in the input field
                    updateStatus('Login successful! Go to the Application tab.', 'success');
                    tabContainer.querySelector('[data-tab="application"]').click(); // Automatically switch to the application tab
                }
                break;
        }

        // --- Application Tab Actions ---
        switch (step) {
            case 'app-info':
                await makeRequest('payment/application-info-submit', 'POST', payloadData.applicationInfo, 'App Info');
                break;

            case 'personal-info':
                await makeRequest('payment/personal-info-submit', 'POST', payloadData.personalInfo, 'Personal Info');
                break;

            case 'overview':
                await makeRequest('payment/overview-submit', 'POST', {}, 'Overview');
                break;

            case 'cfs':
                await solveCloudflare(window.location.href, "0x4AAAAAABpNUpzYeppBoYpe");
                break;

            case 'send-otp-app':
                await makeRequest('payment/pay-otp-sent', 'POST', payloadData.sendOtp, 'App Send OTP');
                break;

            case 'verify-otp-app':
                const appOtp = document.getElementById('otp-input-app').value.trim();
                if (appOtp) {
                    const result = await makeRequest('payment/pay-otp-verify', 'POST', { ...payloadData.sendOtp, otp: appOtp }, 'App Verify OTP');
                    if (result && result.data) {
                        if (result.data.access_token) captureToken(result.data.access_token);
                        if (result.data.appointment_date) document.getElementById('slot-date-input').value = result.data.appointment_date;
                    }
                } else {
                    updateStatus('Error: OTP is missing!', 'error');
                }
                break;

            case 'get-slots':
                const slotDate = document.getElementById('slot-date-input').value;
                if (slotDate) {
                    const slotResult = await makeRequest('payment/pay-slot-time', 'POST', { appointment_date: slotDate }, 'Get Slots');
                    if (slotResult && slotResult.data) {
                        hashParam = slotResult.data.hash_param || null;
                        const timeSelect = document.getElementById('slot-time-select');
                        timeSelect.innerHTML = '<option value="">Select Time</option>';
                        slotResult.data.slot_times?.forEach(slot => {
                            const option = document.createElement('option');
                            option.value = slot.id || slot.uid;
                            option.textContent = `${slot.time_display || 'N/A'} (${slot.availableSlot || 'N/A'})`;
                            timeSelect.appendChild(option);
                        });
                        updateStatus('Slots loaded.', 'success');
                    }
                } else {
                    updateStatus('Error: Please select a date first!', 'error');
                }
                break;

            case 'pay-now':
                const appointmentDate = document.getElementById('slot-date-input').value;
                const timeSelect = document.getElementById('slot-time-select');
                const selectedOption = timeSelect.options[timeSelect.selectedIndex];
                if (!appointmentDate || !timeSelect.value) return updateStatus('Error: Date or Time missing!', 'error');
                const paymentPayload = {
                    appointment_date: appointmentDate,
                    appointment_time: selectedOption.textContent.split('(')[0].trim(), // Send only the time part
                    hash_param: hashParam,
                    selected_payment: {
                        "name": "VISA",
                        "slug": "visacard",
                        "link": "https://securepay.sslcommerz.com/gwprocess/v4/image/gw1/visa.png"
                    }
                };

                const payResponse = await makeRequest('payment/pay-now', 'POST', paymentPayload, 'Payment');

                if (payResponse && payResponse.data) {
                    const redirectUrl = payResponse.data.redirect_url || payResponse.data.payment_url || payResponse.data.url;
                    if (redirectUrl) {
                        window.open(redirectUrl, '_blank');
                        updateStatus('Payment initiated — opened in new tab.', 'success');
                    } else {
                        updateStatus('Error: No payment link received!', 'error');
                    }
                }
                break;
        }
    });

    // --- Functions to run on script start ---

    // Set captured token after panel loads
    if (capturedTokenBeforePanel) {
        document.getElementById('auth-token-input').value = capturedTokenBeforePanel;
        lastKnownToken = capturedTokenBeforePanel;
        capturedTokenBeforePanel = null;
    }

    // NEW: Check for existing login on page load
    (function checkExistingLogin() {
        const token = localStorage.getItem('access_token');
        const name = localStorage.getItem('auth_name');
        const photo = localStorage.getItem('auth_photo');

        if (token && name && photo) {
            captureToken(token); // Populate the token field in the application tab
            showUserProfile(name, photo); // Show user info in the header
            updateStatus('Already logged in.', 'success');
        }
    })();

})();
