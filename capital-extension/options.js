const ids = ["apiBase", "botToken", "orderSize", "riskDollars", "showExecution"];
chrome.storage.sync.get({ apiBase: "http://localhost:3000", botToken: "", orderSize: 1, riskDollars: 3, showExecution: false }, (data) => ids.forEach((id) => { const el = document.getElementById(id); if (el.type === "checkbox") el.checked = data[id]; else el.value = data[id]; }));
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({ apiBase: document.getElementById("apiBase").value.trim().replace(/\/$/, ""), botToken: document.getElementById("botToken").value, orderSize: Number(document.getElementById("orderSize").value) || 1, riskDollars: Number(document.getElementById("riskDollars").value) || 3, showExecution: document.getElementById("showExecution").checked }, () => { document.getElementById("saved").textContent = "تم الحفظ"; setTimeout(() => document.getElementById("saved").textContent = "", 1800); });
});
