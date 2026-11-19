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
  const ALREADY = ["Đang theo dõi", "Đã theo dõi", "Following", "Bạn bè", "Friends", "Đã thích", "Liked"];
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

    // Khung thông báo to giữa trên màn hình để người xem thấy đang làm gì
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#18191a;color:#fff;" +
      "border:1px solid #3a3b3c;border-radius:14px;padding:12px 22px;font:600 15px system-ui,sans-serif;" +
      "box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:center;min-width:240px";
    const say = (t, color = "#fff") => { box.textContent = t; box.style.color = color; };
    root.appendChild(box);
    say(job.mode === "verify" ? "🔍 FB Pool đang kiểm tra..." : "⏳ FB Pool đang tìm nút Theo dõi...");

    const s = await waitFor(followState, 20000);
    let result;
    if (job.mode === "verify") {
      result = s === "following" ? "following" : s === "not" ? "unfollow" : "no_button";
    } else if (s === "following") {
      result = "already";
      const b = findBtn(ALREADY);
      if (b) b.style.outline = "3px solid #31a24c";
      say("✔ Đã follow trang này từ trước", "#8fd19e");
    } else if (s === "not") {
      const b = findBtn(FOLLOW);
      b.scrollIntoView({ block: "center" });
      b.style.outline = "3px solid #2d88ff";
      b.style.outlineOffset = "3px";
      say("👉 FB Pool đang bấm Theo dõi...");
      await sleep(1200);                        // cho người xem thấy nút sắp được bấm
      b.click();
      const ok = await waitFor(() => followState() === "following", 8000);
      result = ok ? "follow" : "click_failed";
      const nb = findBtn(ALREADY);
      if (nb) nb.style.outline = "3px solid #31a24c";
      say(ok ? "✅ Đã follow!" : "Không bấm được, bỏ qua", ok ? "#8fd19e" : "#f3727f");
    } else {
      result = "no_button";
      say("Không thấy nút Theo dõi, bỏ qua", "#b0b3b8");
    }
    log("worker:", job.target, result);
    await sleep(job.mode === "verify" ? 0 : 2000); // giữ 2 giây cho người xem thấy kết quả rồi mới đóng tab
    GM_setValue("jobresult", { target: job.target, mode: job.mode, result, ts: Date.now() });
    return;
  }

  // =====================================================================
  // TAB CHÍNH
  // =====================================================================
  // ---- Bảng điều khiển gọn, dễ nhìn ----
  const css = document.createElement("style");
  css.textContent = `
    #fbp{position:fixed;left:14px;bottom:14px;z-index:2147483647;width:270px;background:#18191a;color:#e4e6eb;
      border:1px solid #3a3b3c;border-radius:14px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);overflow:hidden}
    #fbp .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#242526;border-bottom:1px solid #3a3b3c}
    #fbp .dot{width:9px;height:9px;border-radius:50%;background:#f0b400;flex:none}
    #fbp .ttl{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #fbp .sub{font-size:11px;color:#b0b3b8}
    #fbp .main{padding:14px 12px 10px;text-align:center}
    #fbp .big{font-size:40px;font-weight:800;line-height:1;color:#fff;font-variant-numeric:tabular-nums}
    #fbp .big small{font-size:16px;font-weight:600;color:#b0b3b8;margin-left:2px}
    #fbp .lbl{margin-top:6px;color:#b0b3b8;font-size:12px}
    #fbp .who{margin-top:2px;font-weight:700;color:#4599ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #fbp .msg{font-size:14px;font-weight:600;color:#e4e6eb;padding:6px 0}
    #fbp .bar{height:5px;background:#3a3b3c;border-radius:3px;margin-top:10px;overflow:hidden}
    #fbp .bar i{display:block;height:100%;width:0;background:#2d88ff;transition:width .9s linear}
    #fbp .st{display:flex;border-top:1px solid #3a3b3c}
    #fbp .st div{flex:1;text-align:center;padding:8px 0}
    #fbp .st div+div{border-left:1px solid #3a3b3c}
    #fbp .st b{display:block;font-size:17px;color:#fff}
    #fbp .st span{font-size:11px;color:#b0b3b8}
    #fbp .log{border-top:1px solid #3a3b3c;padding:8px 12px;font-size:12px;color:#b0b3b8;max-height:66px;overflow:hidden}
    #fbp .log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #fbp .log:empty{display:none}
    #fbp .err{padding:0 12px 10px;color:#f3727f;font-size:11px;word-break:break-all}
    #fbp .err:empty{display:none}`;
  (document.head || root).appendChild(css);

  const panel = document.createElement("div");
  panel.id = "fbp";
  panel.innerHTML = `
    <div class="hd"><span class="dot"></span><div style="min-width:0">
      <div class="ttl">FB Pool</div><div class="sub">Đang kết nối...</div></div></div>
    <div class="main"></div>
    <div class="err"></div>
    <div class="st">
      <div><b data-k="online">–</b><span>Online</span></div>
      <div><b data-k="done">–</b><span>Đã follow</span></div>
      <div><b data-k="wait">–</b><span>Đang chờ</span></div>
    </div>
    <div class="log"></div>`;
  root.appendChild(panel);
  const $ = (q) => panel.querySelector(q);
  const title = $(".ttl"), connLine = $(".sub"), dot = $(".dot"), mainBox = $(".main"), errLine = $(".err"), logBox = $(".log");
  const stat = (k, v) => ($(`[data-k="${k}"]`).textContent = v);

  let connOk = null;
  const setConn = (ok, text, detail = "") => {
    connLine.textContent = text;
    dot.style.background = ok ? "#31a24c" : "#f3425f";
    errLine.textContent = ok ? "" : detail;
    if (!ok) log(text, detail);
    if (connOk !== ok) {
      toast(ok ? "Đã kết nối server pool" : text, ok);
      connOk = ok;
    }
  };

  const ck = (n) => document.cookie.match(new RegExp(`(?:^|;\\s*)${n}=(\\d+)`))?.[1];
  const id = ck("i_user") || ck("c_user");
  if (!id) {
    connLine.textContent = "Không đọc được ID Facebook (chưa đăng nhập?)";
    dot.style.background = "#f3425f";
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
  title.textContent = name;

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
      setConn(true, "Đã kết nối server");
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

  // ===== Hiển thị trạng thái =====
  // view: { kind: "count" | "busy" | "msg", left, total, who, text }
  let view = { kind: "msg", text: "Đang kết nối..." };
  const recent = [];   // các lần follow thành công gần nhất
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hhmm = () => new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const renderFollow = () => {
    if (view.kind === "count") {
      const sec = Math.max(0, Math.ceil(view.left / 1000));
      const pct = view.total ? Math.min(100, 100 - (view.left / view.total) * 100) : 0;
      mainBox.innerHTML =
        `<div class="big">${sec}<small>giây</small></div>` +
        `<div class="lbl">nữa sẽ follow</div><div class="who">${esc(view.who)}</div>` +
        `<div class="bar"><i style="width:${pct}%"></i></div>`;
    } else if (view.kind === "busy") {
      mainBox.innerHTML = `<div class="msg">👉 Đang follow</div><div class="who">${esc(view.who)}</div>` +
        `<div class="bar"><i style="width:100%;background:#31a24c"></i></div>`;
    } else {
      mainBox.innerHTML = `<div class="msg">${esc(view.text)}</div>`;
    }
    stat("online", onlineN || "–");
    stat("done", following.size);
    stat("wait", todo.length);
    logBox.innerHTML = recent.map((r) => `<div>✅ ${r.t} · ${esc(r.who)}</div>`).join("");
  };
  const paused = () => false;

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
      // Follow: mở trang người đó ra TRƯỚC MẮT để thấy luôn; kiểm tra lại thì chạy ngầm
      handle = GM_openInTab(`https://www.facebook.com/profile.php?id=${target}${JOB_HASH}`, {
        active: mode === "follow", insert: true, setParent: true,
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

  // ===== Vòng tự follow: chờ 3–30s (đếm ngược) → follow 1 người → lặp lại =====
  let lastVerify = Date.now();
  let nextAt = 0, gapTotal = 0;   // thời điểm follow người tiếp theo + tổng thời gian chờ
  let next = null;                // người sẽ follow tiếp theo
  const skipped = new Set();      // không follow được lần này → bỏ qua, không hiện lỗi
  const loop = async () => {
    while (!fatal) {
      if (!isLeader() || connOk !== true) {
        view = { kind: "msg", text: connOk !== true ? "⏳ Đang chờ kết nối server..." : "Tab Facebook khác đang chạy" };
        nextAt = 0;
        renderFollow();
        await sleep(1000);
        continue;
      }

      // Giới hạn mỗi giờ (để Facebook không khoá nút Theo dõi)
      const times = GM_getValue("fl_times", []).filter((t) => Date.now() - t < 3600000);
      if (times.length >= MAX_PER_HOUR) {
        view = { kind: "msg", text: `😴 Nghỉ ${fmt(3600000 - (Date.now() - times[0]))} (đủ ${MAX_PER_HOUR} follow/giờ)` };
        renderFollow();
        await sleep(1000);
        continue;
      }

      const cand = todo.filter((t) => t.id !== id && !skipped.has(t.id));
      if (!cand.length) {
        nextAt = 0;
        next = null;
        if (following.size && Date.now() - lastVerify > VERIFY_EVERY) {
          // Rảnh thì kiểm tra lại 1 người mình đang follow (phát hiện bỏ follow ngoài ý muốn)
          lastVerify = Date.now();
          const list = [...following];
          const t = list[Math.floor(Math.random() * list.length)];
          const result = await runJob(t, "verify");
          if (result === "unfollow") {
            following.delete(t);
            await report(t, "unfollow");
          }
        }
        view = { kind: "msg", text: "✔ Đã follow hết, chờ người mới vào" };
        renderFollow();
        await sleep(1000);
        continue;
      }

      // Chọn người tiếp theo; người đó rời pool thì chọn người khác
      if (!next || !cand.some((t) => t.id === next.id)) next = cand[0];
      if (!nextAt) { gapTotal = rand(...FOLLOW_GAP); nextAt = Date.now() + gapTotal; }

      const left = nextAt - Date.now();
      if (left > 0) {
        view = { kind: "count", left, total: gapTotal, who: next.name };
        renderFollow();
        await sleep(Math.min(1000, left));
        continue;
      }

      // Hết đếm ngược → follow
      const target = next;
      view = { kind: "busy", who: target.name };
      renderFollow();
      const result = await runJob(target.id, "follow");
      if (result !== "timeout") await report(target.id, result);
      todo = todo.filter((t) => t.id !== target.id);
      if (result === "follow" || result === "already") following.add(target.id);
      if (result === "follow") {
        GM_setValue("fl_times", [...times, Date.now()]);
        recent.unshift({ t: hhmm(), who: target.name });
        recent.length = Math.min(recent.length, 3);
      } else if (result !== "already") {
        skipped.add(target.id); // không thấy nút / bấm không ăn / quá lâu → bỏ qua lặng lẽ
      }
      log(target.name, LABEL[result] || result);
      next = null;
      gapTotal = rand(...FOLLOW_GAP);
      nextAt = Date.now() + gapTotal; // bắt đầu đếm ngược cho người sau
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
      toast(`Đã báo server: bạn bỏ follow ${nm(t)}`, false);
    } else if (!following.has(t) && s === "following" && todo.some((x) => x.id === t)) {
      following.add(t);
      todo = todo.filter((x) => x.id !== t);
      report(t, "follow"); // người dùng tự bấm follow bằng tay
    }
  }, 3000);
})();
