// ============================================
// 主控制器 — app.js
// 应用初始化 & 事件绑定
// ============================================

class App {
  constructor() {
    this.sim = new SimulationEngine();
    this.map = null;
    this.charts = null;
    this.advisor = new CargoAdvisor();
    this.ui = null;
    this.lastAdvice = null;
    this.lastAdjustments = null;
  }

  init() {
    // Initialize i18n configuration first
    i18n.init();

    this.map = new RailwayMap('railway-map');
    this.map.init();
    this.map.onRegionSelect = (regionId) => this._onRegionSelect(regionId);

    this.charts = new ChartManager();
    this.charts.init();

    this.ui = new UIManager(this.sim);

    this._bindEvents();
    
    // Register language change listener to refresh UI & Charts dynamically
    i18n.onChange(() => {
      this._updateAll();
      this.charts.updateLocale();

      // If we already have local AI advice, regenerate it in the new language
      if (this.lastAdvice) {
        const resultEl = document.getElementById('advisorResult');
        if (resultEl) {
          if (!this.lastAdvice.raw) {
            const summary = this.sim.getSimulationSummary();
            this.lastAdvice = this.advisor._getLocalAdvice(summary);
          }
          resultEl.innerHTML = CargoAdvisor.formatAdviceHTML(this.lastAdvice);
        }
      }

      // Update adjustments preview in the new language
      if (this.lastAdjustments) {
        this.ui.updateAdjustmentsPreview(this.lastAdjustments);
      }
    });

    this._updateAll();

    // Hide loading overlay
    setTimeout(() => {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.add('hidden');
    }, 1600);

    console.log('🚂 中吉乌铁路经济模拟器已启动 / CKU Railway Simulator Started');
  }

