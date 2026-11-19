// ==UserScript==
// @name         FB Presence Pool + Follow
// @version      5.1
// @updateURL    https://raw.githubusercontent.com/TEN_GITHUB/fb-pool/main/followFB.user.js
// @downloadURL  https://raw.githubusercontent.com/TEN_GITHUB/fb-pool/main/followFB.user.js
// @match        https://*.facebook.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      unconstructive-pitiably-kiley.ngrok-free.dev
// @connect      ngrok-free.dev
// @connect      raw.githubusercontent.com
// ==/UserScript==

(async () => {
  if (window.top !== window) return;

  const VERSION = "5.1"; // nhớ tăng cùng lúc với @version ở trên mỗi khi sửa code
  // Link file trên GitHub (giống @updateURL ở trên) để báo "có bản mới"
  const UPDATE_URL = "https://raw.githubusercontent.com/ncdathwb/fb-pool/main/followFB.user.js";
  const SERVER = "https://unconstructive-pitiably-kiley.ngrok-free.dev";
  const KEY = "doi-thanh-chuoi-bi-mat";

  // ===== NHỊP FOLLOW =====
  // Follow quá dồn dập Facebook sẽ tạm khoá tính năng follow của tài khoản.
  const FOLLOW_GAP = [2000, 15000];        // nghỉ ngẫu nhiên 2–15s sau mỗi lần follow
  const MAX_PER_HOUR = 40;                 // tối đa 40 lần follow / giờ
  const JOB_TIMEOUT = 45000;               // tab nền quá 45s chưa xong → bỏ, lần sau thử lại
  const VERIFY_EVERY = 30 * 60 * 1000;     // 30 phút kiểm tra lại 1 người mình đang follow

  const FOLLOW = ["Theo dõi", "Follow"];
  const ALREADY = ["Đang theo dõi", "Following", "Bạn bè", "Friends"];
  const JOB_HASH = "#fbpool-job";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const log = (...a) => console.log("[FB Pool]", ...a);
  const root = document.body || document.documentElement;

  // ===== Giao diện =====
  const mkPanel = () => {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#1f1f1f;color:#fff;" +
      "padding:10px 12px;border-radius:10px;font:13px/1.4 sans-serif;min-width:220px;max-width:320px;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.4)";
    const line = (css = "") => {
      const d = document.createElement("div");
      d.style.cssText = css;
      panel.append(d);
      return d;
    };
    root.appendChild(panel);
    return { panel, line };
  };

  const toast = (msg, ok = true) => {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      `position:fixed;right:16px;top:16px;z-index:2147483647;background:${ok ? "#1a7f37" : "#b3261e"};` +
      "color:#fff;padding:10px 14px;border-radius:8px;font:14px sans-serif;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.4)";
    root.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  };

  // ===== Đọc trạng thái nút Theo dõi trên trang cá nhân =====
  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
  const findBtn = (labels) =>
    [...document.querySelectorAll('[role="button"],[aria-label]')].find((el) => {
      const t = (el.innerText || "").trim();
      const a = (el.getAttribute("aria-label") || "").trim();
      return (labels.includes(t) || labels.includes(a)) && visible(el);
    });
  const followState = () => (findBtn(ALREADY) ? "following" : findBtn(FOLLOW) ? "not" : null);

  // Chờ tới khi điều kiện đúng (theo dõi thay đổi trên trang, không ngủ cứng)
  const waitFor = (fn, ms) =>
    new Promise((resolve) => {
      const v = fn();
      if (v) return resolve(v);
      const obs = new MutationObserver(() => {
        const v = fn();
        if (v) { obs.disconnect(); clearTimeout(t); resolve(v); }
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      const t = setTimeout(() => { obs.disconnect(); resolve(null); }, ms);
    });

  // =====================================================================
  // TAB NỀN (worker): do script tự mở để follow 1 người, xong thì bị đóng
  // =====================================================================
  const job = GM_getValue("job", null);
  const freshJob = job && !job.claimed && Date.now() - job.ts < 30000;
  const isWorker =
    location.hash.startsWith(JOB_HASH) ||
    (freshJob && history.length <= 2 && !document.referrer && location.pathname !== "/"); // phòng khi Facebook chuyển hướng làm mất #

  if (isWorker) {
    if (!freshJob) return; // tab job cũ còn sót lại → không làm gì
    GM_setValue("job", { ...job, claimed: true });
    const { line } = mkPanel();
    line("font-weight:700").textContent = "FB Pool - tab tự động";
    line().textContent = `${job.mode === "verify" ? "Kiểm tra" : "Follow"} ${job.target}...`;

    const s = await waitFor(followState, 20000);
    let result;
    if (job.mode === "verify") {
      result = s === "following" ? "following" : s === "not" ? "unfollow" : "no_button";
    } else if (s === "following") {
      result = "already";
    } else if (s === "not") {
      findBtn(FOLLOW).click();
      const ok = await waitFor(() => followState() === "following", 8000);
      result = ok ? "follow" : "click_failed";
    } else {
      result = "no_button";
    }
    log("worker:", job.target, result);
    GM_setValue("jobresult", { target: job.target, mode: job.mode, result, ts: Date.now() });
    return;
  }

  // =====================================================================
  // TAB CHÍNH
  // =====================================================================
  const { line, panel } = mkPanel();
  const title = line("font-weight:700;margin-bottom:4px");
  title.textContent = `FB Pool v${VERSION}`;
  const connLine = line();
  const errLine = line("color:#f99;font-size:11px;word-break:break-all;margin-top:2px");
  const followLine = line("color:#bbb;margin-top:2px");
  const btn = document.createElement("button");
  btn.style.cssText = "cursor:pointer;margin-top:8px;padding:4px 10px;border-radius:6px;border:0;width:100%";
  panel.append(btn);

  // ===== Kiểm tra bản mới trên GitHub (mỗi lần mở Facebook, tối đa 10 phút/lần) =====
  const newer = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  };
  const checkUpdate = () => {
    const last = GM_getValue("upd_check", 0);
    if (Date.now() - last < 10 * 60 * 1000 && !GM_getValue("upd_ver", "")) return;
    GM_setValue("upd_check", Date.now());
    GM_xmlhttpRequest({
      method: "GET",
      url: UPDATE_URL + "?t=" + Date.now(),   // tránh bản lưu tạm (cache)
      timeout: 15000,
      onload: (r) => {
        const v = (r.responseText || "").match(/@version\s+([\d.]+)/)?.[1] || "";
        GM_setValue("upd_ver", v && newer(v, VERSION) ? v : "");
        showUpdate();
      },
    });
  };
  const showUpdate = () => {
    const v = GM_getValue("upd_ver", "");
    if (!v || !newer(v, VERSION) || panel.querySelector?.("[data-upd]")) return;
    const u = document.createElement("button");
    u.setAttribute?.("data-upd", "1");
    u.textContent = `⬆️ Có bản mới v${v} - bấm để cập nhật`;
    u.style.cssText = "cursor:pointer;margin-top:6px;padding:4px 10px;border-radius:6px;border:0;width:100%;background:#f5c518";
    u.onclick = () => window.open(UPDATE_URL, "_blank"); // Tampermonkey tự mở trang cài đặt
    panel.append(u);
    toast(`FB Pool có bản mới v${v}`, true);
  };
  showUpdate();
  checkUpdate();

  let connOk = null;
  const setConn = (ok, text, detail = "") => {
    connLine.textContent = (ok ? "🟢 " : "🔴 ") + text;
    errLine.textContent = ok ? "" : detail;
    if (!ok) log(text, detail);
    if (connOk !== ok) {
      toast(ok ? "Đã kết nối server pool" : text, ok);
      connOk = ok;
    }
  };
  connLine.textContent = "⏳ Đang kết nối...";

  const ck = (n) => document.cookie.match(new RegExp(`(?:^|;\\s*)${n}=(\\d+)`))?.[1];
  const id = ck("i_user") || ck("c_user");
  if (!id) {
    connLine.textContent = "🔴 Không đọc được ID Facebook (cookie c_user)";
    btn.style.display = "none";
    return;
  }

  const decode = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
  const findName = (html) => {
    const pats = [
      new RegExp(`"USER_ID":"${id}"[^}]*?"NAME":"((?:[^"\\\\]|\\\\.)*)"`),
      new RegExp(`"NAME":"((?:[^"\\\\]|\\\\.)*)"[^}]*?"USER_ID":"${id}"`),
      new RegExp(`"id":"${id}","name":"((?:[^"\\\\]|\\\\.)*)"`),
      new RegExp(`"name":"((?:[^"\\\\]|\\\\.)*)","id":"${id}"`),
    ];
    for (const p of pats) {
      const m = html.match(p);
      if (m) return decode(m[1]);
    }
    return null;
  };
  const name =
    findName(document.documentElement.innerHTML) ||
    [...document.querySelectorAll(`a[href*="${id}"]`)].map((a) => a.innerText.trim()).find((t) => t && t.length < 100) ||
    "?";
  title.textContent = `FB Pool v${VERSION} - ${name}`;

  // ===== Gọi server =====
  const req = (method, path, data, timeout = 15000) =>
    new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method,
          url: SERVER + path,
          timeout,
          headers: { "Content-Type": "application/json", "x-key": KEY, "ngrok-skip-browser-warning": "true" },
          data: data ? JSON.stringify(data) : undefined,
          onload: (r) => resolve({ ok: true, status: r.status, text: r.responseText || "" }),
          onerror: (r) => resolve({ ok: false, kind: "error", status: r?.status || 0, text: r?.error || r?.statusText || "" }),
          ontimeout: () => resolve({ ok: false, kind: "timeout", status: 0, text: "" }),
        });
      } catch (e) {
        resolve({ ok: false, kind: "blocked", status: 0, text: String(e) });
      }
    });
  const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };

  let TAB = sessionStorage.getItem("fbpool_tab");
  if (!TAB) {
    TAB = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem("fbpool_tab", TAB);
  }
  const me = (extra) => ({ id, name, v: VERSION, tab: TAB, ...extra });

  // ===== Dữ liệu từ server =====
  let todo = [];                 // người online mình chưa follow
  let following = new Set();     // người mình đang follow (theo server)
  let onlineN = 0;

  const report = (target, action) => req("POST", "/report", me({ target, action }));

  // ===== Điểm danh "chờ dài" =====
  let seen = -1;
  let fails = 0;
  let fatal = false;

  const poll = async () => {
    if (fatal) return;
    const r = await req("POST", "/presence", me({ seen }), 70000);
    if (fatal) return;
    const body = r.ok ? parse(r.text) : null;
    if (r.ok && r.status === 200 && body && "seen" in body) {
      fails = 0;
      seen = body.seen;
      onlineN = body.online;
      todo = body.todo || [];
      following = new Set(body.following || []);
      (body.news || []).forEach((n) => toast("🔔 " + n));
      setConn(true, `Đã kết nối - online: ${onlineN} người`);
      renderFollow();
      return poll();
    }
    if (r.ok && r.status === 401) { fatal = true; return setConn(false, "Sai KEY (không khớp server.py)"); }
    if (r.ok && r.status === 426) { fatal = true; return setConn(false, "Script cũ, hãy cập nhật bản mới", body?.detail || ""); }
    fails++;
    if (!r.ok) {
      const why = {
        timeout: "Server không trả lời (timeout)",
        blocked: "Tampermonkey chặn kết nối (xem @connect)",
        error: "Không kết nối được server",
      }[r.kind];
      setConn(false, why, r.text);
    } else {
      const code = r.text.match(/ERR_NGROK_\d+/)?.[0] || "";
      setConn(false, `Server trả lỗi ${r.status} ${code}`, r.text.replace(/<[^>]+>/g, " ").slice(0, 150));
    }
    setTimeout(poll, Math.min(30000, 3000 * fails));
  };
  poll();

  addEventListener("pagehide", () => {
    fatal = true;
    req("POST", "/leave", me());
  });

  // ===== Chỉ 1 tab chính được chạy tự follow (khi mở nhiều tab Facebook) =====
  const isLeader = () => {
    const l = GM_getValue("leader", null);
    const now = Date.now();
    if (!l || l.tab === TAB || now - l.ts > 90000) {
      GM_setValue("leader", { tab: TAB, ts: now });
      return true;
    }
    return false;
  };

  // ===== Bật / tắt tự follow =====
  const paused = () => GM_getValue("paused", false);
  let status = "";
  const renderFollow = () => {
    const done = GM_getValue("fl_times", []).filter((t) => Date.now() - t < 3600000).length;
    followLine.textContent = paused()
      ? "Tự follow: ĐANG TẮT"
      : `Tự follow: còn ${todo.length} người chờ · ${done}/${MAX_PER_HOUR} trong giờ` + (status ? `\n${status}` : "");
    followLine.style.whiteSpace = "pre-line";
    btn.textContent = paused() ? "Bật tự follow" : "Tắt tự follow";
  };
  btn.onclick = () => {
    GM_setValue("paused", !paused());
    renderFollow();
  };

  // ===== Mở tab nền để follow / kiểm tra 1 người =====
  const runJob = (target, mode) =>
    new Promise((resolve) => {
      GM_setValue("jobresult", null);
      GM_setValue("job", { target, mode, ts: Date.now(), claimed: false });
      let handle = null;
      let listener = null;
      const finish = (result) => {
        clearTimeout(timer);
        if (listener !== null) GM_removeValueChangeListener(listener);
        try { handle?.close(); } catch {}
        GM_setValue("job", null);
        resolve(result);
      };
      listener = GM_addValueChangeListener("jobresult", (_k, _o, v) => {
        if (v && v.target === target && v.mode === mode) finish(v.result);
      });
      const timer = setTimeout(() => finish("timeout"), JOB_TIMEOUT);
      handle = GM_openInTab(`https://www.facebook.com/profile.php?id=${target}${JOB_HASH}`, {
        active: false, insert: true, setParent: true,
      });
    });

  const LABEL = {
    follow: "✅ đã follow",
    already: "đã follow từ trước",
    no_button: "không thấy nút Theo dõi",
    click_failed: "bấm không ăn",
    timeout: "tab nền quá lâu, sẽ thử lại",
    unfollow: "⚠️ không còn follow",
    following: "vẫn đang follow",
  };

  // ===== Vòng tự follow =====
  let lastVerify = Date.now();
  const loop = async () => {
    while (!fatal) {
      renderFollow();
      if (paused() || !isLeader() || connOk !== true) { await sleep(2000); continue; }

      const times = GM_getValue("fl_times", []).filter((t) => Date.now() - t < 3600000);
      const target = todo.find((t) => t !== id);

      if (target && times.length < MAX_PER_HOUR) {
        status = `Đang follow ${target}...`;
        renderFollow();
        const result = await runJob(target, "follow");
        todo = todo.filter((t) => t !== target);
        if (result !== "timeout") await report(target, result);
        if (result === "follow" || result === "already") following.add(target);
        if (result === "follow") GM_setValue("fl_times", [...times, Date.now()]);
        status = `${target}: ${LABEL[result] || result}`;
        log(status);
        renderFollow();
        await sleep(rand(...FOLLOW_GAP));
        continue;
      }

      if (target) {
        status = "Đã đủ giới hạn trong giờ, tạm chờ";
      } else if (following.size && Date.now() - lastVerify > VERIFY_EVERY) {
        // Rảnh thì kiểm tra lại 1 người mình đang follow (phát hiện bỏ follow ngoài ý muốn)
        lastVerify = Date.now();
        const list = [...following];
        const t = list[Math.floor(Math.random() * list.length)];
        status = `Kiểm tra lại ${t}...`;
        renderFollow();
        const result = await runJob(t, "verify");
        if (result === "unfollow") {
          following.delete(t);
          await report(t, "unfollow");
        }
        status = `${t}: ${LABEL[result] || result}`;
      } else {
        status = todo.length ? status : "Đã follow hết người đang online";
      }
      renderFollow();
      await sleep(2000);
    }
  };
  loop();

  // ===== Phát hiện bỏ follow ngay khi người dùng tự bấm "Bỏ theo dõi" =====
  setInterval(() => {
    const m = location.href.match(/profile\.php\?id=(\d+)/);
    if (!m || m[1] === id) return;
    const t = m[1];
    const s = followState();
    if (following.has(t) && s === "not") {
      following.delete(t);
      report(t, "unfollow");
      toast(`Đã báo server: bạn bỏ follow ${t}`, false);
    } else if (!following.has(t) && s === "following" && todo.includes(t)) {
      following.add(t);
      todo = todo.filter((x) => x !== t);
      report(t, "follow"); // người dùng tự bấm follow bằng tay
    }
  }, 3000);
})();
