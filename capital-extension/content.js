(() => {
  if (document.getElementById("maher-hero-capital-root")) return;
  const host = document.createElement("div");
  host.id = "maher-hero-capital-root";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = chrome.runtime.getURL("panel.css");
  root.appendChild(css);
  const accountCss = document.createElement("link");
  accountCss.rel = "stylesheet";
  accountCss.href = chrome.runtime.getURL("account.css");
  root.appendChild(accountCss);
  const app = document.createElement("div");
  app.innerHTML = `
    <button class="mh-fab" aria-label="فتح ماسح ماهر هيرو"><span>MH</span><b>أفضل 10</b></button>
    <aside class="mh-panel" dir="rtl" aria-hidden="true">
      <header><div><small>MAHER HERO</small><h1>Capital Scanner</h1></div><div class="mh-head-actions"><button class="mh-refresh" title="تحديث">↻</button><button class="mh-close" title="إغلاق">×</button></div></header>
      <section class="mh-account"><article><span>قيمة الحساب</span><strong class="mh-equity">—</strong></article><article><span>الرصيد</span><strong class="mh-balance">—</strong></article><article><span>المتاح</span><strong class="mh-available">—</strong></article><article><span>الربح/الخسارة</span><strong class="mh-pnl">—</strong></article><article><span>الوضع والفحص</span><strong><i class="mh-mode">—</i> · <i class="mh-scanned">—</i></strong></article><article><span>آخر تحديث</span><strong class="mh-time">—</strong></article></section>
      <div class="mh-message">افتح اللوحة لبدء الفحص.</div>
      <div class="mh-table-wrap"><table><thead><tr><th>#</th><th>السهم</th><th>التقييم</th><th>السعر</th><th>الدخول</th><th>الوقف</th><th>هدف 1</th><th>الحالة</th><th></th></tr></thead><tbody></tbody></table></div>
      <footer><span class="mh-countdown">تحديث كل 60 ثانية</span><button class="mh-settings">الإعدادات</button></footer>
    </aside>
    <div class="mh-dialog-backdrop" hidden><section class="mh-dialog" dir="rtl"><button class="mh-dialog-close">×</button><div class="mh-dialog-body"></div></section></div>`;
  root.appendChild(app);

  const $ = (selector) => root.querySelector(selector);
  const panel = $(".mh-panel"), tbody = $("tbody"), message = $(".mh-message");
  let timer = null, countdownTimer = null, nextRefresh = 0, latest = [], latestAccount = null;
  const number = (value, digits = 2) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const status = { ready: "جاهز", near: "قريب", watch: "مراقبة" };

  async function settings() {
    return chrome.storage.sync.get({ apiBase: "http://localhost:3000", botToken: "", showExecution: false, riskDollars: 3, orderSize: 1 });
  }

  function setLoading(text) { message.textContent = text; message.className = "mh-message loading"; message.hidden = false; }
  function setError(text) { message.textContent = text; message.className = "mh-message error"; message.hidden = false; }

  async function refresh() {
    setLoading("جارٍ فحص الأسهم وتحليل أفضل الفرص...");
    try {
      const config = await settings();
      const response = await fetch(`${config.apiBase.replace(/\/$/, "")}/api/capital/scanner`, { cache: "no-store", headers: { Authorization: `Bearer ${config.botToken}` } });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `تعذر الاتصال (${response.status})`);
      latest = data.opportunities || [];
      latestAccount = data.account || null;
      const account = latestAccount?.balance || {};
      const currency = latestAccount?.currency || "$";
      const money = (value) => value === undefined || value === null ? "—" : `${number(value)} ${currency}`;
      const equity = account.balance;
      const funds = equity == null ? null : equity - (account.profitLoss ?? 0);
      $(".mh-balance").textContent = money(funds);
      $(".mh-equity").textContent = money(equity);
      $(".mh-available").textContent = money(account.available);
      $(".mh-pnl").textContent = money(account.profitLoss);
      $(".mh-pnl").className = `mh-pnl ${(account.profitLoss ?? 0) >= 0 ? "positive" : "negative"}`;
      $(".mh-mode").textContent = data.mode === "live" ? "حقيقي" : "تجريبي";
      $(".mh-mode").className = `mh-mode ${data.mode === "live" ? "live" : "demo"}`;
      $(".mh-scanned").textContent = `${data.analyzed || 0}/${data.scanned || 0}`;
      $(".mh-time").textContent = new Date(data.timestamp).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
      render();
      message.hidden = latest.length > 0;
      if (!latest.length) setError("لم يكتمل تحليل أي سهم. راجع رموز Capital وإعدادات API.");
      nextRefresh = Date.now() + 60_000;
    } catch (error) { setError(error.message || "تعذر تحديث القائمة."); }
  }

  function render() {
    tbody.innerHTML = latest.map((item, index) => `
      <tr class="${item.actionStatus}">
        <td>${index + 1}</td><td><b>${item.symbol}</b><small>${item.breakout === "early" ? "اختراق مبكر" : item.breakout === "retest" ? "إعادة اختبار" : "مراقبة"}</small></td>
        <td><strong class="mh-score">${item.score}</strong><small>RVOL ${number(item.volumeRatio)}</small></td>
        <td>${number(item.price)}</td><td>${number(item.entry)}</td><td>${number(item.stop)}</td><td>${number(item.target1)}</td>
        <td><span class="mh-status">${status[item.actionStatus] || "مراقبة"}</span></td>
        <td><button class="mh-prepare" data-index="${index}">تجهيز</button></td>
      </tr>`).join("");
    root.querySelectorAll(".mh-prepare").forEach((button) => button.addEventListener("click", () => openTrade(latest[Number(button.dataset.index)])));
  }

  async function openTrade(item) {
    const config = await settings(), dialog = $(".mh-dialog-backdrop"), body = $(".mh-dialog-body");
    const riskPerUnit = Math.max(0.0001, Math.abs(item.entry - item.stop));
    const recommendedSize = Math.max(0.01, Math.floor((config.riskDollars / riskPerUnit) * 100) / 100);
    const account = latestAccount?.balance || {};
    const equity = Math.max(0, account.balance ?? 0);
    const available = account.available;
    body.innerHTML = `<span class="mh-kicker">تجهيز صفقة مشروطة</span><h2>${item.symbol} <em>${item.score}/100</em></h2>
      <div class="mh-plan"><label>نوع الأمر<select class="mh-order-type"><option value="STOP">اختراق أعلى السعر</option><option value="LIMIT">إعادة اختبار</option><option value="MARKET">سعر السوق</option></select></label><label>الحجم المحسوب<input class="mh-size" type="number" min="0.01" step="0.01" value="${recommendedSize || config.orderSize}"></label><span>الدخول<b>${number(item.entry)}</b></span><span>الوقف<b>${number(item.stop)}</b></span><span>الهدف<b>${number(item.target1)}</b></span><span>المخاطرة/وحدة<b>${number(riskPerUnit)} $</b></span></div>
      <div class="mh-risk-summary"><span>قيمة الصفقة الكاملة<b class="mh-exposure">—</b></span><span>أقصى خسارة عند الوقف<b class="mh-max-loss">—</b></span><span>نسبة المخاطرة من الحساب<b class="mh-risk-pct">—</b></span><span>المتاح حالياً<b>${available == null ? "—" : `${number(available)} $`}</b></span></div><div class="mh-risk-alert"></div>
      <p class="mh-warning">لن يُرسل أي أمر قبل معاينته. التنفيذ يحتاج تفعيلًا منفصلًا على الخادم.</p><div class="mh-dialog-actions"><button class="mh-preview">معاينة الأمر</button>${config.showExecution ? '<button class="mh-execute">تنفيذ مؤكد</button>' : ""}</div><div class="mh-result"></div>`;
    dialog.hidden = false;
    const updateRisk = () => {
      const size = Math.max(0, Number(body.querySelector(".mh-size").value) || 0);
      const exposure = size * item.entry, maxLoss = size * riskPerUnit;
      const riskPct = equity > 0 ? maxLoss / equity * 100 : 0;
      body.querySelector(".mh-exposure").textContent = `${number(exposure)} $`;
      body.querySelector(".mh-max-loss").textContent = `${number(maxLoss)} $`;
      body.querySelector(".mh-risk-pct").textContent = equity ? `${number(riskPct)}%` : "—";
      const alert = body.querySelector(".mh-risk-alert");
      alert.className = `mh-risk-alert ${riskPct > 2 ? "danger" : riskPct > 1 ? "caution" : "safe"}`;
      alert.textContent = riskPct > 2 ? "مخاطرة مرتفعة: خفّض الحجم قبل المعاينة." : riskPct > 1 ? "المخاطرة أعلى من 1% من الحساب." : "حجم المخاطرة ضمن الحد المحافظ (1% أو أقل).";
    };
    body.querySelector(".mh-size").addEventListener("input", updateRisk);
    updateRisk();
    const submit = async (action) => {
      const result = body.querySelector(".mh-result"), size = Number(body.querySelector(".mh-size").value), type = body.querySelector(".mh-order-type").value;
      result.textContent = "جارٍ فحص الأمر...";
      try {
        const response = await fetch(`${config.apiBase.replace(/\/$/, "")}/api/capital/orders`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.botToken}` }, body: JSON.stringify({ action, epic: item.epic, symbol: item.symbol, direction: "BUY", type, size, entry: item.entry, stop: item.stop, target: item.target1, score: item.score, confirmation: action === "execute" ? "EXECUTE" : undefined }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "رفض الأمر");
        result.innerHTML = action === "preview" ? `المخاطرة القصوى: <b>${number(data.preview.riskAmount)} $</b> · العائد المتوقع: <b>${number(data.preview.rewardAmount)} $</b>` : `تم إرسال الأمر. المرجع: <b>${data.dealReference}</b>`;
      } catch (error) { result.textContent = error.message || "تعذر تجهيز الأمر."; result.className = "mh-result error"; }
    };
    body.querySelector(".mh-preview").addEventListener("click", () => submit("preview"));
    body.querySelector(".mh-execute")?.addEventListener("click", () => { if (confirm(`تأكيد إرسال أمر ${item.symbol} إلى Capital؟`)) submit("execute"); });
  }

  function open() {
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); refresh();
    clearInterval(timer); timer = setInterval(refresh, 60_000);
    clearInterval(countdownTimer); countdownTimer = setInterval(() => { const seconds = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)); $(".mh-countdown").textContent = `التحديث القادم خلال ${seconds} ثانية`; }, 1000);
  }
  function close() { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); clearInterval(timer); clearInterval(countdownTimer); }
  $(".mh-fab").addEventListener("click", open); $(".mh-close").addEventListener("click", close); $(".mh-refresh").addEventListener("click", refresh);
  $(".mh-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $(".mh-dialog-close").addEventListener("click", () => { $(".mh-dialog-backdrop").hidden = true; });
})();