  _bindEvents() {
    document.getElementById('btnAdvance').addEventListener('click', () => this.advanceMonth());

    document.getElementById('btnAdvance6').addEventListener('click', () => {
      for (let i = 0; i < 6; i++) this.sim.advanceMonth();
      this._updateAll();
      this.ui.showToast(i18n.t('toast.advance6'), 'info');
    });

    document.getElementById('btnReset').addEventListener('click', () => this.resetSimulation());
    document.getElementById('btnResetMap')?.addEventListener('click', () => {
      this.map.resetView();
      this.ui.hideRegionPanel();
    });

    // Language Toggle Click Event
    document.getElementById('langToggle')?.addEventListener('click', () => {
      i18n.toggle();
    });

    document.getElementById('apiKeyInput')?.addEventListener('change', (e) => {
      this.advisor.setApiKey(e.target.value);
      if (this.advisor.useAPI) {
        this.ui.showToast(i18n.t('toast.apiKeySet'), 'success');
      }
    });

    document.getElementById('btnGetAdvice').addEventListener('click', () => this.getAdvice());
    document.getElementById('aiToggle')?.addEventListener('change', (e) => this._toggleAI(e.target.checked));
    document.getElementById('btnExportComparison')?.addEventListener('click', () => this._showComparisonChart());

    document.getElementById('btnDownloadChart')?.addEventListener('click', () => {
      this.charts.downloadComparisonChart();
      this.ui.showToast(i18n.t('toast.chartDownloaded'), 'success');
    });

    document.getElementById('btnCloseComparison')?.addEventListener('click', () => {
      const section = document.getElementById('comparisonSection');
      if (section) section.style.display = 'none';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'n') this.advanceMonth();
    });
  }

  // ---- AI Toggle Logic ----
  _toggleAI(enabled) {
    this.sim.setAIEnabled(enabled);
    const statusBadge = document.getElementById('aiStatusBadge');
    const statusText = document.getElementById('aiStatusText');
    const statusDot = statusBadge?.querySelector('.status-dot');
    const toggleLabel = document.getElementById('aiToggleLabel');
    const preview = document.getElementById('aiAdjustmentsPreview');
    const exportBtn = document.getElementById('btnExportComparison');

    if (enabled) {
      if (this.lastAdjustments && Object.keys(this.lastAdjustments).length > 0) {
        this.sim.setAIAdjustments(this.lastAdjustments);
        statusText.textContent = i18n.t('ai.status.on');
        statusDot.className = 'status-dot on';
        toggleLabel.classList.add('active');
        if (preview) preview.style.display = 'block';
        this.ui.showToast(i18n.t('toast.aiOn'), 'success');
      } else {
        statusText.textContent = i18n.t('ai.status.pending');
        statusDot.className = 'status-dot pending';
        toggleLabel.classList.add('active');
        this.ui.showToast(i18n.t('toast.aiNeedAdvice'), 'info');
      }
      if (exportBtn) exportBtn.disabled = false;
    } else {
      this.sim.setAIAdjustments({});
      statusText.textContent = i18n.t('ai.status.off');
      statusDot.className = 'status-dot off';
      toggleLabel.classList.remove('active');
      if (preview) preview.style.display = 'none';
      this.ui.showToast(i18n.t('toast.aiOff'), 'info');
    }
  }

  advanceMonth() {
    this.sim.advanceMonth();
    this._updateAll();
    const data = this.sim.getLatestMonthData();
    
    // Localize the advance month message
    const formattedDate = i18n.formatDate(data.year, data.month);
    let toastMsg = i18n.t('toast.advance', formattedDate);
    if (data.aiApplied) {
      toastMsg += i18n.t('toast.advance.ai');
    }
    this.ui.showToast(toastMsg, 'success');
  }

  resetSimulation() {
    this.charts.destroy();
    this.sim.reset();
    this.charts.init();
    this.map.resetView();
    this.ui.hideRegionPanel();
    this._updateAll();

    const advisorResult = document.getElementById('advisorResult');
    if (advisorResult) {
      advisorResult.innerHTML = `<span class="text-muted">${i18n.t('ai.result.placeholder')}</span>`;
    }

    this.lastAdvice = null;
    this.lastAdjustments = null;
    const toggle = document.getElementById('aiToggle');
    if (toggle) toggle.checked = false;
    this._toggleAI(false);

    const compSection = document.getElementById('comparisonSection');
    if (compSection) compSection.style.display = 'none';
    const exportBtn = document.getElementById('btnExportComparison');
    if (exportBtn) exportBtn.disabled = true;

    this.ui.showToast(i18n.t('toast.reset'), 'info');
  }

  async getAdvice() {
    const resultEl = document.getElementById('advisorResult');
    if (!resultEl) return;

    resultEl.innerHTML = `
      <div class="advisor-result loading" style="display:flex;align-items:center;gap:12px">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span>${i18n.t('ai.loading')}</span>
      </div>
    `;

    const summary = this.sim.getSimulationSummary();
    const advice = await this.advisor.getAdvice(summary);

    if (advice) {
      this.lastAdvice = advice;
      resultEl.innerHTML = CargoAdvisor.formatAdviceHTML(advice);

      if (advice.raw) {
        this.lastAdjustments = CargoAdvisor.parseRawAdviceToAdjustments(advice.content);
      } else {
        this.lastAdjustments = advice.structured?.adjustments || {};
      }

      this.ui.updateAdjustmentsPreview(this.lastAdjustments);

      const toggle = document.getElementById('aiToggle');
      if (toggle && toggle.checked) {
        this.sim.setAIAdjustments(this.lastAdjustments);
        const statusText = document.getElementById('aiStatusText');
        const statusDot = document.getElementById('aiStatusBadge')?.querySelector('.status-dot');
        if (statusText) statusText.textContent = i18n.t('ai.status.on');
        if (statusDot) statusDot.className = 'status-dot on';
        const preview = document.getElementById('aiAdjustmentsPreview');
        if (preview) preview.style.display = 'block';
      }

      const exportBtn = document.getElementById('btnExportComparison');
      if (exportBtn) exportBtn.disabled = false;
      this.ui.showToast(i18n.t('toast.adviceGenerated'), 'success');
    } else {
      resultEl.innerHTML = `<span class="text-red">⚠️ ${i18n.t('ai.error')}</span>`;
    }
  }

  _showComparisonChart() {
    const section = document.getElementById('comparisonSection');
    if (!section) return;

    const revenueHistory = this.sim.getRevenueComparisonData();
    const hasAIData = revenueHistory.some(d => d.aiApplied);

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    this.charts.initComparisonChart();
    this.charts.updateComparisonChart(revenueHistory);
    this.ui.updateComparisonSummary(revenueHistory, hasAIData);
  }

  _updateAll() {
    this.ui.updateAll();
    this._updateCharts();
    this._updateRegionPanelIfOpen();
  }

  _updateCharts() {
    const allData = this.sim.getAllMonthlyData();
    this.charts.updateTrendChart(allData);

    const latest = this.sim.getLatestMonthData();
    this.charts.updateCargoChart(latest.cargo);

    const compSection = document.getElementById('comparisonSection');
    if (compSection && compSection.style.display !== 'none') {
      const revenueHistory = this.sim.getRevenueComparisonData();
      this.charts.updateComparisonChart(revenueHistory);
      const hasAIData = revenueHistory.some(d => d.aiApplied);
      this.ui.updateComparisonSummary(revenueHistory, hasAIData);
    }
  }

  _onRegionSelect(regionId) {
    const latest = this.sim.getLatestMonthData();
    const regionData = latest.regionRevenue[regionId];
    if (regionData) {
      this.map.showRegionPopup(regionId, regionData);
      this.ui.showRegionPanel(regionId, latest);
    }
  }

  _updateRegionPanelIfOpen() {
    const panel = document.getElementById('regionPanel');
    if (panel && panel.classList.contains('active') && this.map.selectedRegion) {
      const latest = this.sim.getLatestMonthData();
      this.ui.showRegionPanel(this.map.selectedRegion, latest);
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
