const state = {
  page: "overview",
  theme: localStorage.getItem("nexora-theme") === "light" ? "light" : "dark",
  leads: [],
  conversations: [],
  appointments: [],
  documents: [],
  analytics: {},
  analyticsPeriod: "30",
  calendarDate: new Date(),
  profile: null,
  profileStats: {},
  profilePhotoDraft: null,
  chatbot: { open: false, busy: false, messages: [] },
  voice: { active: false, muted: false, seconds: 0, messages: [], recognition: null, timer: null, customer: "New caller", error: "" },
};

const pageNames = {
  overview: "Overview", voice: "Live voice agent", conversations: "Conversations",
  leads: "Leads & customers", appointments: "Appointments", knowledge: "Knowledge base",
  analytics: "Analytics", settings: "Settings", profile: "My profile",
};
const $ = (selector, root = document) => root.querySelector(selector);
const appContent = $("#app-content");
const modalRoot = $("#modal-root");
const toastRoot = $("#toast-root");
let voiceRibbonFrame = 0;
let voiceRibbonObserver = null;
let voiceRibbonResizeHandler = null;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}
function setProfilePhotoPreview(data) {
  const contents=data
    ? `<img src="${esc(data)}" alt="Profile photo preview">`
    : `<span>${esc(initials($("#profile-name")?.value||state.profile?.name||"JD"))}</span>`;
  ["profile-avatar-preview","profile-photo-large"].forEach(id=>{
    const target=$(`#${id}`);
    if(target) target.innerHTML=contents;
  });
}
function previewProfilePhoto(file) {
  const supported=["image/png","image/jpeg","image/webp"];
  if(!supported.includes(file.type)) { toast("Choose a PNG, JPEG, or WebP image.",true); return; }
  if(file.size>1_000_000) { toast("Profile photos must be under 1 MB.",true); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    state.profilePhotoDraft=String(reader.result);
    setProfilePhotoPreview(state.profilePhotoDraft);
  };
  reader.onerror=()=>toast("Could not read that image file.",true);
  reader.readAsDataURL(file);
}
async function saveProfile() {
  const form=$("#profile-form");
  if(!form || !form.reportValidity()) return;
  const values=Object.fromEntries(new FormData(form));
  values.interests=new FormData(form).getAll("interests");
  values.photo_data=state.profilePhotoDraft===null?state.profile.photo_data:state.profilePhotoDraft;
  try {
    const result=await api("/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
    state.profile=result.profile;
    state.profileStats=result.stats;
    state.profilePhotoDraft=null;
    updateProfileChrome(state.profile);
    $("#profile-card-name").textContent=state.profile.name;
    $("#profile-card-title").textContent=state.profile.title||"Workspace member";
    setProfilePhotoPreview(state.profile.photo_data);
    toast("Profile saved");
  } catch(error) { toast(error.message,true); }
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function initials(name = "?") { return name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase(); }
function niceDate(value, options = { month: "short", day: "numeric" }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, options);
}
function niceTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function notificationTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function duration(seconds = 0) { return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`; }
function closeNotificationPanel() {
  const panel = $("#notification-panel");
  if (!panel) return;
  panel.hidden = true;
  $("#notification-button").setAttribute("aria-expanded", "false");
}
function notificationRows(items) {
  if (!items.length) return `<div class="notification-empty"><i class="fa-regular fa-circle-check"></i><b>You’re all caught up</b><span>No recent activity needs your attention.</span></div>`;
  return items.map(item => `<button class="notification-item" type="button" data-page="${item.page}">
    <span class="notification-item-icon ${item.tone}"><i class="fa-solid ${item.icon}"></i></span>
    <span class="notification-item-copy"><b>${esc(item.title)}</b><span>${esc(item.detail)}</span><small>${esc(item.time)}</small></span>
    <i class="fa-solid fa-chevron-right notification-item-arrow" aria-hidden="true"></i>
  </button>`).join("");
}
async function refreshNotifications() {
  const list = $("#notification-list");
  const refresh = $("#notification-refresh");
  list.setAttribute("aria-busy", "true");
  refresh.classList.add("busy");
  list.innerHTML = `<div class="notification-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading workspace activity…</div>`;
  try {
    const [appointments, leads, conversations] = await Promise.all([
      api("/appointments"), api("/leads"), api("/conversations"),
    ]);
    const now = Date.now();
    const followUps = leads
      .filter(lead => /follow-up/i.test(lead.follow_up || ""))
      .slice(0, 2)
      .map(lead => ({
        page: "leads", tone: "orange", icon: "fa-user-clock", title: "Lead follow-up",
        detail: `${lead.name}${lead.company ? ` · ${lead.company}` : ""} — ${lead.follow_up}`,
        time: notificationTime(lead.created_at),
      }));
    const upcoming = appointments
      .filter(item => item.status !== "Cancelled" && new Date(item.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 2)
      .map(item => ({
        page: "appointments", tone: "green", icon: "fa-calendar-check", title: "Upcoming appointment",
        detail: `${item.customer} · ${item.purpose}`,
        time: notificationTime(item.starts_at),
      }));
    const recentCalls = conversations.slice(0, 2).map(item => ({
      page: "conversations", tone: "purple", icon: "fa-headset", title: "Conversation recorded",
      detail: `${item.customer} · ${item.summary || "Open the conversation summary"}`,
      time: notificationTime(item.created_at),
    }));
    const items = [...followUps, ...upcoming, ...recentCalls].slice(0, 5);
    list.innerHTML = notificationRows(items);
  } catch (error) {
    list.innerHTML = `<div class="notification-error"><i class="fa-solid fa-triangle-exclamation"></i><b>Couldn’t load activity</b><span>${esc(error.message)}</span><button class="button button-small" id="notification-retry" type="button">Try again</button></div>`;
    $("#notification-retry").addEventListener("click", refreshNotifications);
  } finally {
    list.setAttribute("aria-busy", "false");
    refresh.classList.remove("busy");
  }
}
function pill(value = "Neutral") {
  const key = value.toLowerCase();
  const type = ["positive", "hot", "scheduled", "completed"].includes(key) ? "positive" :
    ["negative", "cool", "cancelled"].includes(key) ? "negative" :
      ["neutral", "warm", "pending", "needs follow-up"].includes(key) ? "neutral" :
        key === "processing" || key === "indexed" ? "processing" : "neutral";
  return `<span class="pill pill-${type}">${esc(value)}</span>`;
}
function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`;
  node.innerHTML = `<i class="fa-solid ${error ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span>${esc(message)}</span>`;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 3500);
}
function heading(kicker, title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function setLoading() { appContent.innerHTML = `<div class="loading">Loading your workspace</div>`; }
function icon(className, tone = "") { return `<span class="metric-icon ${tone}"><i class="${className}"></i></span>`; }
function updateProfileChrome(profile) {
  if (!profile) return;
  document.querySelectorAll(".profile-name").forEach(element => { element.textContent = profile.name; });
  document.querySelectorAll(".profile-avatar,.top-avatar").forEach(element => {
    if (profile.photo_data) {
      element.innerHTML = `<img src="${esc(profile.photo_data)}" alt="">`;
      element.classList.add("has-photo");
    } else {
      element.textContent = initials(profile.name);
      element.classList.remove("has-photo");
    }
    element.setAttribute("aria-label", `Open ${profile.name}'s profile`);
  });
}
function setTheme(theme, persist = true) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  const light = theme === "light";
  const toggle = $("#theme-toggle");
  if (toggle) {
    const nextTheme = light ? "dark" : "light";
    toggle.innerHTML = `<i class="fa-solid ${light ? "fa-moon" : "fa-sun"}" aria-hidden="true"></i>`;
    toggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    toggle.title = `Switch to ${nextTheme} theme`;
    toggle.setAttribute("aria-pressed", String(light));
  }
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = light ? "#f4f6f8" : "#080b16";
  if (persist) {
    try { localStorage.setItem("nexora-theme", theme); }
    catch { toast("Appearance changed, but this browser could not save your preference.", true); }
  }
}

async function navigate(page) {
  if (!pageNames[page]) return;
  closeNotificationPanel();
  if (page !== "voice") stopVoiceRibbon();
  state.page = page;
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === page));
  $("#page-crumb").textContent = pageNames[page];
  $("#sidebar").classList.remove("open");
  setLoading();
  try {
    if (page === "overview") await renderOverview();
    else if (page === "voice") renderVoice();
    else if (page === "leads") await renderLeads();
    else if (page === "conversations") await renderConversations();
    else if (page === "appointments") await renderAppointments();
    else if (page === "knowledge") await renderKnowledge();
    else if (page === "analytics") await renderAnalytics();
    else if (page === "settings") await renderSettings();
    else if (page === "profile") await renderProfile();
  } catch (error) {
    appContent.innerHTML = `<div class="surface empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn’t load this page</h3><p>${esc(error.message)} Check that the Nexora API is running, then try again.</p><button class="button" data-action="retry-page">Try again</button></div>`;
  }
}

function weeklyChart() {
  const pointsA = "40,112 102,99 164,106 226,67 288,82 350,38 412,51 474,25";
  const pointsB = "40,128 102,121 164,113 226,119 288,91 350,96 412,77 474,84";
  return `<svg class="chart-svg" viewBox="0 0 510 165" preserveAspectRatio="none" role="img" aria-label="Weekly call activity line chart">
    <defs><linearGradient id="chart-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f27b3d"/><stop offset="1" stop-color="#f27b3d" stop-opacity="0"/></linearGradient></defs>
    ${[25,60,95,130].map(y => `<line class="chart-gridline" x1="34" y1="${y}" x2="492" y2="${y}"/>`).join("")}
    <polygon class="chart-fill" points="40,112 ${pointsA} 474,145 40,145"/>
    <polyline class="chart-line" points="${pointsA}"/>
    <polyline class="chart-line-secondary" points="${pointsB}"/>
    ${[["M",40],["T",102],["W",164],["T",226],["F",288],["S",350],["S",412],["Today",474]].map(([label, x]) => `<text x="${x}" y="161" text-anchor="middle">${label}</text>`).join("")}
    <circle cx="350" cy="38" r="3.5" fill="#7e22ce" stroke="#151b2d" stroke-width="2"/>
  </svg>`;
}

