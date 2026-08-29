require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const nodemailer = require("nodemailer");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
let useInMemory = false;
let inMemorySites = [];
let inMemoryPageViews = [];

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log("✅ Connected to Supabase");
} else {
  useInMemory = true;
  console.log("⚠️  No Supabase config — using in-memory storage (data lost on restart)");
}

// ─── Helper: get today's date string ───
function today() {
  return new Date().toISOString().split("T")[0];
}

// ─── API: Get all sites ───
app.get("/api/sites", async (req, res) => {
  try {
    if (useInMemory) {
      const sitesWithStats = inMemorySites.map((site) => {
        const views = inMemoryPageViews.filter((pv) => pv.site_id === site.id);
        const uniqueVisitors = new Set(views.map((v) => v.visitor_id)).size;
        return { ...site, total_views: views.length, unique_visitors: uniqueVisitors };
      });
      return res.json(sitesWithStats);
    }

    const { data: sites, error } = await supabase
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get stats for each site
    const sitesWithStats = await Promise.all(
      sites.map(async (site) => {
        const { count: totalViews } = await supabase
          .from("page_views")
          .select("*", { count: "exact", head: true })
          .eq("site_id", site.id);

        const { data: uniqueData } = await supabase
          .from("page_views")
          .select("visitor_id")
          .eq("site_id", site.id);

        const uniqueVisitors = uniqueData ? new Set(uniqueData.map((v) => v.visitor_id)).size : 0;

        return { ...site, total_views: totalViews || 0, unique_visitors: uniqueVisitors };
      })
    );

    res.json(sitesWithStats);
  } catch (err) {
    console.error("Error fetching sites:", err);
    res.status(500).json({ error: "Failed to fetch sites" });
  }
});

// ─── API: Get single site ───
app.get("/api/sites/:id", async (req, res) => {
  try {
    if (useInMemory) {
      const site = inMemorySites.find((s) => s.id === req.params.id);
      if (!site) return res.status(404).json({ error: "Site not found" });
      const views = inMemoryPageViews.filter((pv) => pv.site_id === site.id);
      const uniqueVisitors = new Set(views.map((v) => v.visitor_id)).size;
      return res.json({ ...site, total_views: views.length, unique_visitors: uniqueVisitors });
    }

    const { data: site, error } = await supabase
      .from("sites")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !site) return res.status(404).json({ error: "Site not found" });

    const { count: totalViews } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .eq("site_id", site.id);

    const { data: uniqueData } = await supabase
      .from("page_views")
      .select("visitor_id")
      .eq("site_id", site.id);

    const uniqueVisitors = uniqueData ? new Set(uniqueData.map((v) => v.visitor_id)).size : 0;

    res.json({ ...site, total_views: totalViews || 0, unique_visitors: uniqueVisitors });
  } catch (err) {
    console.error("Error fetching site:", err);
    res.status(500).json({ error: "Failed to fetch site" });
  }
});

// ─── API: Add a new site ───
app.post("/api/sites", async (req, res) => {
  try {
    const { name, url, description, thumbnail_url, category, status } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }

    const newSite = {
      id: uuidv4(),
      name,
      url,
      description: description || "",
      thumbnail_url: thumbnail_url || "",
      category: category || "other",
      status: status || "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (useInMemory) {
      inMemorySites.unshift(newSite);
      return res.status(201).json(newSite);
    }

    const { data, error } = await supabase.from("sites").insert(newSite).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("Error adding site:", err);
    res.status(500).json({ error: "Failed to add site" });
  }
});

// ─── API: Update a site ───
app.put("/api/sites/:id", async (req, res) => {
  try {
    const { name, url, description, thumbnail_url, category, status } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (description !== undefined) updates.description = description;
    if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url;
    if (category !== undefined) updates.category = category;
    if (status !== undefined) updates.status = status;

    if (useInMemory) {
      const idx = inMemorySites.findIndex((s) => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Site not found" });
      inMemorySites[idx] = { ...inMemorySites[idx], ...updates };
      return res.json(inMemorySites[idx]);
    }

    const { data, error } = await supabase
      .from("sites")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: "Site not found" });
    res.json(data);
  } catch (err) {
    console.error("Error updating site:", err);
    res.status(500).json({ error: "Failed to update site" });
  }
});

