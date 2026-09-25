// ============================================
// ui/app.js — 2.0 主入口控制器（UI 层，可碰 DOM）
// 职责：初始化 engine、注入存储适配器、绑定交互、驱动回合
// engine 与 UI 的唯一交界点
// ============================================

(function () {
  'use strict';

  const S = window.CKUState;
  const Institution = window.CKUInstitution;
  const Economy = window.CKUEconomy;
  const Agents = window.CKUAgents;
  const LLM = window.CKULLM;
  const Orchestrator = window.CKUOrchestrator;
  const MapUI = window.CKUMapUI;
  const PanelUI = window.CKUPanelUI;
  const LogUI = window.CKULogUI;

  let state = null;
  let busy = false;
  let errorMsg = null;
  let errorInfo = null;

  // ---- DOM 引用 ----
  const $ = (sel) => document.querySelector(sel);
  const elMap = () => $('#cku2Map');
  const elOfficials = () => $('#cku2Officials');
  const elMerchants = () => $('#cku2Merchants');
  const elMetrics = () => $('#cku2Metrics');
  const elParams = () => $('#cku2Params');
  const elLog = () => $('#cku2Log');
  const elDate = () => $('#cku2Date');
  const elStatus = () => $('#cku2Status');

  // ---- 初始化 ----
  function init() {
    // 注入存储适配器（engine 不碰 localStorage）
    S.setStorage({
      load() { try { return localStorage.getItem('cku2_state'); } catch { return null; } },
      save(str) { try { localStorage.setItem('cku2_state', str); } catch {} }
    });

    // 注入 LLM Key：优先用网页上手动输入的（localStorage 持久化），否则回退 config.local.js
    let userKey = '';
    try { userKey = localStorage.getItem('cku2_api_key') || ''; } catch {}
    LLM.setApiKey(userKey || window.DEEPSEEK_API_KEY || '');

    // 恢复或新建状态
    const saved = S.restore();
    state = saved || S.makeInitialState();

    // 进度回调：接收 orchestrator 的细粒度事件，渲染决策时间线
    Orchestrator.onTurnUpdate = (phase, data) => {
      handleTurnPhase(phase, data);
    };

    bindControls();
    renderAll();
  }

  function phaseLabel(phase) {
    const map = {
      institution: '推进任期与换官',
      economy: '结算贸易',
      agents: '官员与商人决策',
      economy_update: '更新贸易线'
    };
    return map[phase] || phase;
  }

  // ---- 决策流 UI 状态 ----
  let streamVisible = false;
  let pendingAgents = {};   // 正在决策的 agent（key -> DOM 元素 id）

  function handleTurnPhase(phase, data) {
    const stream = $('#cku2AgentStream');

    // 阶段事件：更新顶部状态条
    if (phase === 'institution' || phase === 'economy' || phase === 'economy_update') {
      elStatus().innerHTML = `<span class="cku2-gear"></span> ${phaseLabel(phase)}`;
      return;
    }

    if (phase === 'agents') {
      // 决策阶段开始：显示决策流
      if (!streamVisible) {
        streamVisible = true;
        pendingAgents = {};
        stream.innerHTML = `<div class="cku2-agent-stream-title">官员与商人会议</div>`;
        stream.style.display = 'block';
      }
      elStatus().innerHTML = `<span class="cku2-gear"></span> ${phaseLabel(phase)}`;
      return;
    }

    if (phase === 'agent_start') {
      // 某 agent 开始决策：追加「思考中」条目
      stream.style.display = 'block';
      const key = `${data.role}_${data.name}`;
      const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      pendingAgents[key] = id;
      const entry = document.createElement('div');
      entry.className = 'cku2-agent-entry thinking';
      entry.id = id;
      entry.innerHTML = `
        <span class="cku2-gear"></span>
        <span class="cku2-agent-who">${agentTitle(data)}</span>
        <span class="cku2-agent-thinking">正在斟酌利弊…</span>
      `;
      stream.appendChild(entry);
      stream.scrollTop = stream.scrollHeight;
      return;
    }

    if (phase === 'agent_done') {
      // 某 agent 决策完成：把「思考中」替换为最终决策
      const key = `${data.role}_${data.name}`;
      const id = pendingAgents[key];
      if (id) {
        const entry = document.getElementById(id);
        if (entry) {
          entry.className = 'cku2-agent-entry done';
          entry.innerHTML = `
            <span class="cku2-agent-check"></span>
            <span class="cku2-agent-who">${agentTitle(data)}</span>
            <span class="cku2-agent-result">${agentResult(data.decision)}</span>
          `;
        }
        delete pendingAgents[key];
      }
      stream.scrollTop = stream.scrollHeight;
      return;
    }
  }

  function agentTitle(data) {
    if (data.role === 'official') {
      return `<strong>${data.name}</strong><span class="cku2-agent-post">${data.post} · ${data.city}</span>`;
    }
    return `<strong>${data.name}</strong><span class="cku2-agent-post">${data.post}商人</span>`;
  }

  function agentResult(decision) {
    if (!decision) return '本月观望';
    // 官员决策字段为 type，商人为 action
    const t = decision.type || decision.action;
    switch (t) {
      case 'tax': return `加税至 ${Math.round(decision.rate * 100)}%`;
      case 'embezzle': return `克扣 ${Math.round(decision.amount)} 两${decision.exposed ? '（贪腐暴露）' : ''}`;
      case 'bribe': return `贿赂上司 ${Math.round(decision.amount)} 两`;
      case 'placeRelative': return decision.success ? '打点成功，亲族将接班' : '打点接班（未成）';
      case 'collude': return '与过境商人勾结分账';
      case 'route': return '改走更划算的路线';
      case 'bribe2': return '行贿买通关隘';
      case 'smuggle': return '走私绕卡';
      case 'hold': return '维持现状观望';
      case 'idle': return '本月观望';
      default: return decision.reason || '已决策';
    }
  }

  function bindControls() {
    $('#btnCku2Advance').addEventListener('click', () => advance(1));
    $('#btnCku2Advance6').addEventListener('click', () => advance(6));
    $('#btnCku2Reset').addEventListener('click', reset);
  }

  // ---- 回合推进 ----
  // 逐月推进：每月独立快照；某月失败只回滚当月并显示错误卡片，已完成月份保留
  // （整段快进会让 6 个月 = 48 次串行 LLM 调用期间界面纹丝不动，且任一失败全部回滚）
  async function advance(n) {
    if (busy) return;
    busy = true;
    errorMsg = null;
    errorInfo = null;
    setControlsEnabled(false, n);

    try {
      for (let i = 0; i < n; i++) {
        const snapshot = S.serialize(state);
        try {
          await Orchestrator.step(state);
          // 每月完成即刷新头部日期与指标（决策流事件由 onTurnUpdate 实时驱动）
          renderHeader();
        } catch (err) {
          // 当月失败：仅回滚本月，保留此前已完成月份
          state = S.deserialize(snapshot);
          errorMsg = err.message;
          errorInfo = err.agentError || null;
          renderAll();
          renderError();
          break;
        }
      }
      if (!errorMsg) renderAll();
    } finally {
      busy = false;
      // 注意：不能无条件清空状态条——错误卡片就渲染在里面，会被立即抹掉（静默失败 bug）
      if (!errorMsg) elStatus().innerHTML = '';
      setControlsEnabled(true);
      // 隐藏决策流，保留最终事件日志供查阅
      const stream = $('#cku2AgentStream');
      if (stream) {
        stream.style.display = 'none';
        streamVisible = false;
        pendingAgents = {};
      }
    }
  }

  // ---- 推进期间禁用按钮（给出"进行中"反馈，避免连点被 busy 静默吞掉） ----
  function setControlsEnabled(enabled, n) {
    const btn1 = $('#btnCku2Advance');
    const btn6 = $('#btnCku2Advance6');
    if (!btn1 || !btn6) return;
    [btn1, btn6].forEach(b => { b.disabled = !enabled; });
    if (!enabled) {
      btn1.textContent = '推进中…';
      btn6.textContent = n >= 6 ? '快进中…' : '推进中…';
    } else {
      btn1.textContent = '推进下月';
      btn6.textContent = '快进六月';
    }
  }

  function reset() {
    if (busy) return;
    state = S.makeInitialState();
    S.persist(state);
    errorMsg = null;
    renderAll();
  }

  // ---- 渲染 ----
  function renderAll() {
    renderHeader();
    MapUI.render(elMap(), state);
    PanelUI.renderOfficials(elOfficials(), state);
    PanelUI.renderMerchants(elMerchants(), state);
    PanelUI.renderMetrics(elMetrics(), state);
    PanelUI.renderParams(elParams(), state, onParamChange, { apiKey: LLM.apiKey });
    LogUI.render(elLog(), state);
    if (errorMsg) renderError();
  }

  function renderHeader() {
    const y = state.meta.year;
    const m = state.meta.month;
    elDate().textContent = `${state.meta.reignName} ${y} 年 ${m} 月 · 第 ${state.meta.monthIndex} 月`;
  }

  function renderError() {
    // 错误卡片：显式暴露 API 失败，不自动降级；仅提供重试 + 手动切换规则模式
    const host = elStatus();
    const typeLabel = errorInfo ? typeName(errorInfo.type) : '错误';
    const roleLabel = errorInfo ? roleName(errorInfo.role, errorInfo.name) : '';
    host.innerHTML = `
      <div class="cku2-error">
        <div><strong>回合推进失败</strong>（${typeLabel}）${roleLabel}</div>
        <div style="margin-top:4px">${errorMsg || '未知错误'}</div>
        ${errorInfo && errorInfo.type === 'http' && /401|Authentication/.test(errorMsg || '') ? '<div style="margin-top:4px;color:var(--rust-red)">Key 无效或已过期——可在左下「观察参数」卡片中手动输入新的 DeepSeek API Key。</div>' : ''}
        <div style="margin-top:8px">
          <button id="btnCku2Retry">重试</button>
          <button id="btnCku2Rule">手动切换规则模式（对照）</button>
        </div>
      </div>
    `;
    document.querySelector('#btnCku2Retry').addEventListener('click', () => advance(1));
    document.querySelector('#btnCku2Rule').addEventListener('click', () => {
      // 用户主动选择规则模式（非自动降级）
      state.params.officialAIMode = 'rule';
      errorMsg = null;
      errorInfo = null;
      renderAll();
      advance(1);
    });
  }

  function typeName(type) {
    return { timeout: '请求超时', http: 'HTTP 错误', parse: '响应解析失败', unknown: '未知错误' }[type] || type;
  }
  function roleName(role, name) {
    if (!role) return '';
    return role === 'official' ? ` · 官员【${name}】决策失败` : ` · 商人【${name}】决策失败`;
  }

  function onParamChange(key, value) {
    if (key === 'apiKey') {
      // 网页手动输入的 Key：立即生效并本地保存；清空则回退 config.local.js
      LLM.setApiKey(value);
      try {
        if (value) localStorage.setItem('cku2_api_key', value);
        else localStorage.removeItem('cku2_api_key');
      } catch {}
      return;
    }
    state.params[key] = value;
    S.persist(state);
  }

  // ---- 启动 ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