function metricCard(label, value, iconClass, change, tone, trend = "up") {
  const color = tone === "cyan" || tone === "green" ? "#22c55e" : tone === "blue" ? "#ef4444" : "#f27b3d";
  return `<article class="surface metric-card"><div class="metric-top"><span class="metric-label">${label}</span>${icon(iconClass, tone)}</div><div class="metric-value">${value}</div><div class="metric-foot"><span class="${trend === "up" ? "change-up" : "change-down"}"><i class="fa-solid fa-arrow-${trend}"></i> ${change}</span><span>vs last week</span></div><svg class="metric-spark" viewBox="0 0 52 23" aria-hidden="true"><polyline points="0,18 9,14 16,16 25,8 32,12 42,4 52,2" fill="none" stroke="${color}" stroke-width="1.7"/></svg></article>`;
}

async function renderOverview() {
  const [analytics, leads, conversations, appointments, profileData] = await Promise.all([
    api("/analytics"), api("/leads"), api("/conversations"), api("/appointments"), api("/profile"),
  ]);
  state.profile = profileData.profile;
  state.profileStats = profileData.stats;
  updateProfileChrome(state.profile);
  state.analytics = analytics;
  state.leads = leads;
  state.conversations = conversations;
  state.appointments = appointments;
  $("#conversation-count").textContent = conversations.length;
  const recent = conversations.slice(0, 4);
  const upcoming = appointments.filter(item => item.status !== "Cancelled").slice(0, 3);
  const total = analytics.total_calls || 0;
  const sentiment = analytics.sentiment || {};
  const totalSentiments = Math.max(1, Object.values(sentiment).reduce((sum, value) => sum + value, 0));
  const positivePct = Math.round((sentiment.Positive || 0) / totalSentiments * 100);
  const neutralPct = Math.round((sentiment.Neutral || 0) / totalSentiments * 100);
  const negativePct = 100 - positivePct - neutralPct;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  appContent.innerHTML = `
    ${heading(now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase(), `${greeting}, ${esc(state.profile.name)} <span class="heading-spark">✦</span>`, "Here’s what’s happening with your sales conversations today.", `<span class="data-mode">DEMO DATA</span><button class="button button-primary" data-action="start-agent"><i class="fa-solid fa-wave-square"></i> Start AI agent</button>`)}
    <div class="metric-grid">
      ${metricCard("Total calls", total.toLocaleString(), "fa-solid fa-phone", "+12.8%", "", "up")}
      ${metricCard("Successful conversations", analytics.successful || 0, "fa-regular fa-circle-check", "+8.2%", "green", "up")}
      ${metricCard("Qualified leads", analytics.qualified_leads || 0, "fa-solid fa-user-check", "+16.4%", "cyan", "up")}
      ${metricCard("Appointments booked", analytics.appointments || 0, "fa-regular fa-calendar-check", "+6.1%", "blue", "up")}
      ${metricCard("Conversion rate", `${analytics.conversion_rate || 0}%`, "fa-solid fa-arrow-trend-up", "+2.4%", "", "up")}
      ${metricCard("Avg. call duration", duration(analytics.average_duration || 0), "fa-regular fa-clock", "−1.2%", "cyan", "down")}
    </div>
    <div class="dashboard-grid">
      <section class="surface chart-panel"><div class="chart-header"><div><div class="section-heading"><h2>Call activity</h2></div><div class="chart-summary"><strong>${total}</strong><span>↑ 12.8%</span></div><div class="chart-legend"><span><i class="legend-dot"></i> Calls</span><span><i class="legend-dot cyan-dot"></i> Qualified</span></div></div><span class="table-muted" style="font-size:9px">${new Date(Date.now()-6*86400000).toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${now.toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span></div>${weeklyChart()}</section>
      <section class="surface funnel-panel"><div class="section-heading"><div><h2>Lead conversion</h2><p>From first touch to customer</p></div></div><div class="funnel-total">${leads.length} <span style="font:400 10px var(--font);color:#8290a5">leads this month</span></div>
        ${[["Calls made",total || 126,100],["Engaged",Math.max(1,Math.round((total || 126)*.72)),72],["Qualified",analytics.qualified_leads || 36,52],["Appointments",analytics.appointments || 18,34]].map(([label,count,width])=>`<div class="funnel-row"><span>${label}</span><div class="funnel-track"><div class="funnel-fill" style="width:${width}%"></div></div><b class="funnel-number">${count}</b></div>`).join("")}</section>
    </div>
    <div class="dashboard-grid">
      <section class="surface table-panel"><div class="table-panel-head"><div class="section-heading" style="margin:0"><div><h2>Recent conversations</h2><p>Your latest AI-assisted calls</p></div></div><a class="text-link" href="#" data-page="conversations">View all <i class="fa-solid fa-arrow-right"></i></a></div>
        <div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>DURATION</th><th>SENTIMENT</th><th>WHEN</th></tr></thead><tbody>${recent.map(call=>`<tr data-action="conversation-open" data-id="${call.id}"><td><div class="customer-cell"><div class="avatar" style="background:#302448;color:#e9d5ff">${initials(call.customer)}</div><div class="customer-name">${esc(call.customer)}</div></div></td><td>${duration(call.duration)}</td><td>${pill(call.sentiment)}</td><td class="table-muted">${niceDate(call.created_at)}</td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="surface sentiment-panel"><div class="section-heading"><div><h2>Customer sentiment</h2><p>Across your conversations</p></div></div>
        <div class="sentiment-layout"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(#22c55e 0 ${positivePct}%,#7788a6 ${positivePct}% ${positivePct+neutralPct}%,#ef4444 ${positivePct+neutralPct}% 100%)"></div><div class="donut-center"><strong>${total}</strong><span>calls</span></div></div><div class="sentiment-list"><div class="sentiment-key"><span><i class="sentiment-dot"></i>Positive</span><b>${positivePct}%</b></div><div class="sentiment-key"><span><i class="sentiment-dot neutral"></i>Neutral</span><b>${neutralPct}%</b></div><div class="sentiment-key"><span><i class="sentiment-dot negative"></i>Needs attention</span><b>${negativePct}%</b></div></div></div>
      </section>
    </div>
    <div class="lower-grid">
      <section class="surface appointments-panel" style="padding:16px 18px"><div class="section-heading"><div><h2>Upcoming appointments</h2><p>Your next customer touchpoints</p></div><a class="text-link" href="#" data-page="appointments">Calendar <i class="fa-solid fa-arrow-right"></i></a></div>
        ${upcoming.length ? upcoming.map(item=>{const d=new Date(item.starts_at);return `<div class="appointment-item"><div class="date-chip"><small>${d.toLocaleDateString(undefined,{month:"short"})}</small><b>${d.getDate()}</b></div><div class="appointment-copy"><b>${esc(item.customer)} · ${esc(item.purpose)}</b><small>${niceTime(item.starts_at)} · ${esc(item.company)}</small></div><a class="text-link" href="#" data-page="appointments">Open</a></div>`}).join("") : `<div class="empty-state">No upcoming appointments</div>`}
      </section>
      <section class="surface activity-panel"><div class="section-heading"><div><h2>Agent activity</h2><p>What Nexora has been up to</p></div><span class="pill pill-positive">Live</span></div>
        <div class="activity-item"><span class="activity-icon cyan"><i class="fa-solid fa-phone"></i></span><div class="activity-copy"><b>Nexora qualified a new lead</b><br>Olivia Rhye · High intent detected<small>Enterprise plan · Acme Inc.</small></div><span class="activity-time">8m</span></div>
        <div class="activity-item"><span class="activity-icon"><i class="fa-regular fa-calendar-check"></i></span><div class="activity-copy"><b>Appointment booked</b><br>Phoenix Baker · Product walkthrough<small>Tomorrow at 12:30 PM</small></div><span class="activity-time">32m</span></div>
        <div class="activity-item"><span class="activity-icon" style="color:#67d99a;background:#22c55e14"><i class="fa-solid fa-arrow-trend-up"></i></span><div class="activity-copy"><b>Weekly goal is looking good</b><br>You're at 84% of your call target<small>42 of 50 conversations</small></div><span class="activity-time">1h</span></div>
      </section>
    </div>`;
}

async function renderLeads(search = "", filter = "") {
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (filter) query.set("interest", filter);
  state.leads = await api(`/leads${query.size ? `?${query}` : ""}`);
  appContent.innerHTML = `${heading("CUSTOMER RELATIONSHIP", "Leads & customers", "Keep every opportunity moving with clear context and timely follow-ups.", `<button class="button" data-action="export-leads"><i class="fa-solid fa-arrow-down"></i> Export</button><button class="button button-primary" data-action="add-lead"><i class="fa-solid fa-plus"></i> Add lead</button>`)}
    <div class="toolbar"><div class="filters-row"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input id="lead-search" placeholder="Search leads..." value="${esc(search)}"></label><select class="select-control" id="lead-filter"><option value="">All interest levels</option>${["Hot","Warm","Cool"].map(v=>`<option ${filter===v?"selected":""}>${v}</option>`).join("")}</select><select class="select-control" id="lead-sort"><option value="recent">Recently added</option><option value="score">Highest score</option><option value="name">Name A–Z</option></select></div><span class="table-muted">${state.leads.length} records</span></div>
    <section class="surface table-panel"><div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>SOURCE</th><th>INTEREST</th><th>SENTIMENT</th><th>LEAD SCORE</th><th>FOLLOW-UP</th><th></th></tr></thead><tbody id="lead-rows">${leadRows(state.leads)}</tbody></table></div></section>`;
}
function leadRows(leads) {
  if (!leads.length) return `<tr><td class="table-empty" colspan="8">No leads found. Try adjusting your search or add your first lead.</td></tr>`;
  return leads.map(lead=>`<tr><td><div class="customer-cell"><div class="avatar" style="background:#302448;color:#e9d5ff">${initials(lead.name)}</div><div><button class="customer-name customer-detail-link" data-action="lead-details" data-id="${lead.id}">${esc(lead.name)}</button><div class="customer-meta">${esc(lead.email)}</div></div></div></td><td><span class="table-strong">${esc(lead.company)}</span></td><td class="table-muted">${esc(lead.source)}</td><td>${pill(lead.interest)}</td><td>${pill(lead.sentiment)}</td><td><span class="table-strong">${lead.score}</span><span class="table-muted"> / 100</span></td><td>${pill(lead.follow_up)}</td><td><button class="icon-button" data-action="edit-lead" data-id="${lead.id}" title="Edit lead"><i class="fa-regular fa-pen-to-square"></i></button><button class="icon-button" data-action="delete-lead" data-id="${lead.id}" title="Delete lead"><i class="fa-regular fa-trash-can"></i></button></td></tr>`).join("");
}
function showLeadDetails(lead) {
  modal(`<div class="modal-head"><div><h2>${esc(lead.name)}</h2><p class="page-subtitle">${esc(lead.company||"No company")}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="detail-line"><span>Email</span><strong>${esc(lead.email||"—")}</strong></div><div class="detail-line"><span>Phone</span><strong>${esc(lead.phone||"—")}</strong></div><div class="detail-line"><span>Lead source</span><strong>${esc(lead.source)}</strong></div><div class="detail-line"><span>Interest</span><strong>${esc(lead.interest)}</strong></div><div class="detail-line"><span>Sentiment</span><strong>${esc(lead.sentiment)}</strong></div><div class="detail-line"><span>Lead score</span><strong>${lead.score} / 100</strong></div><div class="detail-line"><span>Follow-up</span><strong>${esc(lead.follow_up)}</strong></div></div><div class="modal-foot"><button class="button" data-action="close-modal">Close</button><button class="button button-primary" data-action="edit-lead" data-id="${lead.id}"><i class="fa-regular fa-pen-to-square"></i> Edit lead</button></div>`);
}
function leadForm(lead = {}) {
  return `<form class="modal-form" id="lead-form">
    <div class="form-field"><label for="lead-name">Full name *</label><input class="input-control" id="lead-name" name="name" required value="${esc(lead.name||"")}"></div>
    <div class="form-field"><label for="lead-company">Company</label><input class="input-control" id="lead-company" name="company" value="${esc(lead.company||"")}"></div>
    <div class="form-field"><label for="lead-email">Email</label><input class="input-control" id="lead-email" name="email" type="email" value="${esc(lead.email||"")}"></div>
    <div class="form-field"><label for="lead-phone">Phone</label><input class="input-control" id="lead-phone" name="phone" value="${esc(lead.phone||"")}"></div>
    <div class="form-field"><label for="lead-source">Lead source</label><select class="select-control" id="lead-source" name="source">${["Website","Referral","LinkedIn","Campaign","Outbound"].map(v=>`<option ${lead.source===v?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="form-field"><label for="lead-interest">Interest</label><select class="select-control" id="lead-interest" name="interest">${["Hot","Warm","Cool"].map(v=>`<option ${lead.interest===v?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="form-field"><label for="lead-sentiment">Sentiment</label><select class="select-control" id="lead-sentiment" name="sentiment">${["Positive","Neutral","Negative"].map(v=>`<option ${lead.sentiment===v?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="form-field"><label for="lead-score">Lead score (0–100)</label><input class="input-control" id="lead-score" name="score" type="number" min="0" max="100" value="${lead.score ?? 50}"></div>
    <div class="form-field form-span"><label for="lead-follow">Follow-up status</label><select class="select-control" id="lead-follow" name="follow_up">${["Needs follow-up","Follow-up today","Contacted","Meeting booked","Qualified"].map(v=>`<option ${lead.follow_up===v?"selected":""}>${v}</option>`).join("")}</select></div>
  </form>`;
}

async function renderConversations() {
  state.conversations = await api("/conversations");
  $("#conversation-count").textContent = state.conversations.length;
  appContent.innerHTML = `${heading("SALES ACTIVITY", "Conversations", "Review every call, understand customer intent, and keep the next step clear.", `<button class="button button-primary" data-action="start-agent"><i class="fa-solid fa-wave-square"></i> New conversation</button>`)}
    <div class="toolbar"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input id="conversation-search" placeholder="Search customer or summary..."></label><div class="filters-row"><select class="select-control" id="conversation-filter"><option value="">All sentiments</option><option>Positive</option><option>Neutral</option><option>Negative</option></select><span class="table-muted">${state.conversations.length} conversations</span></div></div>
    <section class="surface table-panel"><div class="table-scroll conversation-table-scroll"><table><thead><tr><th>CUSTOMER</th><th>DATE</th><th>DURATION</th><th>STATUS</th><th>SENTIMENT</th><th>AI SUMMARY</th><th>NEXT ACTION</th><th></th></tr></thead><tbody id="conversation-rows">${conversationRows(state.conversations)}</tbody></table></div></section>`;
}
function conversationRows(calls) {
  if (!calls.length) return `<tr><td colspan="8" class="table-empty">No conversations yet. Start a voice session to create your first record.</td></tr>`;
  return calls.map(call=>`<tr><td><div class="customer-cell"><div class="avatar" style="background:#302448;color:#e9d5ff">${initials(call.customer)}</div><span class="customer-name">${esc(call.customer)}</span></div></td><td class="table-muted">${niceDate(call.created_at)}</td><td>${duration(call.duration)}</td><td>${pill(call.status)}</td><td>${pill(call.sentiment)}</td><td style="max-width:230px;overflow:hidden;text-overflow:ellipsis">${esc(call.summary||"—")}</td><td>${esc(call.next_action||"—")}</td><td><div class="conversation-actions"><button class="button button-small" data-action="conversation-open" data-id="${call.id}">View transcript</button><button class="icon-button conversation-delete" data-action="delete-conversation" data-id="${call.id}" aria-label="Delete conversation" title="Delete conversation"><i class="fa-regular fa-trash-can"></i></button></div></td></tr>`).join("");
}
function updateConversationRows() {
  const query=$("#conversation-search")?.value.toLowerCase()||"";
  const sentiment=$("#conversation-filter")?.value||"";
  const filtered=state.conversations.filter(call=>
    `${call.customer} ${call.summary} ${call.requirements}`.toLowerCase().includes(query)
    && (!sentiment||call.sentiment===sentiment)
  );
  $("#conversation-rows").innerHTML=conversationRows(filtered);
}
function showConversation(call) {
  let transcript = [];
  try { transcript = JSON.parse(call.transcript || "[]"); } catch { transcript = []; }
  modal(`<div class="conversation-header"><div><h2>${esc(call.customer)}</h2><span>${niceDate(call.created_at,{month:"long",day:"numeric",year:"numeric"})} · ${duration(call.duration)}</span></div><div style="display:flex;align-items:center;gap:12px">${pill(call.sentiment)}<button class="modal-close" data-action="close-modal" aria-label="Close transcript"><i class="fa-solid fa-xmark"></i></button></div></div>
    <div class="modal-body"><div class="detail-grid"><div><h3>Transcript</h3><div class="transcript-modal-list">${transcript.length ? transcript.map(m=>`<div class="message ${m.role==="customer"?"customer":""}"><span class="message-label">${m.role==="customer"?"Customer":"Nexora AI"}</span>${esc(m.text)}</div>`).join("") : `<div class="transcript-empty">No transcript was recorded for this conversation.</div>`}</div></div><div><h3>Call summary</h3><p class="response-content">${esc(call.summary||"No summary available.")}</p><div class="detail-line"><span>Requirements</span><strong>${esc(call.requirements||"—")}</strong></div><div class="detail-line"><span>Next action</span><strong>${esc(call.next_action||"—")}</strong></div></div></div></div>`, true);
}

async function renderAppointments() {
  state.appointments = await api("/appointments");
  const date = new Date(state.calendarDate);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const prevDays = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
  const cells = [];
  for (let i=0;i<42;i++) {
    let number = i - offset + 1, muted = false, month = date.getMonth();
    if (number < 1) { number = prevDays + number; muted = true; month--; }
    else if (number > days) { number -= days; muted = true; month++; }
    const target = new Date(date.getFullYear(), month, number);
    const hasEvent = state.appointments.some(item => {
      const event = new Date(item.starts_at);
      return event.getFullYear()===target.getFullYear() && event.getMonth()===target.getMonth() && event.getDate()===target.getDate() && item.status!=="Cancelled";
    });
    const today = target.toDateString() === new Date().toDateString();
    cells.push(`<div class="calendar-day${muted?" muted":""}${today?" today":""}">${number}${hasEvent?'<span class="day-dot"></span>':""}</div>`);
  }
  const visible = state.appointments.filter(item => item.status !== "Cancelled").sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  appContent.innerHTML = `${heading("CUSTOMER TOUCHPOINTS", "Appointments", "Plan meaningful follow-ups and keep your sales calendar moving.", `<button class="button button-primary" data-action="add-appointment"><i class="fa-solid fa-plus"></i> Schedule meeting</button>`)}
    <div class="calendar-layout"><section class="surface calendar-panel"><div class="calendar-top"><div><b>${date.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</b><span style="display:block;margin-top:4px;color:#7f8da2;font-size:9px">Your scheduled customer meetings</span></div><div><button class="icon-button" aria-label="Previous month" data-action="month-prev"><i class="fa-solid fa-chevron-left"></i></button><button class="icon-button" aria-label="Next month" data-action="month-next"><i class="fa-solid fa-chevron-right"></i></button></div></div><div class="calendar-grid">${["MON","TUE","WED","THU","FRI","SAT","SUN"].map(day=>`<div class="calendar-weekday">${day}</div>`).join("")}${cells.join("")}</div></section>
    <section class="surface"><div class="conversation-header"><div><h2>Upcoming</h2><span>${visible.length} scheduled meetings</span></div></div><div class="appointment-list">${visible.length?visible.map(item=>`<div class="appointment-list-item"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(item.customer)}</strong><div><button class="icon-button" data-action="edit-appointment" data-id="${item.id}" title="Edit meeting"><i class="fa-regular fa-pen-to-square"></i></button><button class="icon-button" data-action="cancel-appointment" data-id="${item.id}" title="Cancel meeting"><i class="fa-regular fa-trash-can"></i></button></div></div><small>${niceDate(item.starts_at,{month:"short",day:"numeric",year:"numeric"})} · ${niceTime(item.starts_at)}</small><small>${esc(item.purpose)} · ${esc(item.company)}</small></div>`).join(""):`<div class="empty-state"><i class="fa-regular fa-calendar"></i><h3>Nothing scheduled yet</h3><p>Book your next conversation with a customer.</p></div>`}</div></section></div>`;
}
function appointmentForm(appointment = null) {
  const local = new Date(Date.now()+3600000);
  local.setMinutes(Math.ceil(local.getMinutes()/15)*15,0,0);
  const dateValue = new Date(local.getTime()-local.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const value = appointment ? new Date(new Date(appointment.starts_at).getTime()-new Date(appointment.starts_at).getTimezoneOffset()*60000).toISOString().slice(0,16) : dateValue;
  return `<form class="modal-form" id="appointment-form"><div class="form-field"><label>Customer name *</label><input class="input-control" name="customer" value="${esc(appointment?.customer||"")}" required></div><div class="form-field"><label>Company</label><input class="input-control" name="company" value="${esc(appointment?.company||"")}"></div><div class="form-field form-span"><label>Meeting purpose</label><input class="input-control" name="purpose" value="${esc(appointment?.purpose||"Discovery call")}"></div><div class="form-field form-span"><label>Date and time *</label><input id="appointment-start" name="starts_at" type="hidden" value="${value}">${appointmentDatePickerMarkup(value)}</div></form>`;
}
function appointmentDatePickerMarkup(value, viewDate = new Date(value)) {
  const [selectedDate, selectedTime = "09:00"] = value.split("T");
  const selected = new Date(`${selectedDate}T00:00:00`);
  const month = new Date(viewDate.getFullYear(),viewDate.getMonth(),1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthTitle = month.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const offset = (month.getDay()+6)%7;
  const days = new Date(year,monthIndex+1,0).getDate();
  const cellCount = Math.ceil((offset+days)/7)*7;
  const today = new Date().toDateString();
  const cells = [];
  for(let i=0;i<cellCount;i++) {
    const number = i-offset+1;
    if(number<1||number>days) { cells.push(`<span class="appointment-picker-blank"></span>`); continue; }
    const date = new Date(year,monthIndex,number);
    const key = `${year}-${String(monthIndex+1).padStart(2,"0")}-${String(number).padStart(2,"0")}`;
    const isSelected = key===selectedDate;
    const isToday = date.toDateString()===today;
    cells.push(`<button type="button" class="appointment-picker-day${isSelected?" selected":""}${isToday?" today":""}" data-action="appointment-date-select" data-date="${key}" aria-label="${date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}" aria-pressed="${isSelected}">${number}</button>`);
  }
  const times = Array.from({length:96},(_,index)=>`${String(Math.floor(index*15/60)).padStart(2,"0")}:${String(index*15%60).padStart(2,"0")}`);
  if(!times.includes(selectedTime)) times.push(selectedTime);
  times.sort();
  const timeOptions = times.map(time=>{
    const [hour,minute] = time.split(":").map(Number);
    const label = new Date(2000,0,1,hour,minute).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
    return `<option value="${time}" ${time===selectedTime?"selected":""}>${label}</option>`;
  }).join("");
  return `<div class="appointment-picker" id="appointment-date-picker" data-view-month="${year}-${String(monthIndex+1).padStart(2,"0")}">
    <div class="appointment-picker-header"><div><span>SELECT A DATE</span><strong>${monthTitle}</strong></div><div class="appointment-picker-nav"><button type="button" class="icon-button" data-action="appointment-month-prev" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="icon-button" data-action="appointment-month-next" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button></div></div>
    <div class="appointment-picker-weekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=>`<span>${day}</span>`).join("")}</div>
    <div class="appointment-picker-grid">${cells.join("")}</div>
    <div class="appointment-picker-footer"><div class="appointment-picker-selection"><span>SELECTED DATE</span><strong>${selected.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</strong></div><label class="appointment-picker-time" for="appointment-time"><span>TIME</span><select class="select-control" id="appointment-time">${timeOptions}</select></label></div>
  </div>`;
}

async function renderKnowledge() {
  state.documents = await api("/documents");
  appContent.innerHTML = `${heading("COMPANY CONTEXT", "Knowledge base", "Give your AI agent the context it needs to have better conversations.", `<button class="button button-primary" data-action="upload-document"><i class="fa-solid fa-arrow-up-from-bracket"></i> Upload document</button>`)}
    <section class="surface knowledge-hero"><div><h2>Make every answer more informed.</h2><p>Upload product guides, playbooks, pricing sheets, and FAQs. Nexora uses this knowledge to provide grounded responses in every conversation.</p><div class="knowledge-stats"><span class="knowledge-stat"><b>${state.documents.filter(doc=>doc.status==="Indexed").length}</b> indexed documents</span><span class="knowledge-stat"><b>Ready</b> retrieval status</span><span class="knowledge-stat"><b>PDF · DOCX · XLSX · PPTX + more</b> supported formats</span></div></div><div class="knowledge-icon"><i class="fa-solid fa-brain"></i></div></section>
    <section class="surface" style="padding:15px;margin-bottom:14px"><div class="dropzone" id="dropzone"><i class="fa-solid fa-cloud-arrow-up"></i><p>Drop files here or <button class="text-link" data-action="upload-document">browse files</button></p><small>PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, TSV, JSON, HTML, XML, YAML, RST, LOG · Up to 8 MB each</small><input type="file" id="document-file" accept=".pdf,.txt,.md,.markdown,.rst,.log,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.docx,.xlsx,.pptx" hidden></div></section>
    <div class="toolbar"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input id="knowledge-search" placeholder="Search across your knowledge..."></label><span class="table-muted">Your indexed documents</span></div>
    <section class="surface table-panel"><div class="table-scroll"><table><thead><tr><th>DOCUMENT</th><th>CATEGORY</th><th>STATUS</th><th>ADDED</th><th></th></tr></thead><tbody id="document-rows">${documentRows(state.documents)}</tbody></table></div></section>
    <section class="surface" id="retrieval-results" style="display:none;padding:17px;margin-top:14px"></section>`;
}
function documentRows(documents) {
  if (!documents.length) return `<tr><td colspan="5"><div class="empty-state"><i class="fa-regular fa-folder-open"></i><h3>Your knowledge base is empty</h3><p>Upload a PDF, Office, spreadsheet, presentation, text, or data file to make its contents searchable.</p></div></td></tr>`;
  return documents.map(doc=>`<tr><td><div class="customer-cell"><span class="doc-icon ${doc.name.toLowerCase().endsWith(".pdf")?"pdf":""}"><i class="fa-regular fa-file-lines"></i></span><div class="customer-name">${esc(doc.name)}</div></div></td><td>${pill(doc.category)}</td><td>${pill(doc.status)}</td><td class="table-muted">${niceDate(doc.created_at)}</td><td><button class="icon-button" data-action="delete-document" data-id="${doc.id}" aria-label="Delete document"><i class="fa-regular fa-trash-can"></i></button></td></tr>`).join("");
}

async function renderAnalytics(period = state.analyticsPeriod) {
  const [analytics, conversations, leads] = await Promise.all([api("/analytics"),api("/conversations"),api("/leads")]);
  state.analytics = analytics;
  state.analyticsPeriod = period;
  const rangeDays = Number(period);
  const cutoff = Date.now() - rangeDays * 86400000;
  const filtered = conversations.filter(call=>new Date(call.created_at).getTime()>=cutoff);
  const periodLeads = leads.filter(lead=>new Date(lead.created_at).getTime()>=cutoff);
  const sentiment = {
    Positive: filtered.filter(call=>call.sentiment==="Positive").length,
    Neutral: filtered.filter(call=>call.sentiment==="Neutral").length,
    Negative: filtered.filter(call=>call.sentiment==="Negative").length,
  };
  const qualified = periodLeads.filter(lead=>lead.score>=70).length;
  const viewAnalytics = {
    ...analytics,
    total_calls: filtered.length,
    successful: sentiment.Positive,
    qualified_leads: qualified,
    conversion_rate: periodLeads.length ? Math.round(qualified/periodLeads.length*100) : 0,
    average_duration: filtered.length ? Math.round(filtered.reduce((sum,call)=>sum+call.duration,0)/filtered.length) : 0,
    sentiment,
  };
  const sentimentTotal = Math.max(1,Object.values(sentiment).reduce((sum,value)=>sum+value,0));
  const positiveEnd = Math.round(sentiment.Positive/sentimentTotal*100);
  const neutralEnd = positiveEnd+Math.round(sentiment.Neutral/sentimentTotal*100);
  const maxDuration = Math.max(1,...filtered.map(c=>c.duration));
  const rows = [...filtered].sort((a,b)=>b.duration-a.duration).slice(0,5);
  appContent.innerHTML = `${heading("PERFORMANCE INTELLIGENCE", "Analytics", "Understand what’s working and where your next opportunity is.", `<span class="data-mode">DEMO DATA</span><select class="select-control" id="analytics-period" aria-label="Analytics date range"><option value="7" ${period==="7"?"selected":""}>Last 7 days</option><option value="30" ${period==="30"?"selected":""}>Last 30 days</option><option value="90" ${period==="90"?"selected":""}>Last 90 days</option></select><button class="button" data-action="export-analytics"><i class="fa-solid fa-arrow-down"></i> Export report</button>`)}
    <div class="metric-grid">${metricCard("Conversations",viewAnalytics.total_calls,"fa-regular fa-comments","+12.8%","","up")}${metricCard("Qualification rate",`${periodLeads.length?Math.round(qualified/periodLeads.length*100):0}%`,"fa-solid fa-user-check","+6.4%","cyan","up")}${metricCard("Conversion rate",`${viewAnalytics.conversion_rate}%`,"fa-solid fa-arrow-trend-up","+2.4%","green","up")}${metricCard("Avg. talk time",duration(viewAnalytics.average_duration),"fa-regular fa-clock","−1.2%","blue","down")}${metricCard("Qualified leads",viewAnalytics.qualified_leads,"fa-solid fa-bullseye","+16.4%","","up")}${metricCard("Appointments",viewAnalytics.appointments,"fa-regular fa-calendar-check","+6.1%","green","up")}</div>
    <div class="analytics-grid"><section class="surface chart-panel chart-large"><div class="section-heading"><div><h2>Conversation volume</h2><p>Calls and qualified leads · last ${rangeDays} days</p></div><span class="pill pill-positive">${filtered.length} conversations</span></div>${weeklyChart()}</section>
    <section class="surface chart-panel chart-large"><div class="section-heading"><div><h2>Sentiment overview</h2><p>Customer tone across selected period</p></div></div><div class="sentiment-layout" style="justify-content:center;padding-top:22px"><div class="donut-wrap" style="width:145px;height:145px"><div class="donut" style="background:conic-gradient(#22c55e 0 ${positiveEnd}%,#7788a6 ${positiveEnd}% ${neutralEnd}%,#ef4444 ${neutralEnd}% 100%)"></div><div class="donut-center"><strong>${viewAnalytics.total_calls}</strong><span>conversations</span></div></div><div class="sentiment-list">${Object.entries(viewAnalytics.sentiment||{}).map(([label,count])=>`<div class="sentiment-key"><span><i class="sentiment-dot ${label==="Neutral"?"neutral":label==="Negative"?"negative":""}"></i>${label}</span><b>${count}</b></div>`).join("")}</div></div></section></div>
    <section class="surface table-panel"><div class="table-panel-head"><div><h2 style="margin:0;font:600 12px var(--display)">Agent performance</h2><p style="margin:4px 0 0;color:#7e8ba0;font-size:9px">Conversation quality and customer engagement</p></div></div><div class="table-scroll"><table><thead><tr><th>CONVERSATION</th><th>CUSTOMER</th><th>DURATION</th><th>SENTIMENT</th><th>ENGAGEMENT</th><th>FOLLOW-UP</th></tr></thead><tbody>${rows.length?rows.map(call=>`<tr><td class="table-strong">Nexora voice agent</td><td>${esc(call.customer)}</td><td>${duration(call.duration)}</td><td>${pill(call.sentiment)}</td><td><div class="funnel-track" style="width:100px"><div class="funnel-fill" style="width:${Math.max(15,Math.round(call.duration/maxDuration*100))}%"></div></div></td><td>${esc(call.next_action||"—")}</td></tr>`).join(""):`<tr><td class="table-empty" colspan="6">No conversation data available for this period.</td></tr>`}</tbody></table></div></section>`;
}

async function renderSettings() {
  const values = await api("/settings");
  appContent.innerHTML = `${heading("WORKSPACE PREFERENCES", "Settings", "Tune your agent and workspace to match how your team sells.", "")}
    <div class="settings-layout"><nav class="surface settings-tabs"><a href="#settings-agent" class="settings-tab active"><i class="fa-solid fa-sliders"></i> AI agent</a><a href="#settings-business" class="settings-tab"><i class="fa-regular fa-building"></i> Business profile</a><a href="#settings-voice" class="settings-tab"><i class="fa-solid fa-microphone-lines"></i> Voice & language</a><a href="#settings-notifications" class="settings-tab"><i class="fa-regular fa-bell"></i> Notifications</a><a href="#settings-integrations" class="settings-tab"><i class="fa-solid fa-plug"></i> Integrations</a></nav>
    <section class="surface settings-form"><form id="settings-form">
      <section class="settings-group" id="settings-agent"><h2>AI agent configuration</h2><p>Set the personality and behavior of your autonomous sales agent.</p><div class="form-grid">
        <div class="form-field"><label>Agent name</label><input class="input-control" name="agent_name" value="${esc(values.agent_name||"Nexora")}"></div>
        <div class="form-field form-span"><label>Agent personality and instructions</label><textarea class="textarea-control" name="personality">${esc(values.personality||"You are a warm, curious, and professional sales assistant. Ask one thoughtful discovery question at a time, listen carefully, and never pressure the customer.")}</textarea></div>
      </div></section>
      <section class="settings-group" id="settings-voice"><h2>Voice & language</h2><p>Choose the browser speech output profile used by the voice agent.</p><div class="form-grid">
        <div class="form-field"><label>Default voice</label><select class="select-control" name="voice"><option>${esc(values.voice||"Default browser voice")}</option><option>English (US) · Female</option><option>English (US) · Male</option></select></div>
        <div class="form-field"><label>Language</label><select class="select-control" name="language"><option>${esc(values.language||"English (US)")}</option><option>English (UK)</option><option>Spanish</option><option>French</option></select></div>
        <div class="form-field"><label>Speaking pace</label><select class="select-control" name="pace"><option>${esc(values.pace||"Natural")}</option><option>Relaxed</option><option>Energetic</option></select></div>
      </div></section>
      <section class="settings-group" id="settings-business"><h2>Business profile</h2><p>Company details used as context for your sales agent.</p><div class="form-grid">
        <div class="form-field"><label>Business name</label><input class="input-control" name="business_name" value="${esc(values.business_name||"Nexora Studio")}"></div>
        <div class="form-field"><label>Business website</label><input class="input-control" name="business_website" value="${esc(values.business_website||"")}"></div>
      </div></section>
      <section class="settings-group" id="settings-notifications"><h2>Notifications</h2><p>Choose which workspace events should be surfaced to the team.</p><div class="form-grid">
        <div class="form-field"><label>Appointment updates</label><select class="select-control" name="notify_appointments"><option value="on" ${values.notify_appointments!=="off"?"selected":""}>Enabled</option><option value="off" ${values.notify_appointments==="off"?"selected":""}>Disabled</option></select></div>
        <div class="form-field"><label>New qualified lead alerts</label><select class="select-control" name="notify_leads"><option value="on" ${values.notify_leads!=="off"?"selected":""}>Enabled</option><option value="off" ${values.notify_leads==="off"?"selected":""}>Disabled</option></select></div>
      </div></section>
      <section class="settings-group" id="settings-integrations"><h2>AI provider & integrations</h2><p>Provider secrets are configured on the server and never exposed in frontend code.</p>
        <div class="config-note"><i class="fa-solid fa-circle-info"></i><span>Gemini integration status: <b id="ai-config-status">Checking…</b>. To connect, set <code>GEMINI_API_KEY</code> in the server’s <code>.env</code> file and restart the API.</span></div>
      </section>
      <div class="settings-save"><button class="button button-primary" type="submit"><i class="fa-regular fa-floppy-disk"></i> Save changes</button></div>
    </form></section></div>`;
  try {
    const health = await api("/health");
    $("#ai-config-status").textContent = health.ai_configured ? "Connected" : "Not configured";
    $("#ai-config-status").style.color = health.ai_configured ? "var(--green)" : "var(--yellow)";
  } catch { $("#ai-config-status").textContent = "Unavailable"; }
}

async function renderProfile(activeTab = "identity") {
  const result = await api("/profile");
  state.profile = result.profile;
  state.profileStats = result.stats;
  state.profilePhotoDraft = null;
  updateProfileChrome(state.profile);
  const profile = state.profile;
  const photo = profile.photo_data
    ? `<img src="${esc(profile.photo_data)}" alt="${esc(profile.name)} profile photo">`
    : `<span>${esc(initials(profile.name))}</span>`;
  const interests = ["Sales enablement","AI & automation","Customer experience","Analytics","Product strategy","Team leadership"];
  appContent.innerHTML = `${heading("YOUR ACCOUNT", "My profile", "Manage the personal details and interests attached to your workspace.", `<button class="button button-quiet" data-page="overview"><i class="fa-solid fa-arrow-left"></i> Back to overview</button><button class="button button-primary" data-action="save-profile"><i class="fa-regular fa-floppy-disk"></i> Save profile</button>`)}
    <div class="profile-layout">
      <aside class="surface profile-card">
        <div class="profile-secure"><span class="state-dot"></span> WORKSPACE PROFILE</div>
        <label class="profile-avatar-upload" for="profile-photo-file" title="Choose a profile photo"><span class="profile-avatar-large" id="profile-avatar-preview">${photo}</span><span class="profile-photo-edit"><i class="fa-solid fa-camera"></i></span></label>
        <input id="profile-photo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <h2 id="profile-card-name">${esc(profile.name)}</h2>
        <p id="profile-card-title">${esc(profile.title||"Workspace member")}</p>
        <span class="profile-role-pill"><i class="fa-solid fa-shield-halved"></i> Workspace admin</span>
        <div class="profile-stat-grid">
          <div class="profile-stat"><span><i class="fa-solid fa-wave-square"></i></span><strong>${result.stats.calls}</strong><small>CONVERSATIONS</small></div>
          <div class="profile-stat"><span><i class="fa-regular fa-calendar-check"></i></span><strong>${result.stats.appointments}</strong><small>APPOINTMENTS</small></div>
          <div class="profile-stat"><span><i class="fa-solid fa-user-check"></i></span><strong>${result.stats.qualified_leads}</strong><small>QUALIFIED LEADS</small></div>
          <div class="profile-stat"><span><i class="fa-solid fa-layer-group"></i></span><strong>Pro</strong><small>WORKSPACE PLAN</small></div>
        </div>
        <button class="button profile-analytics-button" data-page="analytics"><i class="fa-solid fa-chart-line"></i> Open analytics</button>
      </aside>
      <section class="surface profile-editor">
        <nav class="profile-tabs" aria-label="Profile sections">
          <button type="button" class="profile-tab ${activeTab==="identity"?"active":""}" data-action="profile-tab" data-tab="identity"><i class="fa-regular fa-id-card"></i> Identity</button>
          <button type="button" class="profile-tab ${activeTab==="photo"?"active":""}" data-action="profile-tab" data-tab="photo"><i class="fa-regular fa-image"></i> Photo</button>
          <button type="button" class="profile-tab ${activeTab==="interests"?"active":""}" data-action="profile-tab" data-tab="interests"><i class="fa-solid fa-shapes"></i> Interests</button>
        </nav>
        <form id="profile-form">
          <section class="profile-section ${activeTab==="identity"?"active":""}" data-profile-section="identity">
            <div class="profile-section-heading"><span class="profile-section-icon"><i class="fa-regular fa-id-card"></i></span><div><h2>Identity details</h2><p>Keep your contact information and workspace bio up to date.</p></div></div>
            <div class="form-grid">
              <div class="form-field"><label for="profile-name">Full name</label><input id="profile-name" class="input-control" name="name" value="${esc(profile.name)}" required maxlength="120"></div>
              <div class="form-field"><label for="profile-title">Role / designation</label><input id="profile-title" class="input-control" name="title" value="${esc(profile.title)}" maxlength="100"></div>
              <div class="form-field"><label for="profile-email">Email address</label><input id="profile-email" class="input-control" name="email" type="email" value="${esc(profile.email)}" maxlength="160"></div>
              <div class="form-field"><label for="profile-phone">Phone number</label><input id="profile-phone" class="input-control" name="phone" type="tel" value="${esc(profile.phone)}" maxlength="40"></div>
              <div class="form-field form-span"><label for="profile-location">Location</label><input id="profile-location" class="input-control" name="location" value="${esc(profile.location)}" maxlength="100" placeholder="City, country"></div>
              <div class="form-field form-span"><label for="profile-bio">About</label><textarea id="profile-bio" class="textarea-control" name="bio" maxlength="600" placeholder="A short introduction about you">${esc(profile.bio)}</textarea><small class="field-hint">Up to 600 characters</small></div>
            </div>
          </section>
          <section class="profile-section ${activeTab==="photo"?"active":""}" data-profile-section="photo">
            <div class="profile-section-heading"><span class="profile-section-icon"><i class="fa-regular fa-image"></i></span><div><h2>Profile photo</h2><p>Add a clear photo so teammates can recognize your profile.</p></div></div>
            <div class="profile-photo-panel"><span class="profile-avatar-large profile-avatar-preview-secondary" id="profile-photo-large">${photo}</span><div><strong>Choose a profile image</strong><p>PNG, JPG, or WebP. Maximum file size 1 MB.</p><label for="profile-photo-file" class="button button-small"><i class="fa-solid fa-arrow-up-from-bracket"></i> Upload photo</label><button type="button" class="button button-small button-quiet" data-action="remove-profile-photo">Remove</button></div></div>
          </section>
          <section class="profile-section ${activeTab==="interests"?"active":""}" data-profile-section="interests">
            <div class="profile-section-heading"><span class="profile-section-icon"><i class="fa-solid fa-shapes"></i></span><div><h2>Interests</h2><p>Select the areas you care about. You can update these any time.</p></div></div>
            <fieldset class="interest-grid"><legend class="sr-only">Choose your interests</legend>${interests.map((interest,index)=>`<label class="interest-option"><input type="checkbox" name="interests" value="${esc(interest)}" ${profile.interests.includes(interest)?"checked":""}><span class="interest-check"><i class="fa-solid fa-check"></i></span><span><b>${esc(interest)}</b><small>${["Playbooks and sales workflows","Voice automation and tooling","Customer relationships and service","Business metrics and reporting","Product discovery and direction","Coaching and collaboration"][index]}</small></span></label>`).join("")}</fieldset>
          </section>
        </form>
        <div class="profile-save-row"><span><i class="fa-solid fa-lock"></i> Profile is stored in this local workspace.</span><button class="button button-primary" data-action="save-profile"><i class="fa-regular fa-floppy-disk"></i> Save changes</button></div>
      </section>
    </div>`;
}

function renderVoice() {
  stopVoiceRibbon();
  const supported = ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && "speechSynthesis" in window;
  appContent.innerHTML = `${heading("REAL-TIME CONVERSATION", "Live voice agent", "Talk naturally. Nexora listens, understands, and responds in real time.", `<span class="data-mode">BROWSER VOICE</span>`)}
    <div class="voice-layout"><section class="surface voice-stage">
      <div class="agent-state ready" id="agent-state"><span class="state-dot"></span><span>Ready when you are</span></div>
      <div class="voice-visual" id="voice-visual" data-state="ready" aria-hidden="true"><span class="voice-orbit"></span><span class="voice-listening-floor"></span><div class="voice-center-wave">${voiceWaveBars()}</div><div class="voice-core"><i class="fa-solid fa-microphone-lines"></i></div></div>
      <div class="voice-name">Nexora <span class="voice-name-accent">AI</span></div><div class="voice-description">Your autonomous sales assistant</div>
      <input class="input-control voice-customer-input" id="voice-customer" placeholder="Customer name (optional)" value="${esc(state.voice.customer==="New caller"?"":state.voice.customer)}" ${state.voice.active?"disabled":""} aria-label="Customer name">
      <div class="waveform" id="waveform" data-state="${state.voice.active?"listening":"ready"}" aria-hidden="true"><canvas class="voice-ribbon" id="voice-ribbon"></canvas><div class="waveform-bars">${voiceWaveBars()}</div></div><div class="voice-timer" id="voice-timer">00:00</div>
      <div class="voice-actions" id="voice-actions">${state.voice.active?`<button class="mic-button" data-action="toggle-mute" aria-label="Mute microphone"><i class="fa-solid ${state.voice.muted?"fa-microphone-slash":"fa-microphone"}"></i></button><button class="button button-danger" data-action="end-call"><i class="fa-solid fa-phone-slash"></i> End call</button>`:`<button class="button button-primary" data-action="start-call"><i class="fa-solid fa-microphone"></i> Start conversation</button>`}</div>
      <div class="voice-caption">${state.voice.error?`<span class="voice-unsupported"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(state.voice.error)} — check microphone permissions or network access.</span>`:supported?`<span class="voice-supported"><i class="fa-solid fa-circle-check"></i> Browser speech recognition available</span>`:`<span class="voice-unsupported"><i class="fa-solid fa-triangle-exclamation"></i> Speech recognition is not supported in this browser. Try Chrome or Edge.</span>`}</div>
    </section>
    <div class="voice-side"><section class="surface transcript-panel"><div class="conversation-header" style="padding:0 0 12px;border-bottom:1px solid #ffffff0d"><div><h2>Live transcription</h2><span>Customer and agent conversation</span></div><span class="pill ${state.voice.active?"pill-positive":"pill-neutral"}">${state.voice.active?"Live":"Standby"}</span></div><div class="transcript-list" id="transcript-list">${voiceMessages()}</div><div id="transcript-status" class="table-muted" style="font-size:9px">${state.voice.active?"Listening for customer…":"Start a conversation to see the transcript."}</div></section>
    <section class="surface ai-response"><div class="response-header"><span class="ai-badge"><i class="fa-solid fa-sparkles"></i></span><b>AI response</b><span id="ai-status" class="table-muted" style="margin-left:auto;font-size:8px">${state.voice.active?"Ready":"Waiting"}</span></div><div id="ai-response-text" class="response-content">${state.voice.lastResponse?esc(state.voice.lastResponse):"Your agent’s spoken responses and suggestions will appear here."}</div></section></div></div>`;
  if (state.voice.active) {
    $("#voice-timer").textContent = duration(state.voice.seconds);
    updateVoiceState(state.voice.muted ? "Ready" : "Listening");
  }
}
function voiceWaveBars() {
  const count=35;
  const center=(count-1)/2;
  return Array.from({length:count},(_,index)=>{
    const envelope=Math.pow(Math.max(0,1-Math.abs(index-center)/(center+1)),.72);
    const variation=.42+.58*(.5+.5*Math.sin(index*1.38));
    const level=Math.round(5+envelope*variation*22);
    const delay=((index*11)%17)*.045;
    return `<span style="--level:${level}px;--delay:${delay}s"></span>`;
  }).join("");
}
function stopVoiceRibbon() {
  if (voiceRibbonFrame) cancelAnimationFrame(voiceRibbonFrame);
  voiceRibbonFrame = 0;
  if (voiceRibbonObserver) voiceRibbonObserver.disconnect();
  voiceRibbonObserver = null;
  if (voiceRibbonResizeHandler) window.removeEventListener("resize", voiceRibbonResizeHandler);
  voiceRibbonResizeHandler = null;
}
function startVoiceRibbon(status) {
  const canvas = $("#voice-ribbon");
  const waveform = $("#waveform");
  if (!canvas || !waveform) return;
  stopVoiceRibbon();
  const context = canvas.getContext("2d");
  if (!context) {
    waveform.classList.add("bars-fallback");
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const speaking = status === "Speaking";
  const processing = status === "Processing";
  const amplitude = processing ? 7 : speaking ? 22 : 17;
  const speed = processing ? .00075 : speaking ? .0034 : .0022;
  const strands = [
    { phase: 0, gain: 1, colors: ["#7e22ce", "#f27b3d", "#22c55e"], glow: "#f27b3d" },
    { phase: 2.15, gain: .72, colors: ["#22c55e", "#ef4444", "#7e22ce"], glow: "#22c55e" },
    { phase: 4.1, gain: .48, colors: ["#f27b3d", "#7e22ce", "#22c55e"], glow: "#7e22ce" },
  ];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  function draw(time) {
    if (!canvas.isConnected) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    const baseline = height / 2;
    const phaseTime = reducedMotion ? 0 : time * speed;
    const guide = context.createLinearGradient(0, 0, width, 0);
    guide.addColorStop(0, "rgba(242,123,61,0)");
    guide.addColorStop(.5, "rgba(242,123,61,.18)");
    guide.addColorStop(1, "rgba(34,197,94,0)");
    context.beginPath();
    context.moveTo(0, baseline);
    context.lineTo(width, baseline);
    context.strokeStyle = guide;
    context.lineWidth = 1;
    context.stroke();

    strands.forEach(strand => {
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, strand.colors[0]);
      gradient.addColorStop(.5, strand.colors[1]);
      gradient.addColorStop(1, strand.colors[2]);
      const phase = phaseTime + strand.phase;
      const breathing = .83 + .17 * Math.sin(phase * .55);
      context.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const progress = x / width;
        const envelope = Math.pow(Math.sin(Math.PI * progress), 1.2);
        const wave = Math.sin(progress * Math.PI * 5 + phase) +
          .28 * Math.sin(progress * Math.PI * 9 - phase * .7 + strand.phase);
        const y = baseline + wave * amplitude * strand.gain * envelope * breathing;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.save();
      context.globalAlpha = .36;
      context.strokeStyle = gradient;
      context.shadowColor = strand.glow;
      context.shadowBlur = 12;
      context.lineWidth = 5.5;
      context.stroke();
      context.restore();
      context.save();
      context.globalAlpha = .94;
      context.strokeStyle = gradient;
      context.lineWidth = 1.65;
      context.stroke();
      context.restore();
    });
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = bounds.width;
    height = bounds.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    draw(performance.now());
  }

  function animate(time) {
    if (!canvas.isConnected) {
      stopVoiceRibbon();
      return;
    }
    draw(time);
    if (!reducedMotion) voiceRibbonFrame = requestAnimationFrame(animate);
  }

  if ("ResizeObserver" in window) {
    voiceRibbonObserver = new ResizeObserver(resize);
    voiceRibbonObserver.observe(canvas);
  } else {
    voiceRibbonResizeHandler = resize;
    window.addEventListener("resize", voiceRibbonResizeHandler);
  }
  resize();
  if (!reducedMotion) voiceRibbonFrame = requestAnimationFrame(animate);
}
function voiceMessages() {
  return state.voice.messages.length ? state.voice.messages.map(message=>`<div class="message ${message.role==="customer"?"customer":""}"><span class="message-label">${message.role==="customer"?"Customer":"Nexora AI"}</span>${esc(message.text)}</div>`).join("") : `<div class="transcript-empty"><i class="fa-solid fa-wave-square" style="font-size:16px;color:#ffad70;display:block;margin-bottom:9px"></i>Conversation messages will appear here in real time.</div>`;
}
function updateVoiceState(status) {
  const element = $("#agent-state");
  if (!element) return;
  element.className = `agent-state ${status.toLowerCase()}`;
  const labels = { Ready:"Ready when you are", Listening:"Listening to customer", Processing:"Processing request", Speaking:"Nexora is responding" };
  element.innerHTML = `<span class="state-dot"></span><span>${labels[status] || esc(status)}</span>`;
  const visual = $("#voice-visual");
  if (visual) {
    visual.dataset.state = status.toLowerCase();
    visual.classList.toggle("active", status !== "Ready" && status !== "Conversation Ended");
    visual.closest(".voice-stage")?.classList.toggle("voice-listening", status === "Listening");
  }
  const waveform = $("#waveform");
  if (waveform) {
    waveform.dataset.state = status.toLowerCase();
    const active = ["Listening", "Speaking", "Processing"].includes(status);
    waveform.classList.toggle("active", active);
    waveform.classList.remove("bars-fallback");
    if (["Speaking", "Processing"].includes(status)) startVoiceRibbon(status);
    else stopVoiceRibbon();
  }
}
function renderChatbot() {
  const panel=$("#chatbot-panel");
  const messages=$("#chatbot-messages");
  panel.hidden=!state.chatbot.open;
  panel.setAttribute("aria-hidden",String(!state.chatbot.open));
  $("#chatbot-toggle").setAttribute("aria-expanded",String(state.chatbot.open));
  const greeting=`<div class="chatbot-message agent"><span class="chatbot-message-label">Nexora AI</span>Hi! I can help with sales questions, your workspace, and product information.</div>`;
  const history=state.chatbot.messages.map(message=>`<div class="chatbot-message ${message.role==="customer"?"customer":"agent"}"><span class="chatbot-message-label">${message.role==="customer"?"You":"Nexora AI"}</span>${esc(message.text)}</div>`).join("");
  const typing=state.chatbot.busy?`<div class="chatbot-message agent chatbot-typing" aria-label="Nexora AI is responding"><span></span><span></span><span></span></div>`:"";
  messages.innerHTML=`${history||greeting}${typing}`;
  messages.scrollTop=messages.scrollHeight;
  $("#chatbot-send").disabled=state.chatbot.busy||!$("#chatbot-input").value.trim();
}
function setChatbotOpen(open) {
  state.chatbot.open=open;
  renderChatbot();
  if(open) requestAnimationFrame(()=>$("#chatbot-input").focus());
}
async function sendChatbotMessage(message) {
  const text=message.trim();
  if(!text||state.chatbot.busy) return;
  state.chatbot.messages.push({role:"customer",text});
  state.chatbot.busy=true;
  $("#chatbot-input").value="";
  renderChatbot();
  try {
    const response=await api("/ai/respond",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,history:state.chatbot.messages,task:"reply"})});
    state.chatbot.messages.push({role:"agent",text:response.text});
  } catch(error) {
    state.chatbot.messages.push({role:"agent",text:`I couldn't respond: ${error.message}`});
  } finally {
    state.chatbot.busy=false;
    renderChatbot();
    if(state.chatbot.open) $("#chatbot-input").focus();
  }
}
function appendMessage(role, text) {
  state.voice.messages.push({ role, text });
  const list = $("#transcript-list");
  if (list) { list.innerHTML = voiceMessages(); list.scrollTop = list.scrollHeight; }
}
async function respondToCustomer(message) {
  updateVoiceState("Processing");
  const status = $("#ai-status"), output = $("#ai-response-text");
  if (status) status.textContent = "Generating";
  try {
    const response = await api("/ai/respond", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message,history:state.voice.messages,task:"reply"}) });
    state.voice.lastResponse = response.text;
    appendMessage("agent", response.text);
    if (output) output.textContent = response.text;
    if (status) status.textContent = "Responded";
    if ("speechSynthesis" in window && state.voice.active) {
      const utterance = new SpeechSynthesisUtterance(response.text);
      utterance.onstart = () => updateVoiceState("Speaking");
      utterance.onend = () => { if (state.voice.active && !state.voice.muted) updateVoiceState("Listening"); };
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
  } catch (error) {
    state.voice.lastResponse = error.message;
    if (output) output.innerHTML = `<span class="voice-unsupported">${esc(error.message)}</span>`;
    if (status) status.textContent = "Needs setup";
    updateVoiceState(state.voice.muted ? "Ready" : "Listening");
  }
}
function startVoiceCall() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !("speechSynthesis" in window)) {
    toast("Speech recognition is not available. Try Chrome or Edge.", true);
    return;
  }
  const customerName = $("#voice-customer")?.value.trim();
  state.voice.active = true; state.voice.muted = false; state.voice.seconds = 0; state.voice.messages = []; state.voice.customer = customerName || "New caller"; state.voice.error = "";
  const recognition = new Recognition();
  state.voice.recognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = event => {
    let finalText = "";
    let interim = "";
    for (let i=event.resultIndex;i<event.results.length;i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    const caption = $("#transcript-status");
    if (caption) caption.textContent = interim ? `Hearing: “${interim}”` : "Listening for customer…";
    if (finalText.trim()) {
      appendMessage("customer", finalText.trim());
      respondToCustomer(finalText.trim());
    }
  };
  recognition.onerror = event => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    state.voice.muted = true;
    state.voice.error = `Microphone error: ${event.error}`;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    updateVoiceState("Ready");
    const caption = $("#transcript-status");
    if (caption) caption.textContent = "Microphone paused after a browser speech error.";
    toast(`Microphone error: ${event.error}. Speech input paused.`, true);
  };
  recognition.onend = () => {
    if (state.voice.active && !state.voice.muted) {
      try { recognition.start(); } catch { /* The browser may still be closing its microphone stream. */ }
    }
  };
  try {
    recognition.start();
    state.voice.timer = setInterval(() => {
      state.voice.seconds++;
      const timer = $("#voice-timer");
      if (timer) timer.textContent = duration(state.voice.seconds);
    }, 1000);
    renderVoice();
    toast("Voice session started. Nexora is listening.");
  } catch {
    state.voice.active = false;
    toast("Could not start the microphone. Check browser permissions.", true);
    renderVoice();
  }
}
async function endVoiceCall() {
  state.voice.active = false;
  clearInterval(state.voice.timer);
  if (state.voice.recognition) { state.voice.recognition.onend = null; state.voice.recognition.stop(); }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  try {
    const transcript = JSON.stringify(state.voice.messages);
    const customer = state.voice.messages.find(m=>m.role==="customer");
    let analysis = {
      summary: "Not generated — configure Gemini to enable AI conversation summaries.",
      sentiment: "Neutral",
      requirements: "Not analyzed",
      next_action: "Review conversation and follow up",
    };
    if (customer) {
      try {
        const result = await api("/ai/respond", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({message:transcript,history:[],task:"analyze"}),
        });
        const clean = result.text.replace(/^```(?:json)?\s*|\s*```$/g,"").trim();
        analysis = {...analysis,...JSON.parse(clean)};
      } catch (error) {
        analysis.summary = `AI summary unavailable: ${error.message}`;
      }
    } else {
      analysis.summary = "Voice session ended before a customer transcript was captured.";
    }
    await api("/conversations", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      customer: customer ? state.voice.customer : "New caller",
      status:"Completed",sentiment:analysis.sentiment,duration:state.voice.seconds,
      summary:analysis.summary,requirements:analysis.requirements,next_action:analysis.next_action,transcript,
    })});
    toast(customer && analysis.summary.startsWith("AI summary unavailable:") ? "Conversation saved; AI analysis needs configuration." : "Conversation saved to history.");
  } catch(error) { toast(`Could not save conversation: ${error.message}`,true); }
  state.voice.messages = [];
  renderVoice();
}

