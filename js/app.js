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
    this.map = new RailwayMap('railway-map');
    this.map.init();
    this.map.onRegionSelect = (regionId) => this._onRegionSelect(regionId);

    this.charts = new ChartManager();
    this.charts.init();

    this.ui = new UIManager(this.sim);

    this._bindEvents();
    this._updateAll();

    // Hide loading overlay
    setTimeout(() => {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.add('hidden');
    }, 1600);

    console.log('🚂 中吉乌铁路经济模拟器已启动');
  }

  _bindEvents() {
    document.getElementById('btnAdvance').addEventListener('click', () => this.advanceMonth());

    document.getElementById('btnAdvance6').addEventListener('click', () => {
      for (let i = 0; i < 6; i++) this.sim.advanceMonth();
      this._updateAll();
      this.ui.showToast('⏩ 已快进 6 个月', 'info');
    });

    document.getElementById('btnReset').addEventListener('click', () => this.resetSimulation());
    document.getElementById('btnResetMap')?.addEventListener('click', () => {
      this.map.resetView();
      this.ui.hideRegionPanel();
    });

    document.getElementById('apiKeyInput')?.addEventListener('change', (e) => {
      this.advisor.setApiKey(e.target.value);
      if (this.advisor.useAPI) {
        this.ui.showToast('🔑 API Key 已设置，将使用 Groq AI', 'success');
      }
    });

    document.getElementById('btnGetAdvice').addEventListener('click', () => this.getAdvice());
    document.getElementById('aiToggle')?.addEventListener('change', (e) => this._toggleAI(e.target.checked));
    document.getElementById('btnExportComparison')?.addEventListener('click', () => this._showComparisonChart());

    document.getElementById('btnDownloadChart')?.addEventListener('click', () => {
      this.charts.downloadComparisonChart();
      this.ui.showToast('⬇️ 对比图已下载', 'success');
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
        statusText.textContent = '已采纳 AI 建议 ✓';
        statusDot.className = 'status-dot on';
        toggleLabel.classList.add('active');
        if (preview) preview.style.display = 'block';
        this.ui.showToast('🤖 AI 调控已开启，下月模拟将采纳 AI 建议', 'success');
      } else {
        statusText.textContent = '请先获取 AI 建议';
        statusDot.className = 'status-dot pending';
        toggleLabel.classList.add('active');
        this.ui.showToast('⚠️ 请先点击「获取 AI 建议」，再开启 AI 调控', 'info');
      }
      if (exportBtn) exportBtn.disabled = false;
    } else {
      this.sim.setAIAdjustments({});
      statusText.textContent = '未采纳 AI 建议';
      statusDot.className = 'status-dot off';
      toggleLabel.classList.remove('active');
      if (preview) preview.style.display = 'none';
      this.ui.showToast('AI 调控已关闭', 'info');
    }
  }

  advanceMonth() {
    this.sim.advanceMonth();
    this._updateAll();
    const data = this.sim.getLatestMonthData();
    let toastMsg = `📅 已推进到 ${data.monthLabelCN}`;
    if (data.aiApplied) toastMsg += ' (AI 调控生效中)';
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
      advisorResult.innerHTML = '<span class="text-muted">点击「获取 AI 建议」按钮获取货物调度建议...</span>';
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

    this.ui.showToast('🔄 模拟器已重置到 2026年1月', 'info');
  }

  async getAdvice() {
    const resultEl = document.getElementById('advisorResult');
    if (!resultEl) return;

    resultEl.innerHTML = `
      <div class="advisor-result loading" style="display:flex;align-items:center;gap:12px">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <span>正在分析数据并生成调度建议...</span>
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
        if (statusText) statusText.textContent = '已采纳 AI 建议 ✓';
        if (statusDot) statusDot.className = 'status-dot on';
        const preview = document.getElementById('aiAdjustmentsPreview');
        if (preview) preview.style.display = 'block';
      }

      const exportBtn = document.getElementById('btnExportComparison');
      if (exportBtn) exportBtn.disabled = false;
      this.ui.showToast('✅ AI 建议已生成，可开启 AI 调控开关采纳建议', 'success');
    } else {
      resultEl.innerHTML = '<span class="text-red">⚠️ 获取建议失败，请检查网络或 API Key</span>';
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
