// ============================================
// ui/log.js — 事件日志视图（只读 engine 状态）
// ============================================

(function (global) {
  'use strict';

  const LogUI = {
    render(container, state) {
      const events = state.eventLog;
      if (!events.length) {
        container.innerHTML = '<div class="cku2-card"><h2>事件日志</h2><p style="color:var(--ink)">尚无事件，推进回合以观察博弈。</p></div>';
        return;
      }
      // 最近事件倒序
      const recent = [...events].reverse().slice(0, 60);
      const lines = recent.map((ev) => this._format(ev, state)).join('');
      container.innerHTML = `<div class="cku2-card"><h2>事件日志</h2><div class="cku2-log">${lines}</div></div>`;
    },

    _format(ev, state) {
      const month = ev.monthIndex != null ? `第${ev.monthIndex}月` : '';
      if (ev.type === 'rotation') {
        return `<div class="entry rotation"><span class="month">${month}</span> <strong>换官</strong>：${ev.oldName}（${ev.post}）离任带走 ${ev.tookWealth} 两 → ${ev.newName} 接任（${ev.seat}）</div>`;
      }
      if (ev.type === 'official') {
        const cls = ev.action === 'embezzle' && ev.detail && ev.detail.includes('暴露') ? 'expose' : '';
        const detail = ev.detail ? `（${ev.detail}）` : '';
        const srcMark = ev.source === 'ai' ? '[AI]' : '[规则]';
        return `<div class="entry ${cls}"><span class="month">${month}</span> <strong>${ev.name}</strong>（${ev.post}）${srcMark}：${ev.reason}${detail}</div>`;
      }
      if (ev.type === 'merchant') {
        return `<div class="entry"><span class="month">${month}</span> 商人 <strong>${ev.name}</strong>：${ev.reason}</div>`;
      }
      // Phase 1.5 新事件：分账 / 契约 / 破产 / 进场
      if (ev.type === 'collude_split') {
        return `<div class="entry collude"><span class="month">${month}</span> <strong>分账</strong>：${ev.merchantName} × ${ev.city}${ev.officialName}：避税 ${ev.evaded} 两，官得 ${ev.officialGet} 两（${Math.round(ev.share * 100)}%），商留 ${ev.merchantGet} 两</div>`;
      }
      if (ev.type === 'contract_made') {
        return `<div class="entry collude"><span class="month">${month}</span> <strong>结契</strong>：${ev.detail}</div>`;
      }
      if (ev.type === 'contract_broken') {
        return `<div class="entry rotation"><span class="month">${month}</span> <strong>废契</strong>：${ev.note}，${ev.merchantName} 须重新打点</div>`;
      }
      if (ev.type === 'bankruptcy') {
        return `<div class="entry expose"><span class="month">${month}</span> <strong>歇业</strong>：${ev.note}</div>`;
      }
      if (ev.type === 'merchant_enter') {
        return `<div class="entry"><span class="month">${month}</span> <strong>入行</strong>：${ev.note}</div>`;
      }
      return `<div class="entry"><span class="month">${month}</span> ${JSON.stringify(ev)}</div>`;
    }
  };

  global.CKULogUI = LogUI;

})(typeof window !== 'undefined' ? window : globalThis);
