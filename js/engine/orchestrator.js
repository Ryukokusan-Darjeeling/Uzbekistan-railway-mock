// ============================================
// orchestrator.js — 回合调度器（禁止 DOM）
// 回合循环：制度推进 → 经济结算 → 角色决策 → 制度裁决 → 经济更新
// 3.0 迁移：整体搬到 FastAPI 异步任务，接口不变
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;
  const Institution = global.CKUInstitution;
  const Economy = global.CKUEconomy;
  const Agents = global.CKUAgents;
  const LLM = global.CKULLM;

  const Orchestrator = {
    // 进度回调（由 UI 注入，engine 不碰 DOM）
    onTurnUpdate: null,

    _emit(phase, data) {
      if (typeof this.onTurnUpdate === 'function') {
        try { this.onTurnUpdate(phase, data); } catch (e) { /* UI 异常不阻断 */ }
      }
    },

    // ---- 单回合推进 ----
    async step(state) {
      const events = [];

      // 1. 制度引擎：推进任期、触发换官/考成
      this._emit('institution', null);
      const rotationEvents = Institution.advanceMonth(state);
      events.push(...rotationEvents);

      // 2. 经济引擎：商人选路 + 结算上月税基
      this._emit('economy', null);
      Economy.settle(state);

      // 3. 智能体层：官员观察 → 生成动作；AI 商人决策
      this._emit('agents', null);
      const officials = state.officials;
      for (const official of officials) {
        official.cityName = (state.cities.find(c => c.id === official.city) || {}).name || official.city;

        // 上报：该官员开始决策
        this._emit('agent_start', {
          role: 'official',
          name: official.name,
          post: official.post,
          city: official.cityName,
          faction: official.faction
        });

        let decision;
        try {
          decision = await Agents.decideOfficial(official, state, LLM);
        } catch (err) {
          // AI 决策失败：归一化并附带角色上下文，上抛给 UI（不自动降级）
          throw this._agentError('official', official.name, err);
        }

        // 上报：该官员决策完成
        this._emit('agent_done', {
          role: 'official',
          name: official.name,
          post: official.post,
          city: official.cityName,
          decision
        });

        // 4. 制度引擎：裁决动作合法性，应用后果
        const verdict = Institution.adjudicate(official, decision, state);

        // 应用动作后果
        this._applyAction(official, decision, verdict, state);

        // 记录事件
        events.push(this._actionEvent(official, decision, verdict, state));
      }

      // AI 商人决策（少量代表）
      for (const m of state.merchants) {
        if (m.isAI) {
          this._emit('agent_start', {
            role: 'merchant',
            name: m.name,
            post: m.origin,
            city: '',
            faction: m.origin
          });

          let md;
          try {
            md = await Agents.decideMerchant(m, state, LLM);
          } catch (err) {
            throw this._agentError('merchant', m.name, err);
          }

          this._emit('agent_done', {
            role: 'merchant',
            name: m.name,
            post: m.origin,
            city: '',
            decision: md || { action: 'hold', reason: '' }
          });

          if (md) {
            events.push({ type: 'merchant', merchantId: m.id, name: m.name, action: md.action, reason: md.reason, monthIndex: state.meta.monthIndex });
          }
        }
      }

      // 5. 经济引擎：更新贸易线参数（决策后重结算一次，反映加税影响）
      this._emit('economy_update', null);
      Economy.settle(state);

      // 6. 更新指标（回合仅此一次，避免重复计数）
      Economy.updateMetrics(state);

      // 写入事件日志
      state.eventLog.push(...events);
      this._trimEventLog(state);

      // 持久化
      S.persist(state);

      return events;
    },

    // ---- 应用动作后果 ----
    _applyAction(official, decision, verdict, state) {
      if (!verdict.legal) return;
      switch (decision.type) {
        case 'tax': {
          official.lastAction = {
            type: 'tax',
            rate: decision.rate,
            appliedRate: verdict.appliedRate,
            monthIndex: state.meta.monthIndex
          };
          // 加税带来短期税收私囊（部分克扣）
          official.wealth += (official._taxBase || 0) * decision.rate * 0.5;
          break;
        }
        case 'embezzle': {
          official.wealth += decision.amount;
          official.lastAction = {
            type: 'embezzle', amount: decision.amount,
            exposed: verdict.exposed, monthIndex: state.meta.monthIndex
          };
          if (verdict.exposed) {
            official.politicalCapital = Math.max(0, official.politicalCapital - 20);
          }
          break;
        }
        case 'bribe': {
          official.politicalCapital = Math.min(100, official.politicalCapital + decision.amount / 200);
          official.lastAction = { type: 'bribe', amount: decision.amount, monthIndex: state.meta.monthIndex };
          break;
        }
        case 'placeRelative': {
          // institution.bribeForSuccession 已在 adjudicate 内扣费
          official.lastAction = { type: 'placeRelative', success: verdict.success, amount: decision.amount, monthIndex: state.meta.monthIndex };
          break;
        }
        case 'collude': {
          // 灰色收入：按税基提成
          official.wealth += (official._taxBase || 0) * 0.1;
          official.lastAction = { type: 'collude', monthIndex: state.meta.monthIndex };
          break;
        }
        case 'idle':
        default:
          official.lastAction = { type: 'idle', monthIndex: state.meta.monthIndex };
          break;
      }
    },

    _actionEvent(official, decision, verdict, state) {
      const base = {
        type: 'official',
        officialId: official.id,
        name: official.name,
        post: official.post,
        city: official.cityName || official.city,
        action: decision.type,
        reason: decision.reason,
        source: decision.source,
        legal: verdict.legal,
        monthIndex: state.meta.monthIndex
      };
      if (decision.type === 'tax') base.detail = `税率 ${(verdict.appliedRate * 100).toFixed(0)}%${verdict.note ? '（' + verdict.note + '）' : ''}`;
      if (decision.type === 'embezzle') base.detail = `克扣 ${Math.round(decision.amount)} 两${verdict.exposed ? '（贪腐暴露）' : ''}`;
      if (decision.type === 'placeRelative') base.detail = verdict.success ? '打点成功，亲族将接班' : '打点失败';
      return base;
    },

    // ---- 事件日志裁剪（控制 localStorage 体积） ----
    _trimEventLog(state) {
      const MAX = 200;
      if (state.eventLog.length > MAX) {
        state.eventLog = state.eventLog.slice(-MAX);
      }
    },

    // ---- 归一化智能体错误并附角色上下文（供 UI 渲染错误卡片） ----
    _agentError(role, name, err) {
      const normalized = LLM.normalizeError(err);
      const e = new Error(normalized.detail);
      e.agentError = {
        type: normalized.type,
        role,
        name,
        detail: normalized.detail
      };
      return e;
    },

    // ---- 快进 N 回合 ----
    async fastForward(state, n) {
      for (let i = 0; i < n; i++) {
        await this.step(state);
      }
    },

    // ---- 重置 ----
    reset() {
      return S.makeInitialState();
    }
  };

  global.CKUOrchestrator = Orchestrator;

})(typeof window !== 'undefined' ? window : globalThis);
