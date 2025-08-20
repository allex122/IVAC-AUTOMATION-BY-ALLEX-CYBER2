// ==UserScript==
// @name         IVAC Automation Loader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Loader for IVAC Automation main script
// @author       Allex@cyber2
// @match        https://payment.ivacbd.com/*
// @match        https://www.ivacbd.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    let s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/gh/allex122/IVAC-AUTOMATION-BY-ALLEX-CYBER2/ivac-main.js";
    document.body.appendChild(s);
})();
