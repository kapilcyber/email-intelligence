/* Injected at build time into dist/taskpane.js */
var DASHBOARD_URL = "https://172.16.200.30";

(function () {
  var currentContext = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError) {
    var el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = isError ? "status status-error" : "status";
  }

  function setField(id, value) {
    var el = byId(id);
    if (!el) return;
    el.textContent = value || "Not available";
  }

  function normalizeAddress(entry) {
    if (!entry) return "";
    var email = entry.emailAddress || entry.address || "";
    var name = entry.displayName || entry.name || "";
    if (name && email && name !== email) return name + " <" + email + ">";
    return email || name || "";
  }

  function normalizeAddressList(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var text = normalizeAddress(list[i]);
      if (text) out.push(text);
    }
    return out;
  }

  function getStringValue(valueOrAccessor, callback) {
    if (typeof valueOrAccessor === "string") {
      callback(valueOrAccessor);
      return;
    }
    if (valueOrAccessor && typeof valueOrAccessor.getAsync === "function") {
      valueOrAccessor.getAsync(function (result) {
        if (result && result.status === Office.AsyncResultStatus.Succeeded) {
          callback(result.value || "");
        } else {
          callback("");
        }
      });
      return;
    }
    callback("");
  }

  function getRecipients(valueOrAccessor, callback) {
    if (Array.isArray(valueOrAccessor)) {
      callback(normalizeAddressList(valueOrAccessor));
      return;
    }
    if (valueOrAccessor && typeof valueOrAccessor.getAsync === "function") {
      valueOrAccessor.getAsync(function (result) {
        if (result && result.status === Office.AsyncResultStatus.Succeeded) {
          callback(normalizeAddressList(result.value));
        } else {
          callback([]);
        }
      });
      return;
    }
    callback([]);
  }

  function toDashboardUrl(withContext) {
    if (!withContext || !currentContext) return DASHBOARD_URL;

    try {
      var url = new URL(DASHBOARD_URL);
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/dashboard";
      }
      url.searchParams.set("source", "outlook-addin");
      if (currentContext.mailbox) url.searchParams.set("outlookMailbox", currentContext.mailbox);
      if (currentContext.subject) url.searchParams.set("outlookSubject", currentContext.subject);
      if (currentContext.from) url.searchParams.set("outlookFrom", currentContext.from);
      if (currentContext.itemId) url.searchParams.set("outlookItemId", currentContext.itemId);
      if (currentContext.restId) url.searchParams.set("outlookRestId", currentContext.restId);
      if (currentContext.to && currentContext.to.length) {
        url.searchParams.set("outlookTo", currentContext.to.join("; "));
      }
      if (currentContext.cc && currentContext.cc.length) {
        url.searchParams.set("outlookCc", currentContext.cc.join("; "));
      }
      return url.toString();
    } catch (e) {
      return DASHBOARD_URL;
    }
  }

  function openUrl(url) {
    try {
      var w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) {
        setStatus("Opened in a new window.");
      } else {
        setStatus("Popup blocked. Allow popups for this add-in or use the link below.");
        showFallbackLink(url);
      }
    } catch (e) {
      setStatus("Could not open: " + (e && e.message ? e.message : String(e)), true);
    }
  }

  function renderContext(context) {
    currentContext = context;
    setField("context-mailbox", context.mailbox);
    setField("context-subject", context.subject);
    setField("context-from", context.from);
    setField("context-to", (context.to || []).join(", "));
    setField("context-item-id", context.itemId);
    setField("context-rest-id", context.restId);
  }

  function openDashboard() {
    openUrl(DASHBOARD_URL);
  }

  function openDashboardWithContext() {
    openUrl(toDashboardUrl(true));
  }

  function showFallbackLink(url) {
    var main = document.querySelector(".wrap");
    if (!main) return;
    var a = main.querySelector(".fallback-link");
    if (!a) {
      var p = document.createElement("p");
      p.className = "muted";
      a = document.createElement("a");
      a.className = "fallback-link";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open dashboard";
      p.appendChild(a);
      main.appendChild(p);
    }
    a.href = url;
  }

  function loadContext() {
    if (!(window.Office && Office.context && Office.context.mailbox)) {
      setStatus("Office context is not available in this host.", true);
      return;
    }

    var mailbox = Office.context.mailbox;
    var item = mailbox.item;
    if (!item) {
      setStatus("Open a message in Outlook to capture item context.", true);
      return;
    }

    var context = {
      mailbox: mailbox.userProfile && mailbox.userProfile.emailAddress ? mailbox.userProfile.emailAddress : "",
      itemId: item.itemId || "",
      restId: "",
      subject: "",
      from: normalizeAddress(item.from),
      to: [],
      cc: [],
    };

    if (context.itemId && mailbox.convertToRestId && Office.MailboxEnums && Office.MailboxEnums.RestVersion) {
      try {
        context.restId = mailbox.convertToRestId(context.itemId, Office.MailboxEnums.RestVersion.v2_0);
      } catch (e) {
        context.restId = "";
      }
    }

    var pending = 3;
    function done() {
      pending -= 1;
      if (pending === 0) {
        renderContext(context);
        setStatus("Current Outlook item loaded.");
      }
    }

    getStringValue(item.subject, function (value) {
      context.subject = value;
      done();
    });

    getRecipients(item.to, function (list) {
      context.to = list;
      done();
    });

    getRecipients(item.cc, function (list) {
      context.cc = list;
      done();
    });
  }

  Office.onReady(function () {
    var btn = byId("open-dashboard");
    var ctxBtn = byId("open-dashboard-context");
    if (btn) btn.addEventListener("click", openDashboard);
    if (ctxBtn) ctxBtn.addEventListener("click", openDashboardWithContext);
    loadContext();
  });
})();
