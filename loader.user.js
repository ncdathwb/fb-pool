// ==UserScript==
// @name         FB Pool (loader)
// @version      2.0
// @description  Nạp code FB Pool từ GitHub. Cài 1 lần, không cần sửa nữa — chỉ sửa fbpool.js trên GitHub.
// @match        https://*.facebook.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      unconstructive-pitiably-kiley.ngrok-free.dev
// @connect      ngrok-free.dev
// @connect      raw.githubusercontent.com
// @connect      *
// @require      https://raw.githubusercontent.com/ncdathwb/fb-pool/main/fbpool.js
// ==/UserScript==

// Toàn bộ code nằm trong fbpool.js trên GitHub (dòng @require ở trên).
// Tampermonkey tự tải file đó về và chạy cùng script này, không bị Facebook chặn.
