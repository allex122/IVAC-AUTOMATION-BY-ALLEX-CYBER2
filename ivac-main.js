// ==UserScript==
// @name         Cyber2- Allex@cyber2
// @namespace    http://tampermonkey.net/
// @version      7.4
// @description  IVAC Automation Tool with Auto Retry - Allex@cyber2
// @author       Allex@cyber2
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
    const CAPSOLVER_API_KEY = "CAP-84E9E9556FDC819C391840509EC863A076F57FF6ED95A460A94640FCxxxxxxxxxxx";

    let hashParam = null;
    let captcha_token = null;
    let lastKnownToken = '';
    let capturedTokenBeforePanel = null;
    let autoRetryIntervals = {};
    let currentRetryStep = null;

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

    // --- Auto Retry Functions ---
    function startAutoRetry(step, retryFunction, interval = 7000) {
        stopAutoRetry(step);
        
        currentRetryStep = step;
        updateStatus(`Auto retry started for ${step} (every ${interval/1000}s)`, 'processing');
        
        // Update auto retry button
        const retryButton = document.getElementById('auto-retry-toggle');
        if (retryButton) {
            retryButton.innerHTML = '⏹️ STOP RETRY';
            retryButton.classList.remove('success-btn');
            retryButton.classList.add('danger-btn');
        }
        
        // Execute immediately first time
        retryFunction();
        
        // Set up interval for subsequent retries
        autoRetryIntervals[step] = setInterval(() => {
            retryFunction();
        }, interval);
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

    function isSuccessResponse(result, response) {
        if (response && (response.status === 200 || response.status === 204)) {
            return true;
        }
        
        if (result && result.status === 'success') {
            return true;
        }
        
        if (result && result.data) {
            return true;
        }
        
        return false;
    }

    function createRetryButton() {
        if (!document.getElementById('auto-retry-toggle')) {
            const retryButton = document.createElement('button');
            retryButton.id = 'auto-retry-toggle';
            retryButton.className = 'custom-btn success-btn';
            retryButton.innerHTML = '🔄 AUTO RETRY';
            retryButton.style.position = 'fixed';
            retryButton.style.top = '60px';
            retryButton.style.right = '10px';
            retryButton.style.zIndex = '10000';
            retryButton.style.fontFamily = 'Courier New, monospace';
            retryButton.style.fontSize = '12px';
            retryButton.style.padding = '5px 10px';
            
            retryButton.onclick = function() {
                if (currentRetryStep) {
                    stopAutoRetry(currentRetryStep);
                } else {
                    // If no current retry, start retry for get-slots by default
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
    }

    // --- Get Access Token Button Function ---
    function createGetTokenButton() {
        if (!document.getElementById('get-token-btn')) {
            const tokenButton = document.createElement('button');
            tokenButton.id = 'get-token-btn';
            tokenButton.className = 'custom-btn warning-btn';
            tokenButton.innerHTML = '🔑 GET TOKEN';
            tokenButton.style.position = 'fixed';
            tokenButton.style.top = '100px';
            tokenButton.style.right = '10px';
            tokenButton.style.zIndex = '10000';
            tokenButton.style.fontFamily = 'Courier New, monospace';
            tokenButton.style.fontSize = '12px';
            tokenButton.style.padding = '5px 10px';
            
            tokenButton.onclick = async function() {
                updateStatus('Trying to get access token...', 'processing');
                
                // Try to capture token from existing requests
                try {
                    // Make a simple request to trigger token capture
                    const response = await fetch(`${API_BASE_URL}/payment/overview-submit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
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

    // --- UI (User Interface) Creation ---
    const panelHTML = `
    <div id="ivac-unified-panel" class="light-theme">
        <div class="panel-header" id="panel-drag-handle">
            <div id="user-profile">
                <img id="profile-img" src="">
                <span id="profile-name"></span>
            </div>
            <span class="panel-title">🚀 ALEX@CYBER2</span>
            <div class="header-controls">
                <button id="theme-toggle" class="theme-toggle" title="Toggle theme">🌙</button>
                <span class="version-badge">v7.4</span>
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
                <div class="token-section">
                    <input type="text" id="auth-token-input" placeholder="Paste Access Token Here...">
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
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- Add Styles ---
    GM_addStyle(`
        /* General Panel Styles */
        #ivac-unified-panel { 
            position: fixed; 
            top: 20px; 
            right: 10px; 
            width: 320px; 
            border-radius: 8px; 
            box-shadow: 0 4px 20px rgba(0,0,0,.15); 
            font-family: 'Courier New', monospace; 
            z-index: 9999; 
            user-select: none; 
            border: 1px solid #00ff00; 
            overflow: hidden; 
            display: flex; 
            flex-direction: column; 
            background: #000 !important;
            color: #0f0 !important;
        }
        .light-theme { background: #000; color: #0f0; }
        .dark-theme { background: #111; color: #0f0; }
        .panel-header { 
            background: #002200; 
            color: #0f0; 
            padding: 10px 12px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            cursor: move; 
            border-bottom: 1px solid #00ff00;
            font-family: 'Courier New', monospace;
        }
        .panel-title { 
            font-size: 14px; 
            font-weight: bold; 
            color: #0f0;
            text-shadow: 0 0 5px #0f0;
            font-family: 'Courier New', monospace;
        }
        .panel-body { 
            padding: 12px; 
            display: flex; 
            flex-direction: column; 
            gap: 10px; 
            background: #000;
            font-family: 'Courier New', monospace;
        }
        #status-display { 
            padding: 8px 10px; 
            border-radius: 6px; 
            font-size: 12px; 
            border: 1px solid #00ff00; 
            text-align: center; 
            background: #001100;
            color: #0f0;
            font-family: 'Courier New', monospace;
        }
        .dark-theme #status-display { background: #001100; border-color: #00ff00; }
        #status-display.status-success .status-text { color: #00ff00; font-weight: bold; }
        #status-display.status-error .status-text { color: #ff0000; font-weight: bold; }
        #status-display.status-processing .status-text { color: #ffff00; font-weight: bold; }
        #user-profile { display: none; align-items: center; gap: 8px; flex-grow: 1; }
        #profile-img { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #00ff00; }
        #profile-name { font-size: 13px; font-weight: 600; color: #0f0; }

        /* Token Section */
        .token-section {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        .token-section input {
            flex: 1;
        }
        .token-section button {
            white-space: nowrap;
        }

        /* Tabs */
        .tabs { display: flex; background-color: #001100; border-bottom: 1px solid #00ff00; }
        .dark-theme .tabs { background-color: #001100; }
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
            font-family: 'Courier New', monospace;
        }
        .dark-theme .tab-btn { color: #0f0; }
        .tab-btn:hover { background-color: #003300; }
        .dark-theme .tab-btn:hover { background-color: #003300; }
        .tab-btn.active { 
            background-color: #002200; 
            color: #00ff00; 
            font-weight: bold; 
            border-bottom: 2px solid #00ff00; 
            text-shadow: 0 0 5px #0f0;
        }
        .dark-theme .tab-btn.active { background-color: #002200; }
        .tab-content { display: flex; flex-direction: column; gap: 10px; }

        /* Form Elements */
        label { 
            font-size: 11px; 
            font-weight: bold; 
            margin-bottom: -5px; 
            color: #0f0;
            font-family: 'Courier New', monospace;
        }
        .dark-theme label { color: #0f0; }
        input, select { 
            padding: 8px 10px; 
            border: 1px solid #00ff00; 
            border-radius: 4px; 
            font-size: 12px; 
            width: 100%; 
            box-sizing: border-box; 
            background: #001100; 
            color: #0f0;
            font-family: 'Courier New', monospace;
        }
        .dark-theme input, .dark-theme select { background: #001100; border-color: #00ff00; color: #0f0; }
        input:focus, select:focus { 
            outline: 0; 
            border-color: #00ffff; 
            box-shadow: 0 0 5px #00ffff; 
        }
        hr { border: none; border-top: 1px solid #00ff00; margin: 6px 0; }
        .dark-theme hr { border-color: #00ff00; }

        /* Buttons */
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
            font-family: 'Courier New', monospace;
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
        .success-btn { 
            background: #002200; 
            color: #0f0;
            border: 1px solid #0f0;
        }
        .success-btn:hover:not(:disabled) {
            background: #003300;
            box-shadow: 0 0 5px #0f0;
        }
        .danger-btn { 
            background: #220000; 
            color: #f00;
            border: 1px solid #f00;
        }
        .danger-btn:hover:not(:disabled) {
            background: #330000;
            box-shadow: 0 0 5px #f00;
        }
        .warning-btn { 
            background: #222200; 
            color: #ff0;
            border: 1px solid #ff0;
        }
        .warning-btn:hover:not(:disabled) {
            background: #333300;
            box-shadow: 0 0 5px #ff0;
        }
        .slot-grid { display: flex; gap: 6px; width: 100%; }
        .slot-grid > button { width: 40%; }
        .slot-grid > select { width: 60%; }

        /* Auto Retry Button */
        #auto-retry-toggle, #get-token-btn {
            font-family: 'Courier New', monospace !important;
            font-size: 11px !important;
            padding: 6px 10px !important;
            border: 1px solid #00ff00 !important;
            background: #002200 !important;
            color: #0f0 !important;
            text-shadow: 0 0 3px #0f0;
            box-shadow: 0 0 5px #0f0;
        }
        #auto-retry-toggle:hover, #get-token-btn:hover {
            background: #003300 !important;
            box-shadow: 0 0 8px #0f0 !important;
        }
        #get-token-btn {
            top: 100px !important;
        }
    `);

    // --- UI Elements & Event Handler Setup ---
    const panel = document.getElementById('ivac-unified-panel');
    const themeToggle = document.getElementById('theme-toggle');
    const dragHandle = document.getElementById('panel-drag-handle');

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
        statusDisplay.className = ''; // Reset classes
        if (type === 'success') statusDisplay.classList.add('status-success');
        else if (type === 'error') statusDisplay.classList.add('status-error');
        else if (type === 'processing') statusDisplay.classList.add('status-processing');
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
        updateStatus(`Processing: ${description}...`, 'processing');
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
                captcha_token = null;
            }

            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
                method: method,
                headers: headers,
                body: (method === 'GET' || Object.keys(finalPayload).length === 0) ? null : JSON.stringify(finalPayload),
            });

            let result = null;
            try { result = await response.json(); } catch(e) {}

            const isSuccess = isSuccessResponse(result, response);
            
            if (isSuccess) {
                updateStatus(`Success: ${description} ✓`, 'success');
                if (currentRetryStep) {
                    stopAutoRetry(currentRetryStep);
                }
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

                if (loginResult && loginResult.data && loginResult.data.access_token) {
                    const userData = loginResult.data;
                    const token = userData.access_token;

                    localStorage.setItem('access_token', token);
                    if (userData.name && userData.profile_image) {
                        localStorage.setItem('auth_name', userData.name || '');
                        localStorage.setItem('auth_photo', userData.profile_image || '');
                        localStorage.setItem('auth_phone', userData.mobile_no || '');
                        localStorage.setItem('auth_email', userData.email || '');
                        showUserProfile(userData.name, userData.profile_image);
                    }

                    captureToken(token);
                    updateStatus('Login successful! Go to the Application tab.', 'success');
                    tabContainer.querySelector('[data-tab="application"]').click();
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
                
                // FIXED: appointment_time_final field added to fix 422 error
                const paymentPayload = {
                    appointment_date: appointmentDate,
                    appointment_time: selectedOption.textContent.split('(')[0].trim(),
                    appointment_time_final: selectedOption.textContent.split('(')[0].trim(), // Added this field
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

    // Create auto retry button and get token button
    createRetryButton();
    createGetTokenButton();

    // Check for existing login on page load
    (function checkExistingLogin() {
        const token = localStorage.getItem('access_token');
        const name = localStorage.getItem('auth_name');
        const photo = localStorage.getItem('auth_photo');

        if (token && name && photo) {
            captureToken(token);
            showUserProfile(name, photo);
            updateStatus('Already logged in.', 'success');
        }
    })();

})();
