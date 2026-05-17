// ============================================
// UI 更新模块 — ui.js
// Dashboard UI rendering & updates
// ============================================

class UIManager {
  constructor(sim) {
    this.sim = sim;
  }

  updateAll() {
    this.updateDateDisplay();
    this.updateStatCards();
    this.updateCargoTable();
  }

  updateDateDisplay() {
    const dateEl = document.getElementById('simDate');
    if (dateEl) {
      dateEl.textContent = this.sim.getCurrentDateStr();
    }

    const monthCountEl = document.getElementById('monthCount');
    if (monthCountEl) {
      monthCountEl.textContent = `第 ${this.sim.getTotalMonths()} 个月`;
    }
  }

  updateStatCards() {
    const latest = this.sim.getLatestMonthData();
    const delta = this.sim.getMonthlyDelta();

    // Total revenue
    this._animateValue('totalRevenue', this.sim.totalRevenue, '$');

    // Monthly revenue
    this._animateValue('monthlyRevenue', latest.totalRevenue, '$');

    // Delta
    const deltaEl = document.getElementById('revenueDelta');
    if (deltaEl) {
      const sign = delta.percentage > 0 ? '+' : '';
      deltaEl.textContent = `${sign}${delta.percentage.toFixed(1)}%`;
      deltaEl.className = `stat-value ${delta.percentage >= 0 ? 'delta-positive' : 'delta-negative'}`;
    }

    const deltaIndicator = document.getElementById('deltaIndicator');
    if (deltaIndicator) {
      const sign = delta.percentage > 0 ? '+' : '';
      deltaIndicator.textContent = `${delta.percentage >= 0 ? '↑' : '↓'} ${sign}${delta.percentage.toFixed(1)}%`;
      deltaIndicator.className = `delta-indicator ${delta.percentage >= 0 ? 'positive' : 'negative'}`;
    }

    // Volume
    this._animateValue('totalVolume', latest.totalVolume, '', '吨');
  }

  _animateValue(elementId, targetValue, prefix = '', suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.add('value-flash');
    el.textContent = `${prefix}${formatNumber(targetValue)}${suffix}`;

    setTimeout(() => el.classList.remove('value-flash'), 600);
  }

