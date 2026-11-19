// FB Pool - code chính.
// File này KHÔNG cài vào Tampermonkey. Tampermonkey chỉ cài "loader.user.js",
// loader nạp file này từ GitHub bằng @require.
// → Muốn sửa gì chỉ cần sửa file này trên GitHub, không cần số phiên bản.

(async () => {
  if (window.top !== window) return;

  const SERVER = "https://unconstructive-pitiably-kiley.ngrok-free.dev";
  const KEY = "doi-thanh-chuoi-bi-mat";

  // ===== NHỊP FOLLOW =====
  // Follow quá dồn dập Facebook sẽ tạm khoá tính năng follow của tài khoản.
  const FOLLOW_GAP = [3000, 30000];        // chờ ngẫu nhiên 3–30s trước mỗi lần follow (có đếm ngược)
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
  title.textContent = "FB Pool (GitHub)";
  const connLine = line();
  const errLine = line("color:#f99;font-size:11px;word-break:break-all;margin-top:2px");
  const followLine = line("color:#bbb;margin-top:2px");
  const btn = document.createElement("button");
  btn.style.cssText = "cursor:pointer;margin-top:8px;padding:4px 10px;border-radius:6px;border:0;width:100%";
  panel.append(btn);

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
  title.textContent = `FB Pool (GitHub) - ${name}`;

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
  const me = (extra) => ({ id, name, v: "github", tab: TAB, ...extra });

  // ===== Dữ liệu từ server =====
  let todo = [];                 // [{id, name}] người online mình chưa follow
  const nameOf = {};             // id → tên (để hiện tên thay vì số id)
  const nm = (uid) => nameOf[uid] || uid;
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
      todo = (body.todo || []).map((t) => (typeof t === "string" ? { id: t, name: t } : t));
      todo.forEach((t) => (nameOf[t.id] = t.name));
      following = new Set(body.following || []);
      (body.news || []).forEach((n) => toast("🔔 " + n));
      setConn(true, `Đã kết nối - online: ${onlineN} người`);
      renderFollow();
      return poll();
    }
    if (r.ok && r.status === 401) { fatal = true; return setConn(false, "Sai KEY (không khớp server.py)"); }
    if (r.ok && r.status === 426) { fatal = true; return setConn(false, "Server yêu cầu bản khác", body?.detail || ""); }
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

  // ===== Bảng trạng thái tự follow =====
  const paused = () => GM_getValue("paused", false);
  let status = "";      // dòng 1: đang làm gì / đếm ngược
  let lastDone = "";    // dòng 2: kết quả lần follow gần nhất
  const fmt = (ms) => {
    const s = Math.ceil(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}p${String(s % 60).padStart(2, "0")}s` : `${s}s`;
  };
  const renderFollow = () => {
    const lines =
