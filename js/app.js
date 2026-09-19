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
    // 智能体决策记忆已同步到的收益历史长度
    this._memorySyncedCount = 0;
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

    // 本地配置已提供 API Key 时，回填输入框（password 掩码显示），无需手动输入
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (apiKeyInput && this.advisor.useAPI) {
      apiKeyInput.value = this.advisor.apiKey;
    }

    // 同步智能体模式选择器（默认多智能体）
    const modeSelect = document.getElementById('agentModeSelect');
    if (modeSelect) this.advisor.setMode(modeSelect.value);
    
    // Register language change listener to refresh UI & Charts dynamically
    i18n.onChange(() => {
      this._updateAll();
      this.charts.updateLocale();

      // If we already have local AI advice, regenerate it in the new language
      // （DeepSeek 智能体建议为 API 返回内容，不重新生成，避免重复计费）
      if (this.lastAdvice) {
        const resultEl = document.getElementById('advisorResult');
        if (resultEl) {
          if (this.lastAdvice.isLocal) {
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
      this._syncAdvisorMemory();
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

    document.getElementById('agentModeSelect')?.addEventListener('change', (e) => {
      this.advisor.setMode(e.target.value);
      this.ui.showToast(
        e.target.value === 'multi' ? i18n.t('toast.modeMulti') : i18n.t('toast.modeSingle'),
        'info'
      );
    });
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

  // ---- 智能体反馈闭环：把已模拟月份的实际效果写入决策记忆 ----
  _syncAdvisorMemory() {
    const history = this.sim.getRevenueComparisonData();
    for (let i = this._memorySyncedCount; i < history.length; i++) {
      const h = history[i];
      if (h.aiApplied && h.adjustments) {
        const outcomePct = h.baselineRevenue > 0
          ? parseFloat(((h.actualRevenue - h.baselineRevenue) / h.baselineRevenue * 100).toFixed(1))
          : 0;
        this.advisor.learnFromOutcome({
          month: h.label,
          adjustments: h.adjustments,
          outcomePct
        });
      }
    }
    this._memorySyncedCount = history.length;
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
        this.advisor.setPrevAdjustments(this.lastAdjustments);
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
      this.advisor.setPrevAdjustments(null);
      statusText.textContent = i18n.t('ai.status.off');
      statusDot.className = 'status-dot off';
      toggleLabel.classList.remove('active');
      if (preview) preview.style.display = 'none';
      this.ui.showToast(i18n.t('toast.aiOff'), 'info');
    }
  }

  advanceMonth() {
    this.sim.advanceMonth();
    this._syncAdvisorMemory();
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
    // 新一轮模拟：清空智能体决策记忆（避免上一轮的经验污染本轮）
    this._memorySyncedCount = 0;
    this.advisor.clearMemory();
    this.advisor.setPrevAdjustments(null);
    const toggle = document.getElementById('aiToggle');
    if (toggle) toggle.checked = false;
    this._toggleAI(false);

    const compSection = document.getElementById('comparisonSection');
    if (compSection) compSection.style.display = 'none';
    const exportBtn = document.getElementById('btnExportComparison');
    if (exportBtn) exportBtn.disabled = true;

    this.ui.showToast(i18n.t('toast.reset'), 'info');
  }

  // 多智能体流水线时间线渲染
  _renderPipelineHTML(stageStates) {
    const stages = ['analyst', 'planner', 'risk'];
    const icons = {
      pending: '<span class="stage-icon pending">·</span>',
      running: '<span class="stage-spinner"></span>',
      done: '<span class="stage-icon done">✓</span>',
      failed: '<span class="stage-icon failed">✗</span>'
    };
    const items = stages.map(s => {
      const st = stageStates[s] || 'pending';
      return `
        <div class="pipeline-stage ${st}">
          ${icons[st]}
          <span class="stage-name">${i18n.t('ai.stage.' + s)}</span>
          <span class="stage-status">${i18n.t('ai.stage.status.' + st)}</span>
        </div>
      `;
    });
    return `<div class="pipeline">${items.join('<div class="pipeline-arrow">↓</div>')}</div>`;
  }

  async getAdvice() {
    const resultEl = document.getElementById('advisorResult');
    if (!resultEl) return;

    // 多智能体模式：渲染流水线接力时间线；其他模式：打字动画
    const usePipelineUI = this.advisor.useAPI && this.advisor.mode === 'multi';
    if (usePipelineUI) {
      const stageStates = { analyst: 'pending', planner: 'pending', risk: 'pending' };
      const renderPipeline = () => { resultEl.innerHTML = this._renderPipelineHTML(stageStates); };
      renderPipeline();
      this.advisor.onStageUpdate = (stage, status) => {
        stageStates[stage] = status;
        renderPipeline();
      };
    } else {
      resultEl.innerHTML = `
        <div class="advisor-result loading" style="display:flex;align-items:center;gap:12px">
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span>${i18n.t('ai.loading')}</span>
        </div>
      `;
    }

    // 决策前先把已模拟月份的实际效果写入智能体记忆，形成闭环
    this._syncAdvisorMemory();

    const summary = this.sim.getSimulationSummary();

    let advice;
    try {
      advice = await this.advisor.getAdvice(summary);
    } catch (err) {
      // API 失败/超时：展示错误卡片 + 重试/本地引擎按钮
      this.advisor.onStageUpdate = null;
      const info = err.advisorError || { type: 'unknown', detail: err.message || String(err) };
      resultEl.innerHTML = this._renderAgentErrorHTML(info);
      document.getElementById('btnRetryAdvice')?.addEventListener('click', () => this.getAdvice());
      document.getElementById('btnUseLocalEngine')?.addEventListener('click', () => {
        const localAdvice = this.advisor._getLocalAdvice(this.sim.getSimulationSummary());
        this._applyAdvice(localAdvice, resultEl);
      });
      return;
    }

    this.advisor.onStageUpdate = null;

    if (advice) {
      this._applyAdvice(advice, resultEl);
    } else {
      resultEl.innerHTML = `<span class="text-red">⚠️ ${i18n.t('ai.error')}</span>`;
    }
  }

  // 渲染智能体错误卡片（失败/超时）
  _renderAgentErrorHTML(info) {
    return `
      <div class="agent-error">
        <div class="agent-error-icon">⚠️</div>
        <div class="agent-error-body">
          <div class="agent-error-title">${i18n.t('ai.error.title')}</div>
          <div class="agent-error-msg">${i18n.t('ai.error.' + info.type)}</div>
          <div class="agent-error-detail">${info.detail}</div>
          <div class="agent-error-actions">
            <button class="btn btn-success" id="btnRetryAdvice">${i18n.t('ai.error.retry')}</button>
            <button class="btn btn-export" id="btnUseLocalEngine">${i18n.t('ai.error.useLocal')}</button>
          </div>
        </div>
      </div>
    `;
  }

  // 应用建议到 UI 与模拟器（AI/本地引擎共用）
  _applyAdvice(advice, resultEl) {
    this.lastAdvice = advice;
    resultEl.innerHTML = CargoAdvisor.formatAdviceHTML(advice);

    // DeepSeek 智能体与本地引擎均以结构化 adjustments 返回，无需再解析自然语言
    this.lastAdjustments = advice.structured?.adjustments || {};

    this.ui.updateAdjustmentsPreview(this.lastAdjustments);

    const toggle = document.getElementById('aiToggle');
    if (toggle && toggle.checked) {
      this.sim.setAIAdjustments(this.lastAdjustments);
      this.advisor.setPrevAdjustments(this.lastAdjustments);
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