// ─── API: Delete a site ───
app.delete("/api/sites/:id", async (req, res) => {
  try {
    if (useInMemory) {
      inMemorySites = inMemorySites.filter((s) => s.id !== req.params.id);
      inMemoryPageViews = inMemoryPageViews.filter((pv) => pv.site_id !== req.params.id);
      return res.json({ success: true });
    }

    const { error } = await supabase.from("sites").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting site:", err);
    res.status(500).json({ error: "Failed to delete site" });
  }
});

// ─── API: Track a page view ───
app.post("/api/track", async (req, res) => {
  try {
    const { site_id, visitor_id, page_path, referrer, user_agent, screen_width, screen_height } = req.body;

    if (!site_id) {
      return res.status(400).json({ error: "site_id is required" });
    }

    const view = {
      site_id,
      visitor_id: visitor_id || uuidv4(),
      page_path: page_path || "/",
      referrer: referrer || "",
      user_agent: user_agent || "",
      screen_width: screen_width || 0,
      screen_height: screen_height || 0,
      created_at: new Date().toISOString(),
    };

    if (useInMemory) {
      inMemoryPageViews.push(view);
      return res.json({ success: true });
    }

    const { error } = await supabase.from("page_views").insert(view);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error tracking view:", err);
    res.status(500).json({ error: "Failed to track view" });
  }
});

