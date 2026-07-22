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

  function formatTime(isoString) {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString() + " (" + d.toLocaleDateString() + ")";
    } catch (_) {
      return isoString;
    }
  }

  function updateStatusUI(statusData) {
    const state = statusData.state || "stopped";
    const connected = Boolean(statusData.connected);

    // Update Header Badge & Text
    statusBadge.className = "status-badge status-" + state;

    if (state === "stopped") {
      statusText.textContent = "已就绪 (停止)";
      infoState.textContent = "已关闭";
      infoState.className = "value";
      infoConnected.textContent = "不可用";
      btnStart.disabled = false;
      btnStop.disabled = true;
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

  btnStart.addEventListener("click", function () {
    btnStart.disabled = true;
    fetch("/api/session/start", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        updateStatusUI(data);
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
      .then((data) => {
        updateStatusUI(data);
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
