/* Injected at build time into dist/taskpane.js */
var DASHBOARD_URL = "{{DASHBOARD_URL}}";

(function () {
  function setStatus(msg) {
    var el = document.getElementById("status");
    if (el) el.textContent = msg || "";
  }

  function openDashboard() {
    try {
      var url = DASHBOARD_URL;
      var w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) {
        setStatus("Opened in a new window.");
      } else {
        setStatus("Popup blocked. Allow popups for this add-in or use the link below.");
        showFallbackLink(url);
      }
    } catch (e) {
      setStatus("Could not open: " + (e && e.message ? e.message : String(e)));
    }
  }

  function showFallbackLink(url) {
    var main = document.querySelector(".wrap");
    if (!main || main.querySelector(".fallback-link")) return;
    var p = document.createElement("p");
    p.className = "muted";
    var a = document.createElement("a");
    a.className = "fallback-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open dashboard";
    p.appendChild(a);
    main.appendChild(p);
  }

  Office.onReady(function () {
    var btn = document.getElementById("open-dashboard");
    if (btn) btn.addEventListener("click", openDashboard);
  });
})();
