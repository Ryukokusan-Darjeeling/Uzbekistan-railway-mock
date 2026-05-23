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
      dateEl.textContent = i18n.formatDate(this.sim.currentYear, this.sim.currentMonth);
    }

    const monthCountEl = document.getElementById('monthCount');
    if (monthCountEl) {
      monthCountEl.textContent = i18n.t('header.monthCount', this.sim.getTotalMonths());
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
    const volUnit = i18n.t('stat.volume.unit');
    this._animateValue('totalVolume', latest.totalVolume, '', volUnit);
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
    const tonUnit = i18n.t('cargo.unit.ton');
    const perTonUnit = i18n.t('cargo.unit.perTon');

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
      const localName = i18n.cargoName(cargo.id);

      html += `
        <tr>
          <td>
            <span class="cargo-badge ${cargo.id}">
              ${cargo.emoji} ${localName}
            </span>
            ${aiTag}
          </td>
          <td>${formatNumber(data.volume)}${tonUnit}</td>
          <td>$${data.price.toLocaleString()}${perTonUnit}</td>
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
        const localName = i18n.cargoName(cargo.id);

        html += `
          <div class="adjustment-item ${colorClass}">
            <span class="adj-emoji">${cargo.emoji}</span>
            <span class="adj-name">${localName}</span>
            <span class="adj-value">${sign}${pctChange}%</span>
            <span class="adj-arrow">${isIncrease ? '↑' : '↓'}</span>
          </div>
        `;
      }
    });

    if (!html) {
      html = `<div class="text-muted" style="padding:12px">${i18n.t('ai.adjustments.empty')}</div>`;
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
    const localRegionName = i18n.regionName(regionId);
    const localRegionDesc = i18n.regionDesc(regionId);

    let cargoBreakdownHTML = '';
    CARGO_TYPES.forEach(cargo => {
      const cargoRev = Math.round(monthData.cargo[cargo.id].revenue * region.revenueShare);
      const localName = i18n.cargoName(cargo.id);
      cargoBreakdownHTML += `
        <div class="region-stat">
          <div class="label">${cargo.emoji} ${localName}</div>
          <div class="value" style="color:${cargo.color}">$${formatNumber(cargoRev)}</div>
        </div>
      `;
    });

    document.getElementById('regionTitle').innerHTML = `${region.emoji} ${localRegionName} — ${localRegionDesc}`;
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
            <strong>${i18n.t('comparison.noData.title')}</strong><br>
            <span class="text-muted">${i18n.t('comparison.noData.desc')}</span>
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
          <div class="comp-label">${i18n.t('comparison.stat.months')}</div>
          <div class="comp-value">${aiMonths.length}${i18n.t('comparison.stat.months.unit')}</div>
        </div>
        <div class="comp-stat">
          <div class="comp-label">${i18n.t('comparison.stat.aiRevenue')}</div>
          <div class="comp-value" style="color:#06d6a0">$${formatNumber(totalActual)}</div>
        </div>
        <div class="comp-stat">
          <div class="comp-label">${i18n.t('comparison.stat.baseRevenue')}</div>
          <div class="comp-value" style="color:#667eea">$${formatNumber(totalBaseline)}</div>
        </div>
        <div class="comp-stat ${isPositive ? 'positive' : 'negative'}">
          <div class="comp-label">${i18n.t('comparison.stat.gain')}</div>
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
