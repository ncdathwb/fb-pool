// ==UserScript==
// @name         FB Pool (loader)
// @description  Tự tải code FB Pool mới nhất từ GitHub mỗi lần mở Facebook
// @match        https://*.facebook.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      raw.githubusercontent.com
// @connect      unconstructive-pitiably-kiley.ngrok-free.dev
// @connect      ngrok-free.dev
// @connect      *
// ==/UserScript==

// File này cài 1 lần, KHÔNG cần sửa nữa. Mọi thay đổi chỉ sửa fbpool.js trên GitHub.
(() => {
  if (window.top !== window) return;

  const CODE_URL = "https://raw.githubusercontent.com/ncdathwb/fb-pool/main/fbpool.js";
  const FRESH_MS = 60 * 1000; // code tải trong 1 phút gần đây thì dùng luôn (tab nền mở liên tục không phải tải lại)

  // Mã ngắn của code đang chạy, để biết đang chạy bản nào
  const hash = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).slice(0, 6);
  };

  // Dòng trạng thái của loader (tự ẩn khi code chính chạy được)
  let box = null;
  const say = (msg, bad = false) => {
    if (!box) {
      box = document.createElement("div");
      box.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483647;color:#fff;padding:10px 12px;" +
        "border-radius:10px;font:13px/1.4 sans-serif;max-width:340px;word-break:break-all";
      (document.body || document.documentElement).appendChild(box);
    }
    box.style.background = bad ? "#b3261e" : "#1f1f1f";
    box.textContent = msg;
    console[bad ? "error" : "log"]("[FB Pool loader]", msg);
  };

  const run = (code, note = "") => {
    try {
      new Function(
        "GM_xmlhttpRequest", "GM_getValue", "GM_setValue", "GM_deleteValue", "GM_openInTab",
        "GM_addValueChangeListener", "GM_removeValueChangeListener", "BUILD",
        code
      )(
        GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_deleteValue, GM_openInTab,
        GM_addValueChangeListener, GM_removeValueChangeListener, hash(code)
      );
      if (note) say(note, true); else box?.remove();
    } catch (e) {
      say("FB Pool: lỗi chạy code từ GitHub - " + e.message, true);
    }
  };

  const cached = GM_getValue("code_cache", null);
  if (cached && Date.now() - cached.ts < FRESH_MS) return run(cached.code);

  const isWorker = location.hash.startsWith("#fbpool-job");
  if (!isWorker) say("FB Pool: đang tải code từ GitHub...");
  const fail = (why) => {
    if (cached) return run(cached.code, `FB Pool: ${why} → đang chạy bản đã lưu trước đó`);
    say(`FB Pool: ${why}\n${CODE_URL}`, true);
  };

  GM_xmlhttpRequest({
    method: "GET",
    url: CODE_URL + "?t=" + Date.now(),
    timeout: 15000,
    onload: (r) => {
      if (r.status === 200 && r.responseText) {
        GM_setValue("code_cache", { code: r.responseText, ts: Date.now() });
        run(r.responseText);
      } else if (r.status === 404) {
        fail("chưa thấy file fbpool.js trên GitHub (404). Kiểm tra đã upload đúng tên, đúng repo chưa");
      } else {
        fail(`GitHub trả lỗi ${r.status}`);
      }
    },
    onerror: (r) => fail("không tải được từ GitHub " + (r?.error || "")),
    ontimeout: () => fail("tải từ GitHub quá lâu (timeout)"),
  });
})();