// ─── API: Get analytics for a site ───
app.get("/api/sites/:id/analytics", async (req, res) => {
  try {
    const { period = "7d" } = req.query;
    const siteId = req.params.id;

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (period) {
      case "24h":
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    if (useInMemory) {
      const views = inMemoryPageViews.filter(
        (pv) => pv.site_id === siteId && new Date(pv.created_at) >= startDate
      );

      // Aggregate by day
      const dailyViews = {};
      views.forEach((v) => {
        const day = v.created_at.split("T")[0];
        if (!dailyViews[day]) dailyViews[day] = { views: 0, visitors: new Set() };
        dailyViews[day].views++;
        dailyViews[day].visitors.add(v.visitor_id);
      });

      const dailyStats = Object.entries(dailyViews)
        .map(([date, stats]) => ({
          date,
          page_views: stats.views,
          unique_visitors: stats.visitors.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalViews = views.length;
      const uniqueVisitors = new Set(views.map((v) => v.visitor_id)).size;

      // Top pages
      const pageCounts = {};
      views.forEach((v) => {
        const path = v.page_path || "/";
        pageCounts[path] = (pageCounts[path] || 0) + 1;
      });
      const topPages = Object.entries(pageCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, views]) => ({ path, views }));

      // Top referrers
      const refCounts = {};
      views.forEach((v) => {
        const ref = v.referrer || "Direct";
        refCounts[ref] = (refCounts[ref] || 0) + 1;
      });
      const topReferrers = Object.entries(refCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([referrer, views]) => ({ referrer, views }));

      return res.json({
        total_views: totalViews,
        unique_visitors: uniqueVisitors,
        daily_stats: dailyStats,
        top_pages: topPages,
        top_referrers: topReferrers,
      });
    }

    // Supabase queries
    const { data: views, error: viewsError } = await supabase
      .from("page_views")
      .select("visitor_id, page_path, referrer, created_at")
      .eq("site_id", siteId)
      .gte("created_at", startDate.toISOString());

    if (viewsError) throw viewsError;

    // Aggregate by day
    const dailyViews = {};
    (views || []).forEach((v) => {
      const day = v.created_at.split("T")[0];
      if (!dailyViews[day]) dailyViews[day] = { views: 0, visitors: new Set() };
      dailyViews[day].views++;
      dailyViews[day].visitors.add(v.visitor_id);
    });

    const dailyStats = Object.entries(dailyViews)
      .map(([date, stats]) => ({
        date,
        page_views: stats.views,
        unique_visitors: stats.visitors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalViews = views ? views.length : 0;
    const uniqueVisitors = views ? new Set(views.map((v) => v.visitor_id)).size : 0;

    // Top pages
    const pageCounts = {};
    (views || []).forEach((v) => {
      const p = v.page_path || "/";
      pageCounts[p] = (pageCounts[p] || 0) + 1;
    });
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));

    // Top referrers
    const refCounts = {};
    (views || []).forEach((v) => {
      const ref = v.referrer || "Direct";
      refCounts[ref] = (refCounts[ref] || 0) + 1;
    });
    const topReferrers = Object.entries(refCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referrer, views]) => ({ referrer, views }));

    res.json({
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      daily_stats: dailyStats,
      top_pages: topPages,
      top_referrers: topReferrers,
    });
  } catch (err) {
    console.error("Error fetching analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ─── Alert Configuration (in-memory) ───
let alertConfig = {
  email: {
    enabled: false,
    to: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    smtp_secure: false,
  },
  slack: {
    enabled: false,
    webhook_url: "",
    channel: "",
  },
  health_check: {
    enabled: false,
    interval_minutes: 5,
    timeout_seconds: 10,
  },
  view_threshold: {
    enabled: false,
    daily_limit: 1000,
    notify_on_exceed: true,
  },
};

// Track site health status
let siteHealth = {}; // { siteId: { lastChecked, status, statusCode, responseTime, downSince } }
let alertHistory = []; // { id, site_id, type, message, sent_at }

let emailTransporter = null;

function initEmailTransporter() {
  if (alertConfig.email.enabled && alertConfig.email.smtp_host) {
    emailTransporter = nodemailer.createTransport({
      host: alertConfig.email.smtp_host,
      port: alertConfig.email.smtp_port,
      secure: alertConfig.email.smtp_secure,
      auth: alertConfig.email.smtp_user
        ? { user: alertConfig.email.smtp_user, pass: alertConfig.email.smtp_pass }
        : undefined,
    });
    console.log("📧 Email transporter configured");
  }
}

// ─── Alert Sending ───
async function sendAlert(type, siteName, message) {
  const timestamp = new Date().toISOString();
  const alertEntry = {
    id: uuidv4(),
    type,
    site_name: siteName,
    message,
    sent_at: timestamp,
  };
  alertHistory.unshift(alertEntry);
  if (alertHistory.length > 100) alertHistory = alertHistory.slice(0, 100);

  console.log(`🔔 ALERT [${type}]: ${message}`);

  // Send Slack
  if (alertConfig.slack.enabled && alertConfig.slack.webhook_url) {
    try {
      const slackPayload = JSON.stringify({
        text: `*${type.toUpperCase()}* — ${siteName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *${type.toUpperCase()}* — *${siteName}*\n${message}`,
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Site Tracker · ${timestamp}` }],
          },
        ],
      });

      const url = new URL(alertConfig.slack.webhook_url);
      const transport = url.protocol === "https:" ? https : http;
      await new Promise((resolve, reject) => {
        const req = transport.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(slackPayload) },
          },
          (res) => {
            res.on("data", () => {});
            res.on("end", resolve);
          }
        );
        req.on("error", reject);
        req.write(slackPayload);
        req.end();
      });
      console.log("  ✅ Slack alert sent");
    } catch (err) {
      console.error("  ❌ Slack alert failed:", err.message);
    }
  }

  // Send Email
  if (alertConfig.email.enabled && emailTransporter && alertConfig.email.to) {
    try {
      await emailTransporter.sendMail({
        from: alertConfig.email.smtp_user || "site-tracker@localhost",
        to: alertConfig.email.to,
        subject: `[Site Tracker] ${type.toUpperCase()}: ${siteName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#0a0a0b;color:#f0f0f2;border-radius:8px;">
            <h2 style="color:#ef4444;">🚨 ${type.toUpperCase()}</h2>
            <p style="font-size:16px;"><strong>${siteName}</strong></p>
            <p style="color:#a0a0a8;">${message}</p>
            <hr style="border-color:#2a2a2e;">
            <p style="font-size:12px;color:#6b6b73;">Site Tracker · ${timestamp}</p>
          </div>
        `,
      });
      console.log("  ✅ Email alert sent");
    } catch (err) {
      console.error("  ❌ Email alert failed:", err.message);
    }
  }
}

// ─── Health Checker ───
async function checkSiteHealth(site) {
  const startTime = Date.now();
  try {
    const url = new URL(site.url);
    const transport = url.protocol === "https:" ? https : http;

    const statusCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), (alertConfig.health_check.timeout_seconds || 10) * 1000);
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: "HEAD",
          timeout: (alertConfig.health_check.timeout_seconds || 10) * 1000,
        },
        (res) => {
          clearTimeout(timeout);
          resolve(res.statusCode);
        }
      );
      req.on("error", (err) => { clearTimeout(timeout); reject(err); });
      req.on("timeout", () => { clearTimeout(timeout); reject(new Error("Timeout")); });
      req.end();
    });

    const responseTime = Date.now() - startTime;
    const prevHealth = siteHealth[site.id];
    const wasDown = prevHealth && (prevHealth.status === "down" || prevHealth.status === "unknown");

    siteHealth[site.id] = {
      lastChecked: new Date().toISOString(),
      status: statusCode >= 200 && statusCode < 400 ? "up" : "degraded",
      statusCode,
      responseTime,
      downSince: null,
    };

    // Alert if recovered from downtime
    if (wasDown && siteHealth[site.id].status === "up") {
      await sendAlert("recovery", site.name, `✅ ${site.name} is back online (HTTP ${statusCode}, ${responseTime}ms)`);
    }
  } catch (err) {
    const prevHealth = siteHealth[site.id];
    const wasUp = prevHealth && (prevHealth.status === "up" || prevHealth.status === "degraded" || !prevHealth.status);

    siteHealth[site.id] = {
      lastChecked: new Date().toISOString(),
      status: "down",
      statusCode: 0,
      responseTime: Date.now() - startTime,
      downSince: (wasUp && !prevHealth?.downSince) ? new Date().toISOString() : (prevHealth?.downSince || new Date().toISOString()),
    };

    // Alert if first detection of downtime
    if (wasUp) {
      await sendAlert("downtime", site.name, `❌ ${site.name} is DOWN — ${err.message} (${site.url})`);
    }
  }
}

// ─── View Threshold Checker ───
async function checkViewThresholds() {
  if (!alertConfig.view_threshold.enabled) return;
  const limit = alertConfig.view_threshold.daily_limit || 1000;

  for (const site of inMemorySites) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayViews = inMemoryPageViews.filter(
      (pv) => pv.site_id === site.id && new Date(pv.created_at) >= todayStart
    ).length;

    if (todayViews >= limit) {
      const alreadyAlerted = alertHistory.find(
        (a) => a.site_id === site.id && a.type === "threshold" && a.sent_at.split("T")[0] === today()
      );
      if (!alreadyAlerted) {
        const entry = { id: uuidv4(), site_id: site.id, type: "threshold", site_name: site.name, message: `📈 ${site.name} exceeded daily view limit: ${todayViews} views (limit: ${limit})`, sent_at: new Date().toISOString() };
        alertHistory.unshift(entry);
        await sendAlert("threshold", site.name, entry.message);
      }
    }
  }
}

// ─── Monitoring Loop ───
let monitoringInterval = null;

function startMonitoring() {
  if (monitoringInterval) clearInterval(monitoringInterval);
  if (!alertConfig.health_check.enabled && !alertConfig.view_threshold.enabled) return;

  const intervalMs = (alertConfig.health_check.interval_minutes || 5) * 60 * 1000;
  monitoringInterval = setInterval(async () => {
    console.log("\n🔍 Running monitoring checks...");
    if (alertConfig.health_check.enabled) {
      for (const site of inMemorySites.filter((s) => s.status === "active")) {
        await checkSiteHealth(site);
      }
    }
    if (alertConfig.view_threshold.enabled) {
      await checkViewThresholds();
    }
  }, intervalMs);

  console.log(`⏰ Monitoring started (interval: ${alertConfig.health_check.interval_minutes || 5}min)`);
}

function stopMonitoring() {
  if (monitoringInterval) clearInterval(monitoringInterval);
  monitoringInterval = null;
}

// ─── API: Get alert config ───
app.get("/api/alerts/config", (req, res) => {
  const safeConfig = { ...alertConfig };
  if (safeConfig.email.smtp_pass) safeConfig.email.smtp_pass = "••••••";
  res.json(safeConfig);
});

// ─── API: Update alert config ───
app.put("/api/alerts/config", (req, res) => {
  const incoming = req.body;
  if (incoming.email) {
    if (incoming.email.smtp_pass && incoming.email.smtp_pass !== "••••••") {
      alertConfig.email.smtp_pass = incoming.email.smtp_pass;
    }
    Object.assign(alertConfig.email, incoming.email);
  }
  if (incoming.slack) Object.assign(alertConfig.slack, incoming.slack);
  if (incoming.health_check) Object.assign(alertConfig.health_check, incoming.health_check);
  if (incoming.view_threshold) Object.assign(alertConfig.view_threshold, incoming.view_threshold);

  initEmailTransporter();
  startMonitoring();

  const safeConfig = { ...alertConfig };
  if (safeConfig.email.smtp_pass) safeConfig.email.smtp_pass = "••••••";
  res.json(safeConfig);
});

// ─── API: Get site health statuses ───
app.get("/api/alerts/health", (req, res) => {
  res.json(siteHealth);
});

// ─── API: Get alert history ───
app.get("/api/alerts/history", (req, res) => {
  const { limit = 50 } = req.query;
  res.json(alertHistory.slice(0, parseInt(limit)));
});

// ─── API: Manually trigger health check ───
app.post("/api/alerts/check/:siteId", async (req, res) => {
  const site = inMemorySites.find((s) => s.id === req.params.siteId);
  if (!site) return res.status(404).json({ error: "Site not found" });
  await checkSiteHealth(site);
  res.json(siteHealth[site.id] || { status: "unknown" });
});

// ─── API: Send test alert ───
app.post("/api/alerts/test", async (req, res) => {
  try {
    await sendAlert("test", "Test Site", "🔔 This is a test alert from Site Tracker. If you see this, alerts are working!");
    res.json({ success: true, message: "Test alert sent" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send test alert" });
  }
});

// ─── API: Get tracking script ───
app.get("/api/tracking-script/:siteId", (req, res) => {
  const siteId = req.params.siteId;
  const serverUrl = req.protocol + "://" + req.get("host");

  const script = `<!-- Site Tracker - Paste this before </body> on your site -->
<script>
(function() {
  var SITE_ID = '${siteId}';
  var SERVER_URL = '${serverUrl}';
  var visitorId = localStorage.getItem('tracker_vid');
  if (!visitorId) {
    visitorId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('tracker_vid', visitorId);
  }
  var data = {
    site_id: SITE_ID,
    visitor_id: visitorId,
    page_path: window.location.pathname,
    referrer: document.referrer || '',
    screen_width: screen.width,
    screen_height: screen.height
  };
  fetch(SERVER_URL + '/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(function() {});
})();
</script>`;

  res.type("text/javascript").send(script);
});

// ─── SPA fallback ───
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start server ───
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Site Tracker running at http://0.0.0.0:${PORT}`);
});
