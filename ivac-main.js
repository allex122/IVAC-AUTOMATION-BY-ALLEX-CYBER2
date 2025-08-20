// ==UserScript==
// @name         IVAC Automation - Allex@cyber2
// @namespace    https://github.com/allex122
// @version      1.0
// @description  IVAC Automation Tool with Auto Retry - Created by Allex@cyber2
// @author       Allex@cyber2
// @match        https://payment.ivacbd.com/*
// @match        https://www.ivacbd.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @icon         https://www.ivacbd.com/favicon.ico
// @homepageURL  https://allex122.github.io/IVAC-AUTOMATION-BY-ALLEX-CYBER2/
// @supportURL   https://github.com/allex122/IVAC-AUTOMATION-BY-ALLEX-CYBER2/issues
// @updateURL    https://raw.githubusercontent.com/allex122/IVAC-AUTOMATION-BY-ALLEX-CYBER2/main/ivac-automation.user.js
// @downloadURL  https://raw.githubusercontent.com/allex122/IVAC-AUTOMATION-BY-ALLEX-CYBER2/main/ivac-automation.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 IVAC Automation Tool by Allex@cyber2 loaded successfully!');
    console.log('📂 GitHub: https://github.com/allex122/IVAC-AUTOMATION-BY-ALLEX-CYBER2');

    // --- Configuration Section ---
    const CONFIG = {
        API_BASE_URL: "https://api-payment.ivacbd.com/api/v2",
        CAPSOLVER_KEY: "YOUR_CAPSOLVER_API_KEY_HERE", // User needs to set this
        VERSION: "1.0",
        AUTHOR: "Allex@cyber2",
        GITHUB_URL: "https://allex122.github.io/IVAC-AUTOMATION-BY-ALLEX-CYBER2/"
    };

    let hashParam = null;
    let captcha_token = null;
    let lastKnownToken = '';
    let capturedTokenBeforePanel = null;
    let autoRetryIntervals = {};
    let currentRetryStep = null;

    // --- Sample Payload Data (User should replace with their own data) ---
    const payloadData = {
        applicationInfo: {
            "highcom": "3",
            "webfile_id": "YOUR_WEBFILE_ID",
            "webfile_id_repeat": "YOUR_WEBFILE_ID",
            "ivac_id": "2",
            "visa_type": "6",
            "family_count": "0",
            "visit_purpose": "Your Visit Purpose"
        },
        personalInfo: {
            "full_name": "YOUR_FULL_NAME",
            "email_name": "YOUR_EMAIL@EXAMPLE.COM",
            "phone": "YOUR_MOBILE_NUMBER",
            "webfile_id": "YOUR_WEBFILE_ID",
            "family": {
                "1": { "name": "FAMILY_MEMBER_1", "webfile_no": "WEBFILE_1", "again_webfile_no": "WEBFILE_1" },
                "2": { "name": "FAMILY_MEMBER_2", "webfile_no": "WEBFILE_2", "again_webfile_no": "WEBFILE_2" }
            }
        },
        sendOtp: { "mobile_no": "YOUR_MOBILE_NUMBER" }
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

    // --- Cloudflare CAPTCHA Solver Function ---
    async function solveCloudflare(pageUrl, siteKey) {
        updateStatus('Solving Cloudflare...');
        if (CONFIG.CAPSOLVER_KEY === "YOUR_CAPSOLVER_API_KEY_HERE") {
            updateStatus('Error: CapSolver API Key not configured!', 'error');
            return null;
        }
        
        try {
            const response = await fetch("https://api.capsolver.com/createTask", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientKey: CONFIG.CAPSOLVER_KEY,
                    task: { type: "AntiTurnstileTaskProxyless", websiteURL: pageUrl, websiteKey: siteKey }
                })
            });
            
            const data = await response.json();
            if (data.errorId) throw new Error(`CapSolver Error: ${data.errorDescription}`);
            
            const taskId = data.taskId;
            updateStatus(`Task created: ${taskId}`);
            
            let solution = null;
            while (!solution) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const resultResponse = await fetch("https://api.capsolver.com/getTaskResult", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientKey: CONFIG.CAPSOLVER_KEY, taskId: taskId })
                });
                
                const resultData = await resultResponse.json();
                if (resultData.errorId) throw new Error(`CapSolver Error: ${resultData.errorDescription}`);
                if (resultData.status === "ready") {
                    solution = resultData.solution;
                } else {
                    updateStatus('Solving in progress...');
                }
            }
            
            captcha_token = solution.token;
            updateStatus('Captcha solved successfully! ✓', 'success');
            return captcha_token;
        } catch (error) {
            updateStatus(`CAPTCHA Error: ${error.message}`, 'error');
            return null;
        }
    }

    // --- Auto Retry System ---
    function startAutoRetry(step, retryFunction, interval = 7000) {
        stopAutoRetry(step);
        
        currentRetryStep = step;
        updateStatus(`Auto retry started for ${step} (${interval/1000}s intervals)`, 'processing');
        
        const retryButton = document.getElementById('auto-retry-toggle');
        if (retryButton) {
            retryButton.innerHTML = '⏹️ STOP RETRY';
            retryButton.classList.remove('success-btn');
            retryButton.classList.add('danger-btn');
        }
        
        retryFunction();
        autoRetryIntervals[step] = setInterval(retryFunction, interval);
    }

    function stopAutoRetry(step) {
        if (autoRetryIntervals[step]) {
            clearInterval(autoRetryIntervals[step]);
            autoRetryIntervals[step] = null;
            currentRetryStep = null;
            
            const retryButton = document.getElementById('auto-retry-toggle');
            if (retryButton) {
                retryButton.innerHTML = '🔄 AUTO RETRY';
                retryButton.classList.remove('danger-btn');
                retryButton.classList.add('success-btn');
            }
        }
    }

    // --- UI Creation ---
    const panelHTML = `
    <div id="ivac-automation-panel" class="automation-panel">
        <div class="panel-header" id="panel-drag-handle">
            <span class="panel-title">🚀 IVAC AUTOMATION v${CONFIG.VERSION}</span>
            <div class="header-controls">
                <button id="theme-toggle" class="theme-toggle" title="Toggle theme">🌙</button>
                <span class="version-badge">by ${CONFIG.AUTHOR}</span>
            </div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" data-tab="login">Login</button>
            <button class="tab-btn" data-tab="application">Application</button>
            <button class="tab-btn" data-tab="info">Info</button>
        </div>
        <div class="panel-body">
            <div id="status-display"><span class="status-text">Ready to automate IVAC</span></div>

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
                <div class="token-section">
                    <input type="text" id="auth-token-input" placeholder="Access Token will appear here automatically">
                    <button class="custom-btn warning-btn" id="copy-token-btn">📋 COPY</button>
                </div>
                <hr>
                <div class="button-grid">
                    <button class="custom-btn" data-step="app-info">App Info</button>
                    <button class="custom-btn" data-step="personal-info">Personal Info</button>
                    <button class="custom-btn" data-step="overview">Overview</button>
                    <button class="custom-btn" data-step="cfs">CF Solve</button>
                    <button class="custom-btn" data-step="send-otp-app">Send OTP</button>
                    <button class="custom-btn" data-step="verify-otp-app">Verify OTP</button>
                    <button class="custom-btn" data-step="get-slots">Get Slots</button>
                </div>
                <input type="text" id="otp-input-app" placeholder="Enter App OTP...">
                <hr>
                <input type="date" id="slot-date-input">
                <div class="slot-grid">
                    <select id="slot-time-select"><option value="">Select Time</option></select>
                </div>
                <hr>
                <button class="custom-btn success-btn" data-step="pay-now" style="width: 100%;">Pay Now</button>
            </div>

            <div id="tab-content-info" class="tab-content" style="display: none;">
                <div class="info-content">
                    <h3>IVAC Automation Tool</h3>
                    <p>Version: ${CONFIG.VERSION}</p>
                    <p>Created by: ${CONFIG.AUTHOR}</p>
                    <p>GitHub: <a href="${CONFIG.GITHUB_URL}" target="_blank">${CONFIG.GITHUB_URL}</a></p>
                    <hr>
                    <h4>Instructions:</h4>
                    <ol>
                        <li>Set your CapSolver API key in the script configuration</li>
                        <li>Update the payload data with your personal information</li>
                        <li>Use the login tab to authenticate</li>
                        <li>Use the application tab to automate the process</li>
                        <li>The auto-retry feature will help with slot finding</li>
                    </ol>
                    <hr>
                    <p class="note">Note: This tool is for educational purposes only. Use responsibly.</p>
                </div>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- Add Styles ---
    GM_addStyle(`
        .automation-panel {
            position: fixed; 
            top: 20px; 
            right: 10px; 
            width: 350px; 
            border-radius: 8px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.15); 
            font-family: 'Courier New', monospace; 
            z-index: 9999; 
            user-select: none; 
            border: 1px solid #00ff00; 
            overflow: hidden; 
            display: flex; 
            flex-direction: column; 
            background: #000;
            color: #0f0;
        }
        
        .panel-header { 
            background: #002200; 
            color: #0f0; 
            padding: 10px 12px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            cursor: move; 
            border-bottom: 1px solid #00ff00;
        }
        
        .panel-title { 
            font-size: 14px; 
            font-weight: bold; 
            color: #0f0;
            text-shadow: 0 0 5px #0f0;
        }
        
        .panel-body { 
            padding: 12px; 
            display: flex; 
            flex-direction: column; 
            gap: 10px; 
            background: #000;
        }
        
        #status-display { 
            padding: 8px 10px; 
            border-radius: 6px; 
            font-size: 12px; 
            border: 1px solid #00ff00; 
            text-align: center; 
            background: #001100;
            color: #0f0;
        }
        
        .status-success { color: #00ff00 !important; font-weight: bold; }
        .status-error { color: #ff0000 !important; font-weight: bold; }
        .status-processing { color: #ffff00 !important; font-weight: bold; }
        
        .tabs { display: flex; background-color: #001100; border-bottom: 1px solid #00ff00; }
        .tab-btn { 
            background-color: #001100; 
            flex: 1; 
            border: none; 
            outline: none; 
            cursor: pointer; 
            padding: 10px 15px; 
            transition: background-color 0.3s; 
            font-size: 12px; 
            font-weight: 500; 
            color: #0f0;
        }
        
        .tab-btn:hover { background-color: #003300; }
        .tab-btn.active { 
            background-color: #002200; 
            color: #00ff00; 
            font-weight: bold; 
            border-bottom: 2px solid #00ff00; 
            text-shadow: 0 0 5px #0f0;
        }
        
        .tab-content { display: flex; flex-direction: column; gap: 10px; }
        
        label { 
            font-size: 11px; 
            font-weight: bold; 
            margin-bottom: -5px; 
            color: #0f0;
        }
        
        input, select { 
            padding: 8px 10px; 
            border: 1px solid #00ff00; 
            border-radius: 4px; 
            font-size: 12px; 
            width: 100%; 
            box-sizing: border-box; 
            background: #001100; 
            color: #0f0;
        }
        
        input:focus, select:focus { 
            outline: 0; 
            border-color: #00ffff; 
            box-shadow: 0 0 5px #00ffff; 
        }
        
        hr { border: none; border-top: 1px solid #00ff00; margin: 6px 0; }
        
        .button-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
        .button-grid-login { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        
        .custom-btn { 
            padding: 0 8px; 
            border: none; 
            border-radius: 4px; 
            background: #002200; 
            color: #0f0; 
            font-weight: bold; 
            font-size: 11px; 
            cursor: pointer; 
            transition: all .2s ease; 
            height: 32px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            border: 1px solid #00ff00;
        }
        
        .custom-btn:hover:not(:disabled) { 
            background: #003300; 
            transform: translateY(-1px); 
            box-shadow: 0 0 5px #0f0;
        }
        
        .custom-btn:disabled { 
            background-color: #333; 
            cursor: not-allowed; 
            color: #666;
            border-color: #666;
        }
        
        .success-btn { background: #002200; color: #0f0; border: 1px solid #0f0; }
        .success-btn:hover:not(:disabled) { background: #003300; box-shadow: 0 0 5px #0f0; }
        
        .danger-btn { background: #220000; color: #f00; border: 1px solid #f00; }
        .danger-btn:hover:not(:disabled) { background: #330000; box-shadow: 0 0 5px #f00; }
        
        .warning-btn { background: #222200; color: #ff0; border: 1px solid #ff0; }
        .warning-btn:hover:not(:disabled) { background: #333300; box-shadow: 0 0 5px #ff0; }
        
        .token-section { display: flex; gap: 5px; align-items: center; }
        .token-section input { flex: 1; }
        
        .info-content { font-size: 12px; }
        .info-content h3 { color: #00ff00; margin-bottom: 10px; }
        .info-content h4 { color: #00ff00; margin: 10px 0 5px 0; }
        .info-content a { color: #00ffff; text-decoration: none; }
        .info-content a:hover { text-decoration: underline; }
        .info-content ol { padding-left: 20px; margin: 10px 0; }
        .info-content .note { font-style: italic; color: #888; }
        
        #auto-retry-toggle, #get-token-btn {
            position: fixed;
            top: 60px;
            right: 10px;
            z-index: 10000;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 6px 10px;
            border: 1px solid #00ff00;
            background: #002200;
            color: #0f0;
            text-shadow: 0 0 3px #0f0;
            box-shadow: 0 0 5px #0f0;
        }
        
        #get-token-btn { top: 100px; }
    `);

    // --- UI Setup and Event Handlers ---
    const panel = document.getElementById('ivac-automation-panel');
    const themeToggle = document.getElementById('theme-toggle');

    // Theme Toggle
    function setTheme(theme) {
        panel.className = `automation-panel ${theme}`;
        GM_setValue('ivacTheme', theme);
        themeToggle.textContent = theme === 'light-theme' ? '🌙' : '☀️';
    }
    
    setTheme(GM_getValue('ivacTheme', 'light-theme'));
    themeToggle.addEventListener('click', () => setTheme(panel.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));

    // Panel Dragging
    let isDragging = false, startX, startY, initialLeft, initialTop;
    document.getElementById('panel-drag-handle').addEventListener('mousedown', e => {
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

    // Copy Token Button
    document.getElementById('copy-token-btn').addEventListener('click', function() {
        const tokenInput = document.getElementById('auth-token-input');
        tokenInput.select();
        document.execCommand('copy');
        updateStatus('Token copied to clipboard!', 'success');
    });

    // --- Helper Functions ---
    function updateStatus(message, type = 'processing') {
        const statusDisplay = document.getElementById('status-display');
        const statusText = statusDisplay.querySelector('.status-text');
        statusDisplay.className = '';
        if (type === 'success') statusDisplay.classList.add('status-success');
        else if (type === 'error') statusDisplay.classList.add('status-error');
        else if (type === 'processing') statusDisplay.classList.add('status-processing');
        statusText.textContent = message;
    }

    async function makeRequest(endpoint, method = 'POST', payload = {}, description = "", useToken = true) {
        updateStatus(`Processing: ${description}...`, 'processing');
        try {
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            if (useToken) {
                const token = document.getElementById('auth-token-input').value.trim();
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }

            let finalPayload = { ...payload };
            if (captcha_token && endpoint.includes('payment/')) {
                finalPayload.captcha_token = captcha_token;
                captcha_token = null;
            }

            const response = await fetch(`${CONFIG.API_BASE_URL}/${endpoint}`, {
                method: method,
                headers: headers,
                body: method === 'GET' ? null : JSON.stringify(finalPayload),
            });

            let result = null;
            try { result = await response.json(); } catch(e) {}

            if (response.ok && result && (result.status === 'success' || result.data)) {
                updateStatus(`Success: ${description} ✓`, 'success');
                if (currentRetryStep) stopAutoRetry(currentRetryStep);
                return result;
            } else {
                throw new Error(result?.message || `${response.status} ${response.statusText}`);
            }
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

        // Login Tab Actions
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
                if (verifyResult) document.getElementById('btn-send-otp-login').disabled = false;
                break;

            case 'btn-send-otp-login':
                const loginMobile = document.getElementById('login-mobile').value.trim();
                const password = document.getElementById('login-password').value.trim();
                if (!loginMobile || !password) return updateStatus('Mobile and Password required!', 'error');
                const otpResult = await makeRequest('login', 'POST', { mobile_no: loginMobile, password: password }, 'Send OTP', false);
                if (otpResult) document.getElementById('btn-login').disabled = false;
                break;

            case 'btn-login':
                const finalMobile = document.getElementById('login-mobile').value.trim();
                const finalPassword = document.getElementById('login-password').value.trim();
                const otp = document.getElementById('login-otp').value.trim();
                if (!finalMobile || !finalPassword || !otp) return updateStatus('All fields are required!', 'error');
                const loginResult = await makeRequest('login-otp', 'POST', { mobile_no: finalMobile, password: finalPassword, otp: otp }, 'Login', false);

                if (loginResult && loginResult.data && loginResult.data.access_token) {
                    const userData = loginResult.data;
                    const token = userData.access_token;

                    localStorage.setItem('access_token', token);
                    if (userData.name && userData.profile_image) {
                        localStorage.setItem('auth_name', userData.name || '');
                        localStorage.setItem('auth_photo', userData.profile_image || '');
                    }

                    captureToken(token);
                    updateStatus('Login successful! Go to Application tab.', 'success');
                    tabContainer.querySelector('[data-tab="application"]').click();
                }
                break;
        }

        // Application Tab Actions
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
                if (!slotDate) {
                    updateStatus('Error: Please select a date first!', 'error');
                    return;
                }
                
                const getSlotsFunction = async () => {
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
                        return true;
                    }
                    return false;
                };
                
                startAutoRetry('get-slots', getSlotsFunction, 7000);
                break;

            case 'pay-now':
                const appointmentDate = document.getElementById('slot-date-input').value;
                const timeSelect = document.getElementById('slot-time-select');
                const selectedOption = timeSelect.options[timeSelect.selectedIndex];
                if (!appointmentDate || !timeSelect.value) return updateStatus('Error: Date or Time missing!', 'error');
                
                const paymentPayload = {
                    appointment_date: appointmentDate,
                    appointment_time: selectedOption.textContent.split('(')[0].trim(),
                    appointment_time_final: selectedOption.textContent.split('(')[0].trim(),
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

    // --- Create Additional Control Buttons ---
    function createControlButtons() {
        // Auto Retry Button
        if (!document.getElementById('auto-retry-toggle')) {
            const retryButton = document.createElement('button');
            retryButton.id = 'auto-retry-toggle';
            retryButton.className = 'custom-btn success-btn';
            retryButton.innerHTML = '🔄 AUTO RETRY';
            retryButton.onclick = function() {
                if (currentRetryStep) {
                    stopAutoRetry(currentRetryStep);
                } else {
                    const getSlotsFunction = async () => {
                        const slotDate = document.getElementById('slot-date-input').value;
                        if (!slotDate) {
                            updateStatus('Error: Please select a date first!', 'error');
                            return false;
                        }
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
                            return true;
                        }
                        return false;
                    };
                    startAutoRetry('get-slots', getSlotsFunction, 7000);
                }
            };
            document.body.appendChild(retryButton);
        }

        // Get Token Button
        if (!document.getElementById('get-token-btn')) {
            const tokenButton = document.createElement('button');
            tokenButton.id = 'get-token-btn';
            tokenButton.className = 'custom-btn warning-btn';
            tokenButton.innerHTML = '🔑 GET TOKEN';
            tokenButton.onclick = async function() {
                updateStatus('Trying to get access token...', 'processing');
                try {
                    const response = await fetch(`${CONFIG.API_BASE_URL}/payment/overview-submit`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
                    });
                    
                    if (response.status === 401) {
                        updateStatus('Not authenticated. Please login first.', 'error');
                    } else {
                        updateStatus('Token capture attempted. Check input field.', 'success');
                    }
                } catch (error) {
                    updateStatus('Error capturing token. Please login manually.', 'error');
                }
            };
            document.body.appendChild(tokenButton);
        }
    }

    // --- Initialize Script ---
    if (capturedTokenBeforePanel) {
        document.getElementById('auth-token-input').value = capturedTokenBeforePanel;
        lastKnownToken = capturedTokenBeforePanel;
        capturedTokenBeforePanel = null;
    }

    createControlButtons();

    // Check for existing login
    (function checkExistingLogin() {
        const token = localStorage.getItem('access_token');
        const name = localStorage.getItem('auth_name');
        const photo = localStorage.getItem('auth_photo');

        if (token && name && photo) {
            captureToken(token);
            updateStatus('Already logged in.', 'success');
        }
    })();

    console.log('✅ IVAC Automation Tool initialized successfully!');


})();
