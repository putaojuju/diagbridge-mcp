(function () {
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const infoState = document.getElementById("infoState");
  const infoConnected = document.getElementById("infoConnected");
  const infoStartedAt = document.getElementById("infoStartedAt");
  const infoExpiresAt = document.getElementById("infoExpiresAt");
  const infoTokenLast4 = document.getElementById("infoTokenLast4");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const activityTbody = document.getElementById("activityTbody");

  // Pairing Card Elements
  const pairingCard = document.getElementById("pairingCard");
  const selectEndpoint = document.getElementById("selectEndpoint");
  const inputToken = document.getElementById("inputToken");
  const btnToggleToken = document.getElementById("btnToggleToken");
  const pairingExpiresAt = document.getElementById("pairingExpiresAt");
  const btnCopyConnection = document.getElementById("btnCopyConnection");
  const copyTip = document.getElementById("copyTip");

  // IN-MEMORY STORAGE ONLY (never saved to localStorage/sessionStorage)
  let activeOneTimeToken = null;
  let activeExpiresAt = null;
  let activeEndpoints = [];

  function formatTime(isoString) {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString() + " (" + d.toLocaleDateString() + ")";
    } catch (_) {
      return isoString;
    }
  }

  function showPairingCard() {
    if (!activeOneTimeToken) return;

    inputToken.value = activeOneTimeToken;
    inputToken.type = "password";
    btnToggleToken.textContent = "显示密钥";
    pairingExpiresAt.textContent = formatTime(activeExpiresAt);

    selectEndpoint.innerHTML = activeEndpoints
      .map((ep) => `<option value="${ep}">${ep}</option>`)
      .join("");

    pairingCard.style.display = "block";
  }

  function hidePairingCard() {
    activeOneTimeToken = null;
    activeExpiresAt = null;
    activeEndpoints = [];
    inputToken.value = "";
    pairingCard.style.display = "none";
  }

  function updateStatusUI(statusData) {
    const state = statusData.state || "stopped";
    const connected = Boolean(statusData.connected);
    const reason = statusData.disconnectReason;

    statusBadge.className = "status-badge status-" + state;

    if (state === "stopped") {
      if (reason === "session-expired") {
        statusText.textContent = "会话已过期";
        infoState.textContent = "已过期";
      } else {
        statusText.textContent = "已就绪 (停止)";
        infoState.textContent = "已关闭";
      }
      infoState.className = "value";
      infoConnected.textContent = "不可用";
      btnStart.disabled = false;
      btnStop.disabled = true;
      hidePairingCard();
    } else if (state === "waiting") {
      statusText.textContent = "等待远程连接";
      infoState.textContent = "等待远程连接";
      infoState.className = "value highlight";
      infoConnected.textContent = "未连接";
      btnStart.disabled = false;
      btnStop.disabled = false;
    } else if (state === "connected") {
      statusText.textContent = "诊断中 (已连接)";
      infoState.textContent = "诊断中";
      infoState.className = "value highlight";
      infoConnected.textContent = "已连接";
      btnStart.disabled = false;
      btnStop.disabled = false;
    }

    infoStartedAt.textContent = formatTime(statusData.startedAt);
    infoExpiresAt.textContent = formatTime(statusData.expiresAt);
    infoTokenLast4.textContent = statusData.tokenLast4 ? "••••••••" + statusData.tokenLast4 : "-";
  }

  function fetchStatus() {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => updateStatusUI(data))
      .catch((err) => console.error("Error fetching status:", err));
  }

  function fetchActivity() {
    fetch("/api/activity")
      .then((res) => res.json())
      .then((events) => {
        if (!Array.isArray(events) || events.length === 0) {
          activityTbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无 MCP 调用记录</td></tr>';
          return;
        }

        const rowsHtml = events
          .map((evt) => {
            const statusClass = evt.status === "ok" ? "ok" : "error";
            const statusLabel = evt.status === "ok" ? "成功" : "失败";
            const timeStr = new Date(evt.timestamp).toLocaleTimeString();
            const paramSummary = evt.paramSummary || "{}";

            return `
              <tr>
                <td>${timeStr}</td>
                <td><code>${evt.toolName}</code></td>
                <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
                <td><code>${paramSummary}</code></td>
              </tr>
            `;
          })
          .join("");

        activityTbody.innerHTML = rowsHtml;
      })
      .catch((err) => console.error("Error fetching activity:", err));
  }

  btnToggleToken.addEventListener("click", function () {
    if (inputToken.type === "password") {
      inputToken.type = "text";
      btnToggleToken.textContent = "隐藏密钥";
    } else {
      inputToken.type = "password";
      btnToggleToken.textContent = "显示密钥";
    }
  });

  btnCopyConnection.addEventListener("click", function () {
    if (!activeOneTimeToken) return;

    const chosenEndpoint = selectEndpoint.value || "http://127.0.0.1:8787/mcp";
    const textToCopy = `DiagBridge MCP\nEndpoint: ${chosenEndpoint}\nAuthorization: Bearer ${activeOneTimeToken}\nExpires: ${formatTime(activeExpiresAt)}`;

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        copyTip.classList.add("visible");
        setTimeout(() => copyTip.classList.remove("visible"), 2500);
      })
      .catch((err) => {
        console.error("Copy failed:", err);
      });
  });

  btnStart.addEventListener("click", function () {
    btnStart.disabled = true;
    fetch("/api/session/start", { method: "POST" })
      .then((res) => res.json())
      .then((resData) => {
        const statusData = resData.status || resData;
        const connData = resData.connection;

        if (connData && connData.token) {
          activeOneTimeToken = connData.token;
          activeExpiresAt = connData.expiresAt;
          activeEndpoints = connData.candidateEndpoints || [];
          showPairingCard();
        }

        updateStatusUI(statusData);
        fetchActivity();
      })
      .finally(() => {
        btnStart.disabled = false;
      });
  });

  btnStop.addEventListener("click", function () {
    btnStop.disabled = true;
    fetch("/api/session/stop", { method: "POST" })
      .then((res) => res.json())
      .then((resData) => {
        const statusData = resData.status || resData;
        hidePairingCard();
        updateStatusUI(statusData);
        fetchActivity();
      })
      .finally(() => {
        btnStop.disabled = false;
      });
  });

  // Initial load & Polling
  fetchStatus();
  fetchActivity();
  setInterval(fetchStatus, 2000);
  setInterval(fetchActivity, 2000);
})();
