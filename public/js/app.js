// ─── State ───
let sites = [];
let currentAnalyticsSiteId = null;
let currentPeriod = "7d";

// ─── API Helpers ───
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  },
  async post(url, data) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json();
  },
  async put(url, data) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  },
  async delete(url) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
    return res.json();
  },
};

// ─── Initialization ───
document.addEventListener("DOMContentLoaded", () => {
  loadSites();
});

// ─── Navigation ───
function navigateTo(page, params) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));

  document.getElementById(`view-${page}`).classList.add("active");
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add("active");

  if (page === "analytics" && params?.siteId) {
    currentAnalyticsSiteId = params.siteId;
    loadAnalytics(params.siteId);
  }

  if (page === "alerts") {
    loadAlerts();
  }

  window.scrollTo(0, 0);
}

// ─── Load Sites ───
async function loadSites() {
  try {
    sites = await API.get("/api/sites");
    renderSites();
    updateOverviewStats();
  } catch (err) {
    console.error("Failed to load sites:", err);
    showToast("Failed to load sites", "error");
  }
}

// ─── Render Sites Grid ───
function renderSites() {
  const grid = document.getElementById("sites-grid");

  if (sites.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌐</div>
        <h3>No sites yet</h3>
        <p>Add your first website to start tracking analytics.</p>
        <button class="btn btn-primary" onclick="openAddSiteModal()">+ Add Your First Site</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = sites
    .map(
      (site) => `
    <div class="site-card" onclick="navigateTo('analytics', { siteId: '${site.id}' })">
      <div class="site-thumbnail">
        ${
          site.thumbnail_url
            ? `<img src="${escapeHtml(site.thumbnail_url)}" alt="${escapeHtml(site.name)}" onerror="this.parentElement.innerHTML='🌐'">`
            : "🌐"
        }
      </div>
      <div class="site-info">
        <div class="site-name">
          <span class="status-badge status-${site.status}"></span>
          ${escapeHtml(site.name)}
          <span class="category-badge">${escapeHtml(site.category)}</span>
        </div>
        <div class="site-url">${escapeHtml(site.url)}</div>
        ${
          site.description
            ? `<div class="site-description">${escapeHtml(site.description)}</div>`
            : ""
        }
        <div class="site-stats">
          <div class="site-stat"><strong>${formatNumber(site.total_views || 0)}</strong> views</div>
          <div class="site-stat"><strong>${formatNumber(site.unique_visitors || 0)}</strong> visitors</div>
        </div>
      </div>
      <div class="site-actions" onclick="event.stopPropagation()">
        <button class="btn btn-small" onclick="openEditSiteModal('${site.id}')">Edit</button>
        <button class="btn btn-small btn-danger" onclick="deleteSite('${site.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

// ─── Update Overview Stats ───
function updateOverviewStats() {
  const totalSites = sites.length;
  const totalViews = sites.reduce((sum, s) => sum + (s.total_views || 0), 0);
  const totalVisitors = sites.reduce((sum, s) => sum + (s.unique_visitors || 0), 0);
  const activeSites = sites.filter((s) => s.status === "active").length;

  document.getElementById("total-sites").textContent = formatNumber(totalSites);
  document.getElementById("total-views").textContent = formatNumber(totalViews);
  document.getElementById("total-visitors").textContent = formatNumber(totalVisitors);
  document.getElementById("active-sites").textContent = formatNumber(activeSites);
}

// ─── Modal: Add Site ───
function openAddSiteModal() {
  document.getElementById("modal-title").textContent = "Add New Site";
  document.getElementById("site-form").reset();
  document.getElementById("site-id").value = "";
  document.getElementById("site-modal").classList.add("active");
}

// ─── Modal: Edit Site ───
function openEditSiteModal(siteId) {
  const site = sites.find((s) => s.id === siteId);
  if (!site) return;

  document.getElementById("modal-title").textContent = "Edit Site";
  document.getElementById("site-id").value = site.id;
  document.getElementById("site-name").value = site.name;
  document.getElementById("site-url").value = site.url;
  document.getElementById("site-description").value = site.description || "";
  document.getElementById("site-thumbnail").value = site.thumbnail_url || "";
  document.getElementById("site-category").value = site.category;
  document.getElementById("site-status").value = site.status;
  document.getElementById("site-modal").classList.add("active");
}

function closeModal() {
  document.getElementById("site-modal").classList.remove("active");
}

// ─── Save Site ───
async function saveSite(event) {
  event.preventDefault();

  const id = document.getElementById("site-id").value;
  const data = {
    name: document.getElementById("site-name").value,
    url: document.getElementById("site-url").value,
    description: document.getElementById("site-description").value,
    thumbnail_url: document.getElementById("site-thumbnail").value,
    category: document.getElementById("site-category").value,
    status: document.getElementById("site-status").value,
  };

  try {
    if (id) {
      await API.put(`/api/sites/${id}`, data);
      showToast("Site updated successfully", "success");
    } else {
      await API.post("/api/sites", data);
      showToast("Site added successfully", "success");
    }
    closeModal();
    loadSites();
  } catch (err) {
    console.error("Failed to save site:", err);
    showToast("Failed to save site", "error");
  }
}

// ─── Delete Site ───
async function deleteSite(siteId) {
  if (!confirm("Are you sure you want to delete this site? This action cannot be undone.")) {
    return;
  }

  try {
    await API.delete(`/api/sites/${siteId}`);
    showToast("Site deleted", "success");
    loadSites();
  } catch (err) {
    console.error("Failed to delete site:", err);
    showToast("Failed to delete site", "error");
  }
}

// ─── Analytics ───
function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === period);
  });
  if (currentAnalyticsSiteId) {
    loadAnalytics(currentAnalyticsSiteId);
  }
}

async function loadAnalytics(siteId) {
  const site = sites.find((s) => s.id === siteId);
  if (site) {
    document.getElementById("analytics-site-name").textContent = site.name;
    document.getElementById("tracking-code").textContent = generateTrackingScript(siteId);
  }

  try {
    const data = await API.get(`/api/sites/${siteId}/analytics?period=${currentPeriod}`);

    document.getElementById("analytics-views").textContent = formatNumber(data.total_views);
    document.getElementById("analytics-visitors").textContent = formatNumber(data.unique_visitors);

    renderChart(data.daily_stats);
    renderTopPages(data.top_pages);
    renderTopReferrers(data.top_referrers);
  } catch (err) {
    console.error("Failed to load analytics:", err);
    showToast("Failed to load analytics", "error");
  }
}

// ─── Render Chart (Canvas-based) ───
function renderChart(dailyStats) {
  const canvas = document.getElementById("views-chart");
  const emptyMsg = document.getElementById("chart-empty");
  const ctx = canvas.getContext("2d");

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!dailyStats || dailyStats.length === 0) {
    canvas.style.display = "none";
    emptyMsg.style.display = "block";
    return;
  }

  canvas.style.display = "block";
  emptyMsg.style.display = "none";

  // Set canvas size for sharp rendering
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = (rect.width - 48) * dpr;
  canvas.height = 250 * dpr;
  canvas.style.width = rect.width - 48 + "px";
  canvas.style.height = "250px";
  ctx.scale(dpr, dpr);

  const w = rect.width - 48;
  const h = 250;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxViews = Math.max(...dailyStats.map((d) => d.page_views), 1);

  // Draw grid lines
  ctx.strokeStyle = "#2a2a2e";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#6b6b73";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    const val = Math.round(maxViews - (maxViews / 4) * i);
    ctx.fillText(val.toString(), padding.left - 8, y + 4);
  }

  // Draw area chart
  const points = dailyStats.map((d, i) => ({
    x: padding.left + (chartW / Math.max(dailyStats.length - 1, 1)) * i,
    y: padding.top + chartH - (d.page_views / maxViews) * chartH,
    views: d.page_views,
    date: d.date,
  }));

  // Fill area
  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + chartH);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  gradient.addColorStop(0, "rgba(99, 102, 241, 0.3)");
  gradient.addColorStop(1, "rgba(99, 102, 241, 0.02)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Draw dots
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#6366f1";
    ctx.fill();
    ctx.strokeStyle = "#161618";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Date labels
  ctx.fillStyle = "#6b6b73";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  const maxLabels = 7;
  const step = Math.ceil(points.length / maxLabels);
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      const label = p.date.slice(5); // MM-DD
      ctx.fillText(label, p.x, h - padding.bottom + 20);
    }
  });
}

// ─── Render Tables ───
function renderTopPages(pages) {
  const tbody = document.getElementById("top-pages-body");
  if (!pages || pages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-row">No data yet</td></tr>';
    return;
  }
  tbody.innerHTML = pages
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.path)}</td>
      <td>${formatNumber(p.views)}</td>
    </tr>
  `
    )
    .join("");
}

function renderTopReferrers(referrers) {
  const tbody = document.getElementById("top-referrers-body");
  if (!referrers || referrers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-row">No data yet</td></tr>';
    return;
  }
  tbody.innerHTML = referrers
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(truncateUrl(r.referrer))}</td>
      <td>${formatNumber(r.views)}</td>
    </tr>
  `
    )
    .join("");
}

// ─── Tracking Script ───
function generateTrackingScript(siteId) {
  const serverUrl = window.location.origin;
  return `<!-- Site Tracker -->
<script>
(function() {
  var SITE_ID = '${siteId}';
  var SERVER_URL = '${serverUrl}';
  var visitorId = localStorage.getItem('tracker_vid');
  if (!visitorId) {
    visitorId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('tracker_vid', visitorId);
  }
  fetch(SERVER_URL + '/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_id: SITE_ID,
      visitor_id: visitorId,
      page_path: window.location.pathname,
      referrer: document.referrer || '',
      screen_width: screen.width,
      screen_height: screen.height
    })
  }).catch(function() {});
})();
<\/script>`;
}

function copyTrackingScript() {
  const code = document.getElementById("tracking-code").textContent;
  navigator.clipboard
    .writeText(code)
    .then(() => showToast("Script copied to clipboard!", "success"))
    .catch(() => showToast("Failed to copy", "error"));
}

// ─── Utility Functions ───
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function truncateUrl(url) {
  try {
    if (url === "Direct") return "Direct";
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "..." : url;
  }
}

function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Keyboard Shortcuts ───
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "n" && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
    openAddSiteModal();
  }
});

// ═══════════════════════════════════════════
// ─── ALERTS & MONITORING ───
// ═══════════════════════════════════════════

let alertConfig = null;
let alertHealth = {};
let alertHistory = [];
let alertPollInterval = null;

// ─── Load Alerts Page ───
async function loadAlerts() {
  try {
    const [config, health, history] = await Promise.all([
      API.get("/api/alerts/config"),
      API.get("/api/alerts/health"),
      API.get("/api/alerts/history"),
    ]);

    alertConfig = config;
    alertHealth = health;
    alertHistory = history;

    renderAlertConfig();
    renderHealthGrid();
    renderAlertHistory();
  } catch (err) {
    console.error("Failed to load alerts:", err);
  }
}

// ─── Render Alert Config to UI ───
function renderAlertConfig() {
  if (!alertConfig) return;

  document.getElementById("health-enabled").checked = alertConfig.health_check.enabled;
  document.getElementById("health-interval").value = alertConfig.health_check.interval_minutes;
  document.getElementById("health-timeout").value = alertConfig.health_check.timeout_seconds;

  document.getElementById("threshold-enabled").checked = alertConfig.view_threshold.enabled;
  document.getElementById("threshold-limit").value = alertConfig.view_threshold.daily_limit;

  document.getElementById("email-enabled").checked = alertConfig.email.enabled;
  document.getElementById("email-to").value = alertConfig.email.to || "";
  document.getElementById("email-smtp-host").value = alertConfig.email.smtp_host || "";
  document.getElementById("email-smtp-port").value = alertConfig.email.smtp_port || 587;
  document.getElementById("email-smtp-user").value = alertConfig.email.smtp_user || "";
  document.getElementById("email-smtp-pass").value = "";
  document.getElementById("email-smtp-secure").checked = alertConfig.email.smtp_secure || false;

  document.getElementById("slack-enabled").checked = alertConfig.slack.enabled;
  document.getElementById("slack-webhook").value = alertConfig.slack.webhook_url || "";
  document.getElementById("slack-channel").value = alertConfig.slack.channel || "";
}

// ─── Save Alert Config ───
async function updateAlertConfig() {
  const config = {
    health_check: {
      enabled: document.getElementById("health-enabled").checked,
      interval_minutes: parseInt(document.getElementById("health-interval").value) || 5,
      timeout_seconds: parseInt(document.getElementById("health-timeout").value) || 10,
    },
    view_threshold: {
      enabled: document.getElementById("threshold-enabled").checked,
      daily_limit: parseInt(document.getElementById("threshold-limit").value) || 1000,
    },
    email: {
      enabled: document.getElementById("email-enabled").checked,
      to: document.getElementById("email-to").value,
      smtp_host: document.getElementById("email-smtp-host").value,
      smtp_port: parseInt(document.getElementById("email-smtp-port").value) || 587,
      smtp_user: document.getElementById("email-smtp-user").value,
      smtp_pass: document.getElementById("email-smtp-pass").value || undefined,
      smtp_secure: document.getElementById("email-smtp-secure").checked,
    },
    slack: {
      enabled: document.getElementById("slack-enabled").checked,
      webhook_url: document.getElementById("slack-webhook").value,
      channel: document.getElementById("slack-channel").value,
    },
  };

  try {
    alertConfig = await API.put("/api/alerts/config", config);
    showToast("Alert config saved", "success");
  } catch (err) {
    showToast("Failed to save config", "error");
  }
}

// ─── Render Health Grid ───
function renderHealthGrid() {
  const grid = document.getElementById("health-grid");
  if (sites.length === 0) {
    grid.innerHTML = '<div class="text-muted" style="padding:1rem">Add sites to monitor their health.</div>';
    return;
  }

  grid.innerHTML = sites
    .map((site) => {
      const health = alertHealth[site.id];
      const status = health ? health.status : "unknown";
      const statusText = status === "up" ? `Up · ${health.responseTime}ms` : status === "down" ? "DOWN" : status === "degraded" ? `Degraded · HTTP ${health.statusCode}` : "Not checked yet";
      const lastChecked = health?.lastChecked ? timeAgo(health.lastChecked) : "—";

      return `
        <div class="health-card">
          <div class="health-dot ${status}"></div>
          <div class="health-info">
            <div class="health-name">${escapeHtml(site.name)}</div>
            <div class="health-meta">${statusText}</div>
          </div>
          <div class="health-time">${lastChecked}</div>
          <button class="btn btn-small" onclick="manualCheck('${site.id}')">Check</button>
        </div>
      `;
    })
    .join("");
}

// ─── Manual Health Check ───
async function manualCheck(siteId) {
  try {
    showToast("Running health check...", "success");
    const result = await API.post(`/api/alerts/check/${siteId}`);
    alertHealth[siteId] = result;
    renderHealthGrid();
    showToast(`Health check complete: ${result.status}`,
      result.status === "up" ? "success" : "error");
  } catch (err) {
    showToast("Health check failed", "error");
  }
}

// ─── Render Alert History ───
function renderAlertHistory() {
  const tbody = document.getElementById("alert-history-body");
  if (!alertHistory || alertHistory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No alerts yet</td></tr>';
    return;
  }
  tbody.innerHTML = alertHistory
    .map((alert) => {
      const typeIcon = alert.type === "downtime" ? "🔴" : alert.type === "recovery" ? "🟢" : alert.type === "threshold" ? "📈" : "🔔";
      return `
        <tr>
          <td>${typeIcon} ${escapeHtml(alert.type)}</td>
          <td>${escapeHtml(alert.site_name)}</td>
          <td>${escapeHtml(alert.message)}</td>
          <td>${timeAgo(alert.sent_at)}</td>
        </tr>
      `;
    })
    .join("");
}

// ─── Send Test Alert ───
async function sendTestAlert() {
  try {
    await API.post("/api/alerts/test");
    showToast("Test alert sent! Check your Slack/email.", "success");
    // Reload history
    const history = await API.get("/api/alerts/history");
    alertHistory = history;
    renderAlertHistory();
  } catch (err) {
    showToast("Failed to send test alert", "error");
  }
}

// ─── Time Ago Helper ───
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