  updateCargoTable() {
    const tbody = document.getElementById('cargoTableBody');
    if (!tbody) return;

    const latest = this.sim.getLatestMonthData();
    const previous = this.sim.getPreviousMonthData();

    let html = '';
    CARGO_TYPES.forEach(cargo => {
      const data = latest.cargo[cargo.id];
      let trendStr = '-';
      let trendClass = '';

      if (previous) {
        const prevRev = previous.cargo[cargo.id].revenue;
        const change = ((data.revenue - prevRev) / prevRev * 100);
        const sign = change > 0 ? '+' : '';
        trendStr = `${sign}${change.toFixed(1)}%`;
        trendClass = change >= 0 ? 'delta-positive' : 'delta-negative';
      }

      // Show AI adjustment indicator
      const aiTag = data.aiAdjusted ? '<span class="ai-adjusted-tag">AI</span>' : '';

      html += `
        <tr>
          <td>
            <span class="cargo-badge ${cargo.id}">
              ${cargo.emoji} ${cargo.name}
            </span>
            ${aiTag}
          </td>
          <td>${formatNumber(data.volume)} 吨</td>
          <td>$${data.price.toLocaleString()}/吨</td>
          <td style="font-weight:600">$${formatNumber(data.revenue)}</td>
          <td class="${trendClass}" style="font-weight:600">${trendStr}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  // Update adjustments preview panel
  updateAdjustmentsPreview(adjustments) {
    const grid = document.getElementById('adjustmentsGrid');
    if (!grid) return;

    let html = '';
    CARGO_TYPES.forEach(cargo => {
      const multiplier = adjustments[cargo.id];
      if (multiplier) {
        const pctChange = ((multiplier - 1) * 100).toFixed(0);
        const isIncrease = multiplier > 1;
        const sign = isIncrease ? '+' : '';
        const colorClass = isIncrease ? 'adj-increase' : 'adj-decrease';

        html += `
          <div class="adjustment-item ${colorClass}">
            <span class="adj-emoji">${cargo.emoji}</span>
            <span class="adj-name">${cargo.name}</span>
            <span class="adj-value">${sign}${pctChange}%</span>
            <span class="adj-arrow">${isIncrease ? '↑' : '↓'}</span>
          </div>
        `;
      }
    });

    if (!html) {
      html = '<div class="text-muted" style="padding:12px">暂无调控参数</div>';
    }

    grid.innerHTML = html;
  }

  // Show region detail panel
  showRegionPanel(regionId, monthData) {
    const panel = document.getElementById('regionPanel');
    if (!panel) return;

    const region = REGIONS.find(r => r.id === regionId);
    if (!region) return;

    const regionData = monthData.regionRevenue[regionId];

    let cargoBreakdownHTML = '';
    CARGO_TYPES.forEach(cargo => {
      const cargoRev = Math.round(monthData.cargo[cargo.id].revenue * region.revenueShare);
      cargoBreakdownHTML += `
        <div class="region-stat">
          <div class="label">${cargo.emoji} ${cargo.name}</div>
          <div class="value" style="color:${cargo.color}">$${formatNumber(cargoRev)}</div>
        </div>
      `;
    });

    document.getElementById('regionTitle').innerHTML = `${region.emoji} ${region.name} — ${region.description}`;
    document.getElementById('regionDistance').textContent = region.distance;
    document.getElementById('regionRevenue').textContent = `$${formatNumber(regionData.revenue)}`;
    document.getElementById('regionShare').textContent = `${(region.revenueShare * 100).toFixed(0)}%`;
    document.getElementById('regionCargoBreakdown').innerHTML = cargoBreakdownHTML;

    panel.classList.add('active');
  }

  hideRegionPanel() {
    const panel = document.getElementById('regionPanel');
    if (panel) panel.classList.remove('active');
  }

  // Update comparison summary stats
  updateComparisonSummary(history, hasAIData) {
    const summaryEl = document.getElementById('comparisonSummary');
    if (!summaryEl) return;

    if (!hasAIData) {
      summaryEl.innerHTML = `
        <div class="comparison-notice">
          <span class="icon">💡</span>
          <div>
            <strong>暂无 AI 调控数据</strong><br>
            <span class="text-muted">请先获取 AI 建议并开启 AI 调控开关，然后推进月份以查看对比效果。
            目前显示的两条线完全重叠，因为所有月份均未采纳 AI 建议。</span>
          </div>
        </div>
      `;
      return;
    }

    const aiMonths = history.filter(d => d.aiApplied);
    const totalActual = aiMonths.reduce((s, d) => s + d.actualRevenue, 0);
    const totalBaseline = aiMonths.reduce((s, d) => s + d.baselineRevenue, 0);
    const diff = totalActual - totalBaseline;
    const pct = totalBaseline > 0 ? ((diff / totalBaseline) * 100).toFixed(1) : '0.0';
    const isPositive = diff >= 0;

    summaryEl.innerHTML = `
      <div class="comparison-stats-grid">
        <div class="comp-stat">
          <div class="comp-label">AI 调控月数</div>
          <div class="comp-value">${aiMonths.length} 个月</div>
        </div>
        <div class="comp-stat">
          <div class="comp-label">AI 调控期间总收益</div>
          <div class="comp-value" style="color:#06d6a0">$${formatNumber(totalActual)}</div>
        </div>
        <div class="comp-stat">
          <div class="comp-label">同期基线收益</div>
          <div class="comp-value" style="color:#667eea">$${formatNumber(totalBaseline)}</div>
        </div>
        <div class="comp-stat ${isPositive ? 'positive' : 'negative'}">
          <div class="comp-label">AI 调控增益</div>
          <div class="comp-value">
            ${isPositive ? '↑' : '↓'} ${isPositive ? '+' : ''}$${formatNumber(diff)}
            <span class="comp-pct">(${isPositive ? '+' : ''}${pct}%)</span>
          </div>
        </div>
      </div>
    `;
  }

  // Show toast notification
  showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  }
}

window.UIManager = UIManager;
