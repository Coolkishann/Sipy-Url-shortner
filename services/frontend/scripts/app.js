// ═══════════════════════════════════════════════
// App Controller — Snip URL Shortener
// ═══════════════════════════════════════════════

import {
  shortenUrl,
  getUrls,
  getAnalytics,
  getStats,
  deleteUrl,
  getHealth,
} from './api.js';

// ─── State ───
let currentView = 'dashboard';
let currentPage = 1;
const ITEMS_PER_PAGE = 15;

// ─── DOM Helpers ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Toast Notifications ───
function showToast(message, type = 'success') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : '✕';
  const color = type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)';
  
  toast.innerHTML = `
    <span class="toast-icon" style="color:${color};font-weight:700">${icon}</span>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── View Navigation ───
function switchView(viewName) {
  currentView = viewName;
  
  // Update nav
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });
  
  // Update sections
  $$('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });
  
  // Load data for the view
  switch (viewName) {
    case 'dashboard': loadDashboard(); break;
    case 'urls': loadAllUrls(); break;
    case 'health': loadHealth(); break;
  }
}

// Make globally accessible
window.switchView = switchView;

// ─── Number Formatting ───
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateUrl(url, max = 50) {
  if (url.length <= max) return url;
  return url.substring(0, max) + '…';
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function loadDashboard() {
  try {
    const [stats, urlData] = await Promise.all([
      getStats(),
      getUrls(1, 10),
    ]);

    // Update KPIs with counting animation
    animateValue('stat-total-urls', stats.totalUrls);
    animateValue('stat-active-urls', stats.activeUrls);
    animateValue('stat-total-clicks', stats.totalClicks);
    animateValue('stat-clicks-today', stats.clicksToday);

    // Update recent URLs table
    renderUrlTable('recent-urls-body', urlData.urls, false);
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data', 'error');
  }
}

function animateValue(elementId, target) {
  const el = $(`#${elementId}`);
  if (!el) return;
  
  const start = 0;
  const duration = 800;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + (target - start) * eased);
    el.textContent = formatNumber(current);
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// ═══════════════════════════════════════════════
// URL TABLE
// ═══════════════════════════════════════════════
function renderUrlTable(bodyId, urls, showExpiry = true) {
  const tbody = $(`#${bodyId}`);
  
  if (!urls || urls.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${showExpiry ? 7 : 6}" class="empty-state">No URLs found. Create one to get started!</td></tr>`;
    return;
  }

  tbody.innerHTML = urls.map(url => {
    const status = !url.is_active ? 'inactive' : 
                   (url.expires_at && new Date(url.expires_at) < new Date()) ? 'expired' : 'active';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    return `
      <tr>
        <td><span class="short-id">${url.short_id}</span></td>
        <td><span class="url-cell" title="${url.original_url}">${truncateUrl(url.original_url)}</span></td>
        <td>${formatNumber(url.click_count)}</td>
        <td>${formatDate(url.created_at)}</td>
        ${showExpiry ? `<td>${url.expires_at ? formatDate(url.expires_at) : 'Never'}</td>` : ''}
        <td><span class="badge badge-${status}">${statusLabel}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-sm btn-ghost" onclick="openAnalytics('${url.short_id}')" title="View analytics">📊</button>
            <button class="btn btn-sm btn-ghost" onclick="copyShortUrl('${url.short_id}')" title="Copy short URL">📋</button>
            ${url.is_active ? `<button class="btn btn-sm btn-danger" onclick="removeUrl('${url.short_id}')" title="Deactivate">🗑</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════
// ALL URLS
// ═══════════════════════════════════════════════
async function loadAllUrls() {
  try {
    const data = await getUrls(currentPage, ITEMS_PER_PAGE);
    renderUrlTable('all-urls-body', data.urls, true);
    renderPagination(data.total);
  } catch (err) {
    console.error('Load URLs error:', err);
    showToast('Failed to load URLs', 'error');
  }
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const paginationEl = $('#pagination');
  
  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }
  
  let html = '';

  if (currentPage > 1) {
    html += `<button class="btn btn-ghost btn-sm" onclick="goToPage(${currentPage - 1})">← Prev</button>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="btn btn-ghost btn-sm ${i === currentPage ? 'current' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span style="color:var(--text-tertiary)">…</span>`;
    }
  }

  if (currentPage < totalPages) {
    html += `<button class="btn btn-ghost btn-sm" onclick="goToPage(${currentPage + 1})">Next →</button>`;
  }

  paginationEl.innerHTML = html;
}

window.goToPage = (page) => {
  currentPage = page;
  loadAllUrls();
};

// ═══════════════════════════════════════════════
// SHORTEN FORM
// ═══════════════════════════════════════════════
function initShortenForm() {
  const form = $('#shorten-form');
  const resultCard = $('#result-card');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const urlInput = $('#input-url');
    const expirySelect = $('#input-expiry');
    const btn = $('#btn-shorten');

    const url = urlInput.value.trim();
    if (!url) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Shortening...';

    try {
      const result = await shortenUrl(url, expirySelect.value || undefined);

      $('#result-url').value = result.shortUrl;
      $('#result-meta').textContent = `Created ${formatDate(result.createdAt)}${result.expiresAt ? ` • Expires ${formatDate(result.expiresAt)}` : ''}`;
      resultCard.classList.remove('hidden');
      
      showToast('URL shortened successfully!');

      // Reset form
      urlInput.value = '';
      expirySelect.value = '';
    } catch (err) {
      showToast(err.message || 'Failed to shorten URL', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Shorten URL
      `;
    }
  });

  // Copy button
  $('#btn-copy').addEventListener('click', () => {
    const url = $('#result-url').value;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Copied to clipboard!');
    });
  });
}

// ═══════════════════════════════════════════════
// ANALYTICS MODAL
// ═══════════════════════════════════════════════
window.openAnalytics = async (shortId) => {
  const modal = $('#analytics-modal');
  const body = $('#analytics-body');
  
  modal.classList.remove('hidden');
  body.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const data = await getAnalytics(shortId);

    const deviceColors = {
      desktop: 'var(--accent-blue)',
      mobile: 'var(--accent-green)',
      tablet: 'var(--accent-purple)',
    };

    const totalDeviceClicks = Object.values(data.clicksByDevice).reduce((a, b) => a + b, 0) || 1;

    body.innerHTML = `
      <div class="analytics-stat-grid">
        <div class="analytics-stat">
          <div class="analytics-stat-value" style="color:var(--accent-blue)">${formatNumber(data.totalClicks)}</div>
          <div class="analytics-stat-label">Total Clicks</div>
        </div>
        <div class="analytics-stat">
          <div class="analytics-stat-value" style="color:var(--accent-green)">${formatNumber(data.url.click_count)}</div>
          <div class="analytics-stat-label">Redirects</div>
        </div>
        <div class="analytics-stat">
          <div class="analytics-stat-value" style="color:var(--accent-purple)">${formatDate(data.url.created_at)}</div>
          <div class="analytics-stat-label">Created</div>
        </div>
      </div>

      <div class="analytics-section">
        <h3>Original URL</h3>
        <p style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);word-break:break-all">${data.url.original_url}</p>
      </div>

      <div class="analytics-section">
        <h3>Device Breakdown</h3>
        <div class="device-bar">
          ${Object.entries(data.clicksByDevice).map(([device, count]) => 
            `<div class="device-bar-segment" style="width:${(count / totalDeviceClicks * 100)}%;background:${deviceColors[device] || 'var(--text-tertiary)'}"></div>`
          ).join('')}
        </div>
        <div class="device-legend">
          ${Object.entries(data.clicksByDevice).map(([device, count]) => 
            `<div class="device-legend-item">
              <div class="device-legend-dot" style="background:${deviceColors[device] || 'var(--text-tertiary)'}"></div>
              ${device} (${count})
            </div>`
          ).join('')}
        </div>
      </div>

      <div class="analytics-section">
        <h3>Clicks Over Time (Last 30 Days)</h3>
        <div class="click-chart">
          ${data.clicksByDay.length > 0 
            ? (() => {
                const maxClicks = Math.max(...data.clicksByDay.map(d => d.clicks));
                return data.clicksByDay.reverse().map(d => 
                  `<div class="click-bar" style="height:${Math.max(4, (d.clicks / maxClicks * 100))}%" title="${d.date}: ${d.clicks} clicks"></div>`
                ).join('');
              })()
            : '<div style="text-align:center;color:var(--text-tertiary);width:100%;padding:20px">No click data yet</div>'
          }
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="text-align:center;color:var(--accent-red);padding:40px">Failed to load analytics: ${err.message}</div>`;
  }
};

$('#modal-close').addEventListener('click', () => {
  $('#analytics-modal').classList.add('hidden');
});

$('#analytics-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    $('#analytics-modal').classList.add('hidden');
  }
});

// ═══════════════════════════════════════════════
// URL ACTIONS
// ═══════════════════════════════════════════════
window.copyShortUrl = (shortId) => {
  const url = `${window.location.origin}/${shortId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Short URL copied!');
  });
};

window.removeUrl = async (shortId) => {
  if (!confirm(`Deactivate /${shortId}? This action cannot be undone.`)) return;
  
  try {
    await deleteUrl(shortId);
    showToast('URL deactivated');
    
    if (currentView === 'dashboard') loadDashboard();
    if (currentView === 'urls') loadAllUrls();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
};

// ═══════════════════════════════════════════════
// HEALTH VIEW
// ═══════════════════════════════════════════════
async function loadHealth() {
  try {
    const health = await getHealth();
    
    // Update sidebar status
    const statusEl = $('#system-status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    
    dot.className = `status-dot ${health.status}`;
    text.textContent = health.status === 'healthy' ? 'All Systems Operational' : 'Service Degraded';
    
    // Render health cards
    const healthGrid = $('#health-grid');
    const services = [
      { name: 'Load Balancer', icon: '⚖️', status: 'up', sub: ':8080' },
      { name: 'API Server 1', icon: '⚡', status: health.services?.database === 'up' ? 'up' : 'down', sub: 'Fastify' },
      { name: 'API Server 2', icon: '⚡', status: health.services?.database === 'up' ? 'up' : 'down', sub: 'Fastify' },
      { name: 'PostgreSQL', icon: '🐘', status: health.services?.database || 'down', sub: ':5432' },
      { name: 'Redis', icon: '🔴', status: health.services?.cache || 'down', sub: ':6379' },
    ];

    healthGrid.innerHTML = services.map(s => `
      <div class="health-card ${s.status === 'up' ? 'healthy' : 'down'}">
        <div class="health-card-icon">${s.icon}</div>
        <div class="health-card-name">${s.name}</div>
        <div class="health-card-status ${s.status}">${s.status === 'up' ? '● Online' : '● Offline'}</div>
        <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:4px">${s.sub}</div>
      </div>
    `).join('');

    // Update architecture diagram status dots
    const archNodes = {
      'arch-lb': 'up',
      'arch-api1': health.services?.database === 'up' ? 'up' : 'down',
      'arch-api2': health.services?.database === 'up' ? 'up' : 'down',
      'arch-redis': health.services?.cache || 'down',
      'arch-pg': health.services?.database || 'down',
    };

    Object.entries(archNodes).forEach(([id, status]) => {
      const node = $(`#${id} .arch-node-status`);
      if (node) node.className = `arch-node-status ${status}`;
    });
    
  } catch (err) {
    console.error('Health check error:', err);
    const statusEl = $('#system-status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    dot.className = 'status-dot down';
    text.textContent = 'Connection Lost';
  }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Initialize navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) switchView(view);
    });
  });

  // Initialize form
  initShortenForm();

  // Refresh buttons
  $('#btn-refresh-stats')?.addEventListener('click', loadDashboard);
  $('#btn-refresh-health')?.addEventListener('click', loadHealth);

  // Initial load
  loadDashboard();
  loadHealth();

  // Auto-refresh health every 15s
  setInterval(loadHealth, 15000);
});