function modal(content, wide = false, title = "") {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal${wide?" modal-wide":""}" role="dialog" aria-modal="true" aria-label="${esc(title||"Dialog")}">${title?`<div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>`:""}${content}${title?`<div class="modal-foot"><button class="button" data-action="close-modal">Cancel</button><button class="button button-primary" data-action="modal-submit">Save</button></div>`:""}</section></div>`;
}
function closeModal() { modalRoot.innerHTML = ""; }
function openLeadModal(lead) {
  const isEdit = Boolean(lead);
  modal(`<div class="modal-body">${leadForm(lead||{})}</div>`,false,isEdit?"Edit lead":"Add a lead");
  $("#lead-name").focus();
}
async function saveLead() {
  const form = $("#lead-form");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  data.score = Number(data.score);
  const id = form.dataset.id;
  try {
    await api(`/leads${id?`/${id}`:""}`,{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    closeModal(); toast(id?"Lead updated":"Lead added"); await renderLeads($("#lead-search")?.value||"",$("#lead-filter")?.value||"");
  } catch(error) { toast(error.message,true); }
}
function exportCsv(headers, rows, filename) {
  const csv = [headers,...rows].map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"})); link.download=filename; link.click();
  URL.revokeObjectURL(link.href);
}

document.addEventListener("click", async event => {
  if(event.target.closest("#chatbot-toggle")) { setChatbotOpen(true); return; }
  if(event.target.closest("#chatbot-close")) { setChatbotOpen(false); $("#chatbot-toggle").focus(); return; }
  const settingsTab = event.target.closest(".settings-tab");
  if (settingsTab) {
    document.querySelectorAll(".settings-tab").forEach(tab=>tab.classList.toggle("active",tab===settingsTab));
    return;
  }
  const pageLink = event.target.closest("[data-page]");
  if (pageLink) { event.preventDefault(); navigate(pageLink.dataset.page); return; }
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const {action,id} = actionElement.dataset;
  try {
    if (action==="toggle-theme") setTheme(state.theme==="dark"?"light":"dark");
    else if (action==="start-agent") navigate("voice");
    else if (action==="retry-page") navigate(state.page);
    else if (action==="profile-tab") {
      document.querySelectorAll(".profile-tab").forEach(tab=>tab.classList.toggle("active",tab.dataset.tab===actionElement.dataset.tab));
      document.querySelectorAll("[data-profile-section]").forEach(section=>section.classList.toggle("active",section.dataset.profileSection===actionElement.dataset.tab));
    } else if (action==="save-profile") await saveProfile();
    else if (action==="remove-profile-photo") {
      state.profilePhotoDraft = "";
      setProfilePhotoPreview("");
      toast("Profile photo removed. Save to apply the change.");
    }
    else if (action==="add-lead") openLeadModal();
    else if (action==="edit-lead") {
      const lead=state.leads.find(item=>item.id===Number(id)) || await api(`/leads`).then(items=>items.find(item=>item.id===Number(id)));
      closeModal();
      openLeadModal(lead); $("#lead-form").dataset.id=id;
    } else if (action==="lead-details") {
      const lead=state.leads.find(item=>item.id===Number(id));
      if (lead) showLeadDetails(lead);
    } else if (action==="delete-lead") {
      if (confirm("Delete this lead? This action cannot be undone.")) { await api(`/leads/${id}`,{method:"DELETE"}); toast("Lead deleted"); await renderLeads($("#lead-search")?.value||"",$("#lead-filter")?.value||""); }
    } else if (action==="modal-submit") {
      if ($("#lead-form")) await saveLead();
      else if ($("#appointment-form")) await saveAppointment();
      else if ($("#settings-form")) await saveSettings();
    } else if (action==="close-modal" || (action==="modal-backdrop" && event.target===actionElement)) closeModal();
    else if (action==="conversation-open") {
      const call=state.conversations.find(item=>item.id===Number(id)) || await api("/conversations").then(items=>items.find(item=>item.id===Number(id)));
      if (call) showConversation(call);
    } else if (action==="delete-conversation") {
      if (confirm("Permanently delete this conversation and its transcript? This action cannot be undone.")) {
        await api(`/conversations/${id}`,{method:"DELETE"});
        state.conversations=state.conversations.filter(item=>item.id!==Number(id));
        $("#conversation-count").textContent=state.conversations.length;
        $(".filters-row .table-muted").textContent=`${state.conversations.length} conversations`;
        updateConversationRows();
        toast("Conversation and transcript deleted");
      }
    }     else if (action==="add-appointment") modal(`<div class="modal-body">${appointmentForm()}</div>`,false,"Schedule an appointment");
    else if (action==="edit-appointment") {
      const appointment=state.appointments.find(item=>item.id===Number(id));
      if (appointment) { modal(`<div class="modal-body">${appointmentForm(appointment)}</div>`,false,"Edit appointment"); $("#appointment-form").dataset.id=id; }
    }
    else if (action==="appointment-month-prev" || action==="appointment-month-next") {
      const picker=$("#appointment-date-picker");
      const [year,month]=picker.dataset.viewMonth.split("-").map(Number);
      const offset=action==="appointment-month-prev"?-1:1;
      picker.outerHTML=appointmentDatePickerMarkup($("#appointment-start").value,new Date(year,month-1+offset,1));
    }
    else if (action==="appointment-date-select") {
      const selectedTime=$("#appointment-time").value;
      $("#appointment-start").value=`${actionElement.dataset.date}T${selectedTime}`;
      const [year,month,day]=actionElement.dataset.date.split("-").map(Number);
      $("#appointment-date-picker").outerHTML=appointmentDatePickerMarkup($("#appointment-start").value,new Date(year,month-1,day));
    }
    else if (action==="cancel-appointment") {
      if(confirm("Cancel and remove this appointment?")) { await api(`/appointments/${id}`,{method:"DELETE"}); toast("Appointment cancelled"); renderAppointments(); }
    } else if (action==="upload-document") $("#document-file")?.click();
    else if (action==="delete-document") {
      if(confirm("Remove this document from your knowledge base?")) { await api(`/documents/${id}`,{method:"DELETE"}); toast("Document removed"); renderKnowledge(); }
    } else if (action==="start-call") startVoiceCall();
    else if (action==="end-call") await endVoiceCall();
    else if (action==="toggle-mute") {
      state.voice.muted=!state.voice.muted;
      state.voice.error="";
      if(state.voice.muted) { state.voice.recognition?.stop(); if("speechSynthesis" in window) speechSynthesis.cancel(); }
      else { try { state.voice.recognition?.start(); } catch {} }
      renderVoice();
    } else if (action==="export-leads") exportCsv(["Name","Email","Phone","Company","Source","Interest","Sentiment","Score","Follow-up"],state.leads.map(x=>[x.name,x.email,x.phone,x.company,x.source,x.interest,x.sentiment,x.score,x.follow_up]),"nexora-leads.csv");
    else if (action==="export-analytics") exportCsv(["Customer","Date","Duration seconds","Sentiment","Summary","Next action"],state.conversations.map(x=>[x.customer,x.created_at,x.duration,x.sentiment,x.summary,x.next_action]),"nexora-analytics.csv");
    else if (action==="month-prev" || action==="month-next") {
      state.calendarDate.setMonth(state.calendarDate.getMonth()+(action==="month-prev"?-1:1));
      await renderAppointments();
    }
  } catch(error) { toast(error.message,true); }
});

async function saveAppointment() {
  const form=$("#appointment-form"); if(!form.reportValidity()) return;
  const data=Object.fromEntries(new FormData(form));
  if(!data.starts_at) { toast("Choose an appointment date and time.",true); return; }
  data.starts_at=new Date(data.starts_at).toISOString();
  const id=form.dataset.id;
  try { await api(`/appointments${id?`/${id}`:""}`,{method:id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); closeModal();toast(id?"Appointment updated":"Appointment scheduled");await renderAppointments(); }
  catch(error){toast(error.message,true);}
}
async function saveSettings() {
  const form=$("#settings-form"); const values=Object.fromEntries(new FormData(form));
  try { await api("/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({values})}); closeModal();toast("Settings saved");await renderSettings(); }
  catch(error){toast(error.message,true);}
}

let leadSearchTimer;
document.addEventListener("input", event => {
  if(event.target.id==="lead-search") {
    clearTimeout(leadSearchTimer);
    leadSearchTimer=setTimeout(()=>renderLeads(event.target.value,$("#lead-filter")?.value||"").catch(error=>toast(error.message,true)),250);
  } else if(event.target.id==="conversation-search") {
    updateConversationRows();
  } else if(event.target.id==="knowledge-search") {
    clearTimeout(leadSearchTimer);
    leadSearchTimer=setTimeout(async()=>{
      const results=$("#retrieval-results");
      if(!event.target.value.trim()){results.style.display="none";return;}
      try {
        const found=await api(`/knowledge/search?q=${encodeURIComponent(event.target.value)}`);
        results.style.display="block";
        results.innerHTML=`<div class="section-heading"><div><h2>Retrieval results</h2><p>Relevant knowledge snippets for “${esc(event.target.value)}”</p></div></div>${found.length?found.map(item=>`<div class="activity-item"><span class="doc-icon"><i class="fa-regular fa-file-lines"></i></span><div class="activity-copy"><b>${esc(item.name)}</b><br>${esc(item.snippet)}<small>Relevance score: ${item.score}</small></div></div>`).join(""):`<div class="empty-state">No matching information found in your documents.</div>`}`;
      }catch(error){toast(error.message,true);}
    },250);
  }
});
document.addEventListener("change", event => {
  if(event.target.id==="appointment-time") {
    const date=$("#appointment-start").value.slice(0,10);
    $("#appointment-start").value=`${date}T${event.target.value}`;
  } else if(event.target.id==="lead-filter") renderLeads($("#lead-search")?.value||"",event.target.value).catch(error=>toast(error.message,true));
  else if(event.target.id==="analytics-period") renderAnalytics(event.target.value).catch(error=>toast(error.message,true));
  else if(event.target.id==="conversation-filter") {
    updateConversationRows();
  }
  else if(event.target.id==="lead-sort") {
    const rows=[...state.leads];
    if(event.target.value==="score") rows.sort((a,b)=>b.score-a.score);
    if(event.target.value==="name") rows.sort((a,b)=>a.name.localeCompare(b.name));
    $("#lead-rows").innerHTML=leadRows(rows);
  } else if(event.target.id==="document-file" && event.target.files[0]) uploadFile(event.target.files[0]);
  else if(event.target.id==="profile-photo-file" && event.target.files[0]) previewProfilePhoto(event.target.files[0]);
});
document.addEventListener("submit",event=>{
  if(event.target.id==="chatbot-form"){event.preventDefault();sendChatbotMessage($("#chatbot-input").value);}
  else if(event.target.id==="settings-form"){event.preventDefault();saveSettings();}
  else if(event.target.id==="lead-form"){event.preventDefault();saveLead();}
  else if(event.target.id==="appointment-form"){event.preventDefault();saveAppointment();}
  else if(event.target.id==="profile-form"){event.preventDefault();saveProfile();}
});
document.addEventListener("input",event=>{
  if(event.target.id==="chatbot-input") $("#chatbot-send").disabled=state.chatbot.busy||!event.target.value.trim();
  else if(event.target.id==="profile-name") {
    const name=event.target.value.trim()||"Your name";
    const title=$("#profile-card-name");
    if(title) title.textContent=name;
  } else if(event.target.id==="profile-title") {
    const title=$("#profile-card-title");
    if(title) title.textContent=event.target.value||"Workspace member";
  }
});
async function uploadFile(file) {
  const form=new FormData();form.append("file",file);
  try {
    const document=await api("/documents",{method:"POST",body:form});
    toast(document.status==="Indexed"?"Document uploaded and indexed":"Uploaded, but no searchable text was found.");
    await renderKnowledge();
  }
  catch(error){toast(error.message,true);}
}
document.addEventListener("dragover",event=>{if(event.target.closest("#dropzone")){event.preventDefault();$("#dropzone").classList.add("drag-over");}});
document.addEventListener("dragleave",event=>{if(event.target.closest("#dropzone"))$("#dropzone").classList.remove("drag-over");});
document.addEventListener("drop",event=>{if(event.target.closest("#dropzone")){event.preventDefault();$("#dropzone").classList.remove("drag-over");if(event.dataTransfer.files[0])uploadFile(event.dataTransfer.files[0]);}});
$("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#global-search").addEventListener("keydown",event=>{
  if(event.key==="Enter" && event.target.value.trim()) { navigate("leads").then(()=>{const input=$("#lead-search");if(input){input.value=event.target.value;input.dispatchEvent(new Event("input",{bubbles:true}));}}); }
  if(event.key==="Escape") event.target.value="";
});
document.addEventListener("keydown",event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("#global-search").focus();}
  if(event.key==="Escape") {
    if(!$("#notification-panel").hidden) { closeNotificationPanel(); $("#notification-button").focus(); }
    if(state.chatbot.open) { setChatbotOpen(false); $("#chatbot-toggle").focus(); }
    closeModal();
  }
});
$("#notification-button").addEventListener("click",async()=>{
  const panel=$("#notification-panel");
  const opening=panel.hidden;
  panel.hidden=!opening;
  $("#notification-button").setAttribute("aria-expanded",String(opening));
  if(opening) await refreshNotifications();
});
$("#notification-close").addEventListener("click",closeNotificationPanel);
$("#notification-refresh").addEventListener("click",refreshNotifications);
document.addEventListener("click",event=>{
  if(!event.target.closest(".notification-control") && !$("#notification-panel").hidden) closeNotificationPanel();
});
$("#current-date").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
setTheme(state.theme,false);
renderChatbot();
navigate("overview");
