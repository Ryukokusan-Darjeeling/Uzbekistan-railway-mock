// ============================================
// ui/panel.js — 官员/商人面板（只读 engine 状态）
// ============================================

(function (global) {
  'use strict';

  const PanelUI = {
    renderOfficials(container, state) {
      const officials = state.officials;
      if (!officials.length) { container.innerHTML = '<div class="cku2-card"><h2>官员</h2><p style="color:var(--ink)">暂无官员</p></div>'; return; }

      const rows = officials.map((o) => {
        const cityName = (state.cities.find(c => c.id === o.city) || {}).name || o.city;
        const actionLabel = o.lastAction ? this._actionLabel(o.lastAction) : '—';
        return `
          <div class="cku2-official">
            <span class="name">${o.name}</span>
            <span class="post">${o.post} · ${o.seat}</span>
            <span style="font-size:0.78rem;color:var(--ink)">${cityName}</span>
            <span class="wealth">私囊 ${Math.round(o.wealth)} 两</span>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--ink)">任期余 ${o.tenureRemaining} 月</span>
          </div>
          <div style="font-size:0.75rem;color:var(--ink);padding:0 0 6px 24px">本月：${actionLabel}</div>
        `;
      }).join('');

      container.innerHTML = `<div class="cku2-card"><h2>地方官员</h2>${rows}</div>`;
    },

    renderMerchants(container, state) {
      const merchants = state.merchants;
      const rows = merchants.map((m) => {
        const routeName = (state.tradeLine.routes.find(r => r.id === m.route) || {}).name || '未选路';
        return `
          <div class="cku2-official">
            <span class="name">${m.name}</span>
            <span class="post">${m.origin}${m.isAI ? '（AI 代表）' : ''}</span>
            <span style="font-size:0.78rem;color:var(--ink)">${routeName}</span>
            <span class="wealth">本金 ${Math.round(m.capital)} 两</span>
          </div>
        `;
      }).join('');

      container.innerHTML = `<div class="cku2-card"><h2>商人</h2>${rows}</div>`;
    },

    renderMetrics(container, state) {
      const m = state.metrics;
      const lastTrade = m.tradeHealth.length ? m.tradeHealth[m.tradeHealth.length - 1].value.toFixed(1) : '—';
      const lastCorruption = m.corruptionIndex.length ? (m.corruptionIndex[m.corruptionIndex.length - 1].value * 100).toFixed(1) : '—';
      const lastMig = m.routeMigration.length ? m.routeMigration[m.routeMigration.length - 1] : null;

      container.innerHTML = `
        <div class="cku2-card">
          <h2>贸易线指标</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-family:var(--font-mono)">
            <div><div style="color:var(--ink);font-size:0.78rem">总贸易量</div><div style="font-size:1.2rem;color:var(--leather-deep)">${lastTrade} 担/月</div></div>
            <div><div style="color:var(--ink);font-size:0.78rem">腐败指数</div><div style="font-size:1.2rem;color:var(--rust-red)">${lastCorruption}%</div></div>
          </div>
          ${lastMig ? `<div style="margin-top:10px;font-family:var(--font-mono);font-size:0.78rem;color:var(--ink)">
            陆路主线占比 ${(lastMig.landMain * 100).toFixed(0)}% · 避税支线占比 ${(lastMig.landAlt * 100).toFixed(0)}%
          </div>` : ''}
        </div>
      `;
    },

    renderParams(container, state, onParamChange, ctx) {
      const p = state.params;
      const isRule = p.officialAIMode === 'rule';
      const apiKey = (ctx && ctx.apiKey) || '';
      container.innerHTML = `
        <div class="cku2-card cku2-params">
          <h2>观察参数</h2>
          <label>税率上限（${(p.taxRateCap * 100).toFixed(0)}%）</label>
          <input type="range" id="paramTaxCap" min="0.10" max="0.50" step="0.01" value="${p.taxRateCap}" />
          <label>官员决策模式</label>
          <select id="paramAIMode" style="width:100%;font-family:var(--font-body);padding:4px">
            <option value="ai" ${p.officialAIMode === 'ai' ? 'selected' : ''}>AI 智能体决策</option>
            <option value="rule" ${p.officialAIMode === 'rule' ? 'selected' : ''}>规则驱动（对照基线）</option>
          </select>
          <label style="margin-top:8px;cursor:${isRule ? 'not-allowed' : 'pointer'};opacity:${isRule ? 0.5 : 1}">
            <input type="checkbox" id="paramAIMerchant" ${p.aiMerchantEnabled ? 'checked' : ''} ${isRule ? 'disabled' : ''} style="vertical-align:middle" />
            AI 商人代表决策（每月额外一次 LLM 调用，较慢）
          </label>
          <label style="margin-top:12px">DeepSeek API Key（本地保存，可覆盖 config.local.js）</label>
          <input type="password" id="paramApiKey" placeholder="sk-…（留空则用 config.local.js）" value="${apiKey}"
                 autocomplete="off" spellcheck="false"
                 style="width:100%;font-family:var(--font-mono);font-size:0.75rem;padding:4px" />
        </div>
      `;
      if (typeof onParamChange === 'function') {
        container.querySelector('#paramTaxCap').addEventListener('input', (e) => {
          onParamChange('taxRateCap', parseFloat(e.target.value));
        });
        container.querySelector('#paramAIMode').addEventListener('change', (e) => {
          onParamChange('officialAIMode', e.target.value);
          // 切换模式后重渲染，让 AI 商人开关的禁用态联动
          this.renderParams(container, state, onParamChange, ctx);
        });
        const mCb = container.querySelector('#paramAIMerchant');
        if (mCb) mCb.addEventListener('change', (e) => {
          onParamChange('aiMerchantEnabled', e.target.checked);
        });
        const keyInput = container.querySelector('#paramApiKey');
        if (keyInput) keyInput.addEventListener('change', (e) => {
          onParamChange('apiKey', e.target.value.trim());
        });
      }
    },

    _actionLabel(action) {
      switch (action.type) {
        case 'tax': return `加税至 ${(action.appliedRate !== undefined ? action.appliedRate : action.rate) * 100}%`;
        case 'embezzle': return `克扣 ${Math.round(action.amount)} 两${action.exposed ? '（已暴露）' : ''}`;
        case 'bribe': return `贿赂上司 ${Math.round(action.amount)} 两`;
        case 'placeRelative': return action.success ? '打点成功，亲族接班' : '打点接班失败';
        case 'collude': return '与商人勾结分账';
        case 'idle': return '本月观望';
        default: return '—';
      }
    }
  };

  global.CKUPanelUI = PanelUI;

})(typeof window !== 'undefined' ? window : globalThis);
