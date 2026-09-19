// ============================================
// AI 调度智能体 — advisor.js
// DeepSeek API · 双模式：
//   single — 单智能体（JSON 结构化决策 + 决策记忆闭环）
//   multi  — 多智能体流水线（市场分析员 → 调度规划官 → 风险审查官）
// 代码护栏（钳制/限幅）与决策记忆为两种模式共用
// 本地规则引擎作为最终降级与对照基线
// ============================================

class CargoAdvisor {
  constructor() {
    // 优先读取本地配置文件（js/config.local.js）中的 Key，无需在页面手动输入
    this.apiKey = (window.DEEPSEEK_API_KEY || '').trim();
    this.useAPI = this.apiKey.length > 0;
    this.isLoading = false;

    // DeepSeek API 配置（OpenAI 兼容格式）
    this.apiEndpoint = 'https://api.deepseek.com/chat/completions';
    this.model = 'deepseek-flash';
    this.STAGE_TIMEOUT_MS = 60000; // 单棒超时（用户确认放宽到 60s）
    this.STAGE_RETRIES = 1;        // 每棒失败后重试次数

    // 智能体模式：'single' | 'multi'
    this.mode = 'multi';

    // 护栏参数
    this.MULT_MIN = 0.75;          // 运量乘数下限
    this.MULT_MAX = 1.30;          // 运量乘数上限
    this.MAX_MONTHLY_STEP = 0.10;  // 单月乘数相对上次决策的最大变化幅度

    // 智能体决策记忆（跨会话持久化，用于闭环反馈）
    this.decisionHistory = this._loadMemory();

    // 上一次实际应用到模拟器的乘数（用于单月限幅计算）
    this._prevAdjustments = null;

    // 流水线进度回调（由 app.js 设置，用于 UI 接力时间线）
    this.onStageUpdate = null;

    // 流水线统计（会话级）：风险审查官干预次数
    this.pipelineStats = { riskModified: 0, riskRejected: 0 };
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    this.useAPI = this.apiKey.length > 0;
  }

  setMode(mode) {
    this.mode = mode === 'multi' ? 'multi' : 'single';
  }

  // 记录当前已应用到模拟器的乘数（由 app.js 在采纳建议时调用）
  setPrevAdjustments(adjustments) {
    this._prevAdjustments = adjustments ? { ...adjustments } : null;
  }

  async getAdvice(simulationSummary) {
    if (this.isLoading) return null;
    this.isLoading = true;

    try {
      if (this.useAPI) {
        try {
          return this.mode === 'multi'
            ? await this._getMultiAgentAdvice(simulationSummary)
            : await this._getSingleAgentAdvice(simulationSummary);
        } catch (apiError) {
          // 不再静默降级：归一化错误后抛出，由 UI 层展示错误卡片与重试入口
          console.error('Advisor API error:', apiError);
          const normalized = this._normalizeError(apiError);
          const err = new Error(normalized.detail);
          err.advisorError = normalized;
          throw err;
        }
      }
      return this._getLocalAdvice(simulationSummary);
    } finally {
      this.isLoading = false;
    }
  }

  // 错误归一化：timeout / http / parse / unknown
  _normalizeError(error) {
    const msg = (error && error.message) ? error.message : String(error);
    if (/timeout/i.test(msg)) return { type: 'timeout', detail: msg };
    if (/API Error/i.test(msg)) return { type: 'http', detail: msg };
    if (/Invalid JSON|empty content|No valid adjustments/i.test(msg)) return { type: 'parse', detail: msg };
    return { type: 'unknown', detail: msg };
  }

  // ============================================
  // 公共：DeepSeek 调用（30s 超时 · JSON 模式）
  // ============================================

  async _callDeepSeek(systemPrompt, userPrompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.STAGE_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 1500,
          stream: false
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('DeepSeek request timeout (60s)');
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`DeepSeek API Error: ${response.status} - ${errData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new Error('DeepSeek returned empty content');
    }
    return content;
  }

  _parseJsonStrict(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid JSON from DeepSeek: ' + e.message);
    }
  }

  // ============================================
  // 多智能体流水线：分析员 → 规划官 → 审查官
  // ============================================

  _emitStage(stage, status, data) {
    if (typeof this.onStageUpdate === 'function') {
      try { this.onStageUpdate(stage, status, data); } catch { /* UI 回调异常不阻断流水线 */ }
    }
  }

  // 单棒执行器：独立重试，进度上报
  async _runStage(stage, systemPrompt, userPrompt, parseFn) {
    this._emitStage(stage, 'running');
    let lastError = null;
    for (let attempt = 0; attempt <= this.STAGE_RETRIES; attempt++) {
      try {
        const raw = await this._callDeepSeek(systemPrompt, userPrompt);
        const result = parseFn(raw);
        this._emitStage(stage, 'done', result);
        return result;
      } catch (err) {
        console.warn(`[multi-agent] stage "${stage}" attempt ${attempt + 1} failed:`, err.message);
        lastError = err;
      }
    }
    this._emitStage(stage, 'failed', { error: lastError.message });
    throw lastError;
  }

  async _getMultiAgentAdvice(summary) {
    // ① 市场分析员（失败可降级：规划官改用原始数据）
    let brief = null;
    try {
      brief = await this._runStage(
        'analyst',
        i18n.t('advisor.prompt.analyst'),
        this._buildAnalystPrompt(summary),
        (raw) => this._parseAnalystBrief(raw)
      );
    } catch { brief = null; }

    // ② 调度规划官（核心棒，失败则整体降级本地引擎）
    const draft = await this._runStage(
      'planner',
      i18n.t('advisor.prompt.planner'),
      this._buildPlannerPrompt(summary, brief),
      (raw) => this._parsePlannerDraft(raw)
    );

    // ③ 风险审查官（失败可降级：直接采纳规划草案）
    let risk = null;
    try {
      risk = await this._runStage(
        'risk',
        i18n.t('advisor.prompt.risk'),
        this._buildRiskPrompt(draft),
        (raw) => this._parseRiskVerdict(raw)
      );
    } catch { risk = null; }

    return this._composeMultiAdvice(summary, brief, draft, risk);
  }

  // ---- 各棒 prompt ----

  _buildAnalystPrompt(summary) {
    const isZH = i18n.lang === 'zh';
    let cargoInfo = '';
    summary.cargoPerformance.forEach((c, i) => {
      cargoInfo += isZH
        ? `${i + 1}. ${c.name} (id=${c.id}): 收益 $${formatNumber(c.revenue)}, 运量 ${formatNumber(c.volume)}吨, 环比趋势 ${c.trend}\n`
        : `${i + 1}. ${c.nameEn} (id=${c.id}): Revenue $${formatNumber(c.revenue)}, Volume ${formatNumber(c.volume)} tons, MoM Trend ${c.trend}\n`;
    });

    return isZH ? `
当前模拟日期：${summary.currentDate}，已模拟 ${summary.monthsSimulated} 个月
本月总收益：$${formatNumber(summary.monthRevenue)}（环比 ${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%）

本月各货物表现（按收益排序）：
${cargoInfo}
请分析市场形势，并严格输出 json：
{"trend":"简短趋势判断","description":"2-3句市场分析","opportunities":[{"id":"货物id","note":"机会说明"}],"risks":[{"id":"货物id","note":"风险说明"}],"seasonOutlook":"下月（${summary.nextMonth}）季节展望"}
` : `
Simulation date: ${MONTH_NAMES_EN[summary.currentMonth]} ${summary.currentYear}, ${summary.monthsSimulated} months simulated
Monthly revenue: $${formatNumber(summary.monthRevenue)} (MoM ${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%)

Cargo performance this month (sorted by revenue):
${cargoInfo}
Analyze the market and strictly output json:
{"trend":"brief trend","description":"2-3 sentences of analysis","opportunities":[{"id":"cargo id","note":"opportunity"}],"risks":[{"id":"cargo id","note":"risk"}],"seasonOutlook":"outlook for next month (${MONTH_NAMES_EN[summary.nextMonthIndex]})"}
`;
  }

  _buildPlannerPrompt(summary, brief) {
    const isZH = i18n.lang === 'zh';
    const memorySection = this._buildMemorySection(isZH);

    let contextBlock;
    if (brief) {
      contextBlock = isZH
        ? `市场分析员简报（json）：\n${JSON.stringify(brief, null, 2)}\n`
        : `Market analyst brief (json):\n${JSON.stringify(brief, null, 2)}\n`;
    } else {
      // 分析员降级：直接提供原始数据
      let cargoInfo = '';
      summary.cargoPerformance.forEach((c) => {
        cargoInfo += isZH
          ? `- ${c.name} (id=${c.id}): 收益 $${formatNumber(c.revenue)}, 环比 ${c.trend}\n`
          : `- ${c.nameEn} (id=${c.id}): Revenue $${formatNumber(c.revenue)}, MoM ${c.trend}\n`;
      });
      contextBlock = isZH
        ? `（市场分析员暂不可用，以下为原始数据）\n本月总收益 $${formatNumber(summary.monthRevenue)}（环比 ${summary.delta.percentage.toFixed(1)}%）：\n${cargoInfo}`
        : `(Market analyst unavailable, raw data below)\nMonthly revenue $${formatNumber(summary.monthRevenue)} (MoM ${summary.delta.percentage.toFixed(1)}%):\n${cargoInfo}`;
    }

    return isZH ? `
${contextBlock}
${memorySection}
请为下个月（${summary.nextMonth}）制定运量调整方案，严格输出 json：
{"increase":[{"id":"货物id","reason":"理由"},{"id":"货物id","reason":"理由"}],"decrease":[{"id":"货物id","reason":"理由"}],"strategy":["要点1","要点2","要点3","要点4"],"adjustments":{"货物id":乘数}}
要求：increase 恰好 2 项、decrease 恰好 1 项；adjustments 至少 2 种货物，乘数 0.75~1.30（建议增运 1.05~1.20、减运 0.85~0.95）；仅可使用简报或数据中出现的货物 id；使用中文。
` : `
${contextBlock}
${memorySection}
Make a dispatch plan for next month (${MONTH_NAMES_EN[summary.nextMonthIndex]}), strictly output json:
{"increase":[{"id":"cargo id","reason":"reason"},{"id":"cargo id","reason":"reason"}],"decrease":[{"id":"cargo id","reason":"reason"}],"strategy":["point 1","point 2","point 3","point 4"],"adjustments":{"cargo id":multiplier}}
Requirements: exactly 2 items in increase, exactly 1 in decrease; adjustments cover at least 2 cargo types, multipliers 0.75~1.30 (suggest 1.05~1.20 for increase, 0.85~0.95 for decrease); use only cargo ids from the brief or data; reply in English.
`;
  }

  _buildRiskPrompt(draft) {
    const isZH = i18n.lang === 'zh';
    const memorySection = this._buildMemorySection(isZH);
    const prevStr = JSON.stringify(this._prevAdjustments || {});

    return isZH ? `
调度规划官的方案草案（json）：
${JSON.stringify(draft, null, 2)}

上月实际生效的乘数：${prevStr}
${memorySection}
请审查该方案的稳健性：单月调整是否过激（相对上月乘数变化不宜超过 ±0.10）、是否与历史失败决策雷同、增减搭配是否合理。严格输出 json：
{"verdict":"approve 或 modify 或 reject","comment":"一句话审查意见","adjustments":{"货物id":乘数}}
规则：approve 时原样返回草案乘数；modify 时给出修正乘数（0.75~1.30）；reject 时给出接近 1.0 的保守替代乘数。使用中文。
` : `
Dispatch planner's draft (json):
${JSON.stringify(draft, null, 2)}

Multipliers in effect last month: ${prevStr}
${memorySection}
Review this plan for robustness: is any single-month change excessive (should not exceed ±0.10 vs last month), does it repeat historically failed decisions, is the increase/decrease mix reasonable. Strictly output json:
{"verdict":"approve or modify or reject","comment":"one-sentence review","adjustments":{"cargo id":multiplier}}
Rules: for approve, return the draft multipliers unchanged; for modify, provide corrected multipliers (0.75~1.30); for reject, provide conservative substitutes close to 1.0. Reply in English.
`;
  }

  // ---- 各棒输出解析（契约校验，不信任模型自觉） ----

  _parseAnalystBrief(raw) {
    const parsed = this._parseJsonStrict(raw);
    if (typeof parsed.trend !== 'string' || !parsed.trend.trim()) {
      throw new Error('Analyst brief missing "trend"');
    }
    const validIds = new Set(CARGO_TYPES.map(c => c.id));
    const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
      .filter(it => it && validIds.has(it.id) && typeof it.note === 'string')
      .slice(0, 3);

    return {
      trend: parsed.trend,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      opportunities: cleanList(parsed.opportunities),
      risks: cleanList(parsed.risks),
      seasonOutlook: typeof parsed.seasonOutlook === 'string' ? parsed.seasonOutlook : ''
    };
  }

  _parsePlannerDraft(raw) {
    const parsed = this._parseJsonStrict(raw);
    const validIds = new Set(CARGO_TYPES.map(c => c.id));

    const adjustments = {};
    Object.entries(parsed.adjustments || {}).forEach(([id, v]) => {
      const num = parseFloat(v);
      if (validIds.has(id) && isFinite(num)) adjustments[id] = num;
    });
    if (Object.keys(adjustments).length === 0) {
      throw new Error('Planner draft has no valid adjustments');
    }

    return {
      increase: (Array.isArray(parsed.increase) ? parsed.increase : [])
        .filter(it => it && validIds.has(it.id)).slice(0, 2),
      decrease: (Array.isArray(parsed.decrease) ? parsed.decrease : [])
        .filter(it => it && validIds.has(it.id)).slice(0, 1),
      strategy: (Array.isArray(parsed.strategy) ? parsed.strategy : [])
        .filter(p => typeof p === 'string' && p.trim()).slice(0, 5),
      adjustments
    };
  }

  _parseRiskVerdict(raw) {
    const parsed = this._parseJsonStrict(raw);
    const verdict = ['approve', 'modify', 'reject'].includes(parsed.verdict)
      ? parsed.verdict : 'approve';
    const validIds = new Set(CARGO_TYPES.map(c => c.id));

    const adjustments = {};
    Object.entries(parsed.adjustments || {}).forEach(([id, v]) => {
      const num = parseFloat(v);
      if (validIds.has(id) && isFinite(num)) adjustments[id] = num;
    });
    if (Object.keys(adjustments).length === 0) {
      throw new Error('Risk verdict has no valid adjustments');
    }

    return {
      verdict,
      comment: typeof parsed.comment === 'string' ? parsed.comment : '',
      adjustments
    };
  }

  // ---- 汇总三棒结果为最终建议 ----

  _composeMultiAdvice(summary, brief, draft, risk) {
    const isZH = i18n.lang === 'zh';
    const delta = summary.delta;

    // 最终乘数：审查官裁决 > 规划草案，再经代码护栏强制约束
    const rawFinal = risk ? risk.adjustments : draft.adjustments;
    const adjustments = this._sanitizeAdjustments(rawFinal);
    if (Object.keys(adjustments).length === 0) {
      throw new Error('Pipeline produced no valid adjustments after guardrails');
    }

    // 统计审查官干预
    const riskVerdict = risk ? risk.verdict : 'skipped';
    if (riskVerdict === 'modify') this.pipelineStats.riskModified++;
    if (riskVerdict === 'reject') this.pipelineStats.riskRejected++;

    // 市场趋势（来自分析员，降级时给通用文案）
    const marketTrend = {
      emoji: '📊',
      trend: brief ? brief.trend : (isZH ? '数据直判' : 'Direct data read'),
      deltaStr: `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`,
      description: brief ? brief.description : (isZH ? '（市场分析员暂不可用，本方案基于原始数据直接规划）' : '(Analyst unavailable; plan based on raw data)')
    };

    // 增减产建议条目
    const mapItem = (item) => {
      const cargo = CARGO_TYPES.find(c => c.id === item.id);
      return {
        id: item.id,
        name: `${cargo.emoji} ${i18n.cargoName(item.id)}`,
        reason: item.reason || ''
      };
    };
    const recommendations = [];
    const incItems = draft.increase.map(mapItem);
    const decItems = draft.decrease.map(mapItem);
    if (incItems.length) recommendations.push({ type: 'increase', title: i18n.t('advisor.rec.increase'), items: incItems });
    if (decItems.length) recommendations.push({ type: 'decrease', title: i18n.t('advisor.rec.decrease'), items: decItems });

    // 策略要点 = 规划官策略 + 审查官意见
    const points = [...draft.strategy];
    if (risk && risk.comment) {
      points.push(`${i18n.t('ai.risk.commentPrefix')}${risk.comment}`);
    }

    return {
      source: isZH ? 'AI 多智能体 (DeepSeek)' : 'AI multi-agent (DeepSeek)',
      content: null,
      raw: false,
      isLocal: false,
      memoryCount: this.decisionHistory.length,
      pipeline: {
        mode: 'multi',
        analystOk: !!brief,
        riskVerdict,
        riskComment: risk ? risk.comment : ''
      },
      structured: {
        marketTrend,
        recommendations,
        strategy: { title: i18n.t('advisor.strategy.title'), points },
        adjustments
      }
    };
  }

  // ============================================
  // 单智能体模式（保留：一次调用出完整决策）
  // ============================================

  async _getSingleAgentAdvice(summary) {
    const systemPrompt = i18n.t('advisor.prompt.system');
    const userPrompt = this._buildPrompt(summary);

    let lastError = null;
    for (let attempt = 0; attempt <= this.STAGE_RETRIES; attempt++) {
      try {
        const rawJson = await this._callDeepSeek(systemPrompt, userPrompt);
        return this._parseAgentResponse(rawJson, summary);
      } catch (err) {
        console.warn(`DeepSeek attempt ${attempt + 1} failed:`, err.message);
        lastError = err;
      }
    }
    throw lastError;
  }

  // 解析单智能体的 JSON 决策，执行护栏校验后转为内部结构化建议
  _parseAgentResponse(rawJson, summary) {
    const parsed = this._parseJsonStrict(rawJson);

    // 护栏：清洗与钳制调整乘数
    const adjustments = this._sanitizeAdjustments(parsed.adjustments || {});
    if (Object.keys(adjustments).length === 0) {
      throw new Error('No valid adjustments in DeepSeek response');
    }

    const delta = summary.delta;
    const isZH = i18n.lang === 'zh';

    // 市场趋势
    const mt = parsed.marketTrend || {};
    const marketTrend = {
      emoji: mt.emoji || '🤖',
      trend: mt.trend || (isZH ? '智能体分析' : 'Agent analysis'),
      deltaStr: `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`,
      description: mt.description || ''
    };

    // 增/减建议（仅接受合法货物 id）
    const validIds = new Set(CARGO_TYPES.map(c => c.id));
    const mapItem = (item) => {
      if (!item || !validIds.has(item.id)) return null;
      const cargo = CARGO_TYPES.find(c => c.id === item.id);
      return {
        id: item.id,
        name: `${cargo.emoji} ${i18n.cargoName(item.id)}`,
        reason: item.reason || ''
      };
    };

    const increaseItems = (Array.isArray(parsed.increase) ? parsed.increase : [])
      .map(mapItem).filter(Boolean).slice(0, 2);
    const decreaseItems = (Array.isArray(parsed.decrease) ? parsed.decrease : [])
      .map(mapItem).filter(Boolean).slice(0, 1);

    const recommendations = [];
    if (increaseItems.length > 0) {
      recommendations.push({ type: 'increase', title: i18n.t('advisor.rec.increase'), items: increaseItems });
    }
    if (decreaseItems.length > 0) {
      recommendations.push({ type: 'decrease', title: i18n.t('advisor.rec.decrease'), items: decreaseItems });
    }

    // 策略要点
    const strategyPoints = (Array.isArray(parsed.strategy) ? parsed.strategy : [])
      .filter(p => typeof p === 'string' && p.trim()).slice(0, 5);

    return {
      source: isZH ? 'AI 单智能体 (DeepSeek)' : 'AI single-agent (DeepSeek)',
      content: null,
      raw: false,
      isLocal: false,
      memoryCount: this.decisionHistory.length,
      pipeline: { mode: 'single' },
      structured: {
        marketTrend,
        recommendations,
        strategy: {
          title: i18n.t('advisor.strategy.title'),
          points: strategyPoints
        },
        adjustments
      }
    };
  }

  // ============================================
  // 护栏层：钳制 + 单月限幅（代码强制，不信任 LLM）
  // ============================================

  _sanitizeAdjustments(rawAdjustments) {
    const sanitized = {};
    const prev = this._prevAdjustments || {};

    CARGO_TYPES.forEach(cargo => {
      if (!(cargo.id in rawAdjustments)) return;
      let value = parseFloat(rawAdjustments[cargo.id]);
      if (!isFinite(value)) return;

      // 绝对钳制 [0.75, 1.30]
      value = Math.max(this.MULT_MIN, Math.min(this.MULT_MAX, value));

      // 单月限幅：相对上次决策最多变化 ±0.10
      const prevValue = prev[cargo.id] || 1.0;
      value = Math.max(prevValue - this.MAX_MONTHLY_STEP,
               Math.min(prevValue + this.MAX_MONTHLY_STEP, value));

      value = Math.round(value * 100) / 100;
      if (value !== 1.0) {
        sanitized[cargo.id] = value;
      }
    });

    return sanitized;
  }

  // ============================================
  // 决策记忆（闭环反馈，两种模式共用）
  // ============================================

  _loadMemory() {
    try {
      const raw = localStorage.getItem('cku_advisor_memory');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  _saveMemory() {
    try {
      localStorage.setItem('cku_advisor_memory', JSON.stringify(this.decisionHistory.slice(-12)));
    } catch { /* 存储不可用时静默降级为内存态 */ }
  }

  // 由 app.js 在每个月模拟完成后调用：entry = { month, adjustments, outcomePct }
  learnFromOutcome(entry) {
    if (!entry || !entry.adjustments) return;
    this.decisionHistory.push(entry);
    if (this.decisionHistory.length > 12) this.decisionHistory.shift();
    this._saveMemory();
  }

  clearMemory() {
    this.decisionHistory = [];
    this._saveMemory();
  }

  _buildMemorySection(isZH) {
    if (this.decisionHistory.length === 0) return '';

    const lines = this.decisionHistory.slice(-6).map(entry => {
      const adjStr = Object.entries(entry.adjustments)
        .map(([id, m]) => {
          const cargo = CARGO_TYPES.find(c => c.id === id);
          const name = cargo ? (isZH ? cargo.name : cargo.nameEn) : id;
          return `${name} ${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
        })
        .join(', ');
      const outcome = `${entry.outcomePct > 0 ? '+' : ''}${entry.outcomePct}%`;
      return isZH
        ? `- ${entry.month}: 调整 [${adjStr}] → 实际收益较基线 ${outcome}`
        : `- ${entry.month}: adjusted [${adjStr}] → actual revenue vs baseline ${outcome}`;
    });

    return isZH
      ? `\n历史决策及其实际效果（请从中学习，避免重复无效决策）：\n${lines.join('\n')}\n`
      : `\nPast decisions and their actual outcomes (learn from them, avoid repeating ineffective moves):\n${lines.join('\n')}\n`;
  }

  // ---- 单智能体 prompt（含 JSON 输出契约与决策记忆） ----

  _buildPrompt(summary) {
    let cargoInfo = '';
    const isZH = i18n.lang === 'zh';
    const memorySection = this._buildMemorySection(isZH);

    if (isZH) {
      summary.cargoPerformance.forEach((c, i) => {
        cargoInfo += `${i + 1}. ${c.name} (id=${c.id}): 收益 $${formatNumber(c.revenue)}, 运量 ${formatNumber(c.volume)}吨, 环比趋势 ${c.trend}\n`;
      });

      return `
当前模拟日期：${summary.currentDate}
累计总收益：$${formatNumber(summary.totalRevenue)}
本月总收益：$${formatNumber(summary.monthRevenue)}
环比变化：${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%
已模拟月数：${summary.monthsSimulated}

本月各货物表现（按收益排序）：
${cargoInfo}
${memorySection}
请为下个月（${summary.nextMonth}）做出货物调度决策，并严格输出 json，格式为：
{
  "marketTrend": {"trend": "简短趋势判断", "description": "2-3句下月市场分析"},
  "increase": [{"id": "货物id", "reason": "增运理由"}, {"id": "货物id", "reason": "增运理由"}],
  "decrease": [{"id": "货物id", "reason": "减运理由"}],
  "strategy": ["策略要点1", "策略要点2", "策略要点3", "策略要点4"],
  "adjustments": {"货物id": 运量乘数}
}
要求：increase 恰好 2 项、decrease 恰好 1 项；adjustments 至少包含 2 种货物，乘数取值 0.75~1.30（1.0 表示不变，建议增运 1.05~1.20、减运 0.85~0.95）；货物 id 仅可使用上面列出的 id；全部内容使用中文。
`;
    } else {
      summary.cargoPerformance.forEach((c, i) => {
        cargoInfo += `${i + 1}. ${c.nameEn} (id=${c.id}): Revenue $${formatNumber(c.revenue)}, Volume ${formatNumber(c.volume)} tons, MoM Trend ${c.trend}\n`;
      });

      const nextMonthName = MONTH_NAMES_EN[summary.nextMonthIndex];

      return `
Current Simulation Date: ${MONTH_NAMES_EN[summary.currentMonth]} ${summary.currentYear}
Cumulative Total Revenue: $${formatNumber(summary.totalRevenue)}
Monthly Revenue: $${formatNumber(summary.monthRevenue)}
Month-over-Month Change: ${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%
Months Simulated: ${summary.monthsSimulated}

This month's cargo performance (sorted by revenue):
${cargoInfo}
${memorySection}
Make cargo dispatch decisions for next month (${nextMonthName}) and strictly output json in this format:
{
  "marketTrend": {"trend": "brief trend judgment", "description": "2-3 sentences of market analysis"},
  "increase": [{"id": "cargo id", "reason": "reason"}, {"id": "cargo id", "reason": "reason"}],
  "decrease": [{"id": "cargo id", "reason": "reason"}],
  "strategy": ["point 1", "point 2", "point 3", "point 4"],
  "adjustments": {"cargo id": volume multiplier}
}
Requirements: exactly 2 items in increase, exactly 1 in decrease; adjustments must cover at least 2 cargo types with multipliers between 0.75 and 1.30 (1.0 = unchanged, suggest 1.05~1.20 for increase, 0.85~0.95 for decrease); use only the cargo ids listed above; reply entirely in English.
`;
    }
  }

  // ============================================
  // 本地规则引擎（最终降级与对照基线）
  // ============================================

  _getLocalAdvice(summary) {
    const { cargoPerformance, nextMonthIndex, delta, monthsSimulated } = summary;

    // Analyze which cargo is performing best/worst
    const sorted = [...cargoPerformance];
    const bestPerformers = sorted.slice(0, 2);
    const worstPerformer = sorted[sorted.length - 1];

    // Check seasonal factors for next month
    const seasonalInsights = [];
    CARGO_TYPES.forEach(cargo => {
      const nextFactor = cargo.seasonFactor[nextMonthIndex];
      const currentFactor = cargo.seasonFactor[(nextMonthIndex + 11) % 12];
      const change = ((nextFactor - currentFactor) / currentFactor * 100).toFixed(1);

      seasonalInsights.push({
        id: cargo.id,
        name: i18n.cargoName(cargo.id),
        emoji: cargo.emoji,
        factor: nextFactor,
        change: parseFloat(change),
        growthRate: cargo.growthRate
      });
    });

    seasonalInsights.sort((a, b) => b.change - a.change);
    const topSeasonal = seasonalInsights.filter(s => s.change > 0).slice(0, 2);
    const weakSeasonal = seasonalInsights.filter(s => s.change < 0).slice(-1);

    // Build advice
    const recommendations = [];
    const localizedNextMonth = i18n.lang === 'zh' ? MONTH_NAMES[nextMonthIndex] : MONTH_NAMES_EN[nextMonthIndex];

    // Recommendation 1: Increase
    recommendations.push({
      type: 'increase',
      title: i18n.t('advisor.rec.increase'),
      items: topSeasonal.length > 0 ? topSeasonal.map(s => ({
        id: s.id,
        name: `${s.emoji} ${s.name}`,
        reason: i18n.t('advisor.rec.increaseReason', localizedNextMonth, s.change),
        factor: s.factor
      })) : bestPerformers.map(bp => ({
        id: bp.id,
        name: `${bp.emoji || ''} ${i18n.cargoName(bp.id)}`,
        reason: i18n.t('advisor.rec.maintainReason', bp.trend),
        factor: 1.0
      }))
    });

    // Recommendation 2: Decrease
    if (weakSeasonal.length > 0) {
      recommendations.push({
        type: 'decrease',
        title: i18n.t('advisor.rec.decrease'),
        items: weakSeasonal.map(s => ({
          id: s.id,
          name: `${s.emoji} ${s.name}`,
          reason: i18n.t('advisor.rec.decreaseSeasonReason', s.change)
        }))
      });
    } else {
      recommendations.push({
        type: 'decrease',
        title: i18n.t('advisor.rec.decrease'),
        items: [{
          id: worstPerformer.id,
          name: `${worstPerformer.emoji || ''} ${i18n.cargoName(worstPerformer.id)}`,
          reason: i18n.t('advisor.rec.decreaseWorstReason', worstPerformer.trend)
        }]
      });
    }

    // Market trend
    const overallTrend = delta.percentage > 5 ? i18n.t('advisor.market.strongUp') :
                          delta.percentage > 0 ? i18n.t('advisor.market.steadyGrow') :
                          delta.percentage > -5 ? i18n.t('advisor.market.fluctuate') : i18n.t('advisor.market.decline');

    const trendEmoji = delta.percentage > 5 ? '🚀' :
                        delta.percentage > 0 ? '📊' :
                        delta.percentage > -5 ? '⚖️' : '⚠️';

    // Growth cargo recommendation
    const highGrowth = CARGO_TYPES.reduce((best, c) =>
      c.growthRate > best.growthRate ? c : best, CARGO_TYPES[0]);

    const trendDesc = i18n.lang === 'zh'
      ? `整体市场${overallTrend}。${monthsSimulated > 3 ? i18n.t('advisor.market.matureOps') : i18n.t('advisor.market.earlyOps')}`
      : `Overall market is showing ${overallTrend.toLowerCase()}. ${monthsSimulated > 3 ? i18n.t('advisor.market.matureOps') : i18n.t('advisor.market.earlyOps')}`;

    return {
      source: i18n.t('advisor.source.local'),
      content: null,
      raw: false,
      isLocal: true,
      memoryCount: this.decisionHistory.length,
      pipeline: { mode: 'local' },
      structured: {
        marketTrend: {
          emoji: trendEmoji,
          trend: overallTrend,
          deltaStr: `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`,
          description: trendDesc
        },
        recommendations,
        strategy: {
          title: i18n.t('advisor.strategy.title'),
          points: [
            i18n.t('advisor.strategy.focus', highGrowth.emoji, i18n.cargoName(highGrowth.id), (highGrowth.growthRate * 100).toFixed(1)),
            i18n.t('advisor.strategy.europe'),
            delta.percentage > 0 ? i18n.t('advisor.strategy.expand') : i18n.t('advisor.strategy.optimize'),
            i18n.t('advisor.strategy.layout')
          ]
        },
        // Concrete adjustments for simulation
        adjustments: this._buildAdjustments(topSeasonal, weakSeasonal, bestPerformers, worstPerformer)
      }
    };
  }

  // Build concrete volume adjustment multipliers from analysis
  _buildAdjustments(topSeasonal, weakSeasonal, bestPerformers, worstPerformer) {
    const adjustments = {};

    // Increase recommendations: +15-20%
    if (topSeasonal.length > 0) {
      topSeasonal.forEach(s => {
        adjustments[s.id] = 1.0 + Math.min(s.change, 20) / 100;
      });
    } else {
      bestPerformers.forEach(bp => {
        adjustments[bp.id] = 1.10;
      });
    }

    // Decrease recommendations: -10-15%
    if (weakSeasonal.length > 0) {
      weakSeasonal.forEach(s => {
        adjustments[s.id] = 1.0 + Math.max(s.change, -15) / 100;
      });
    } else {
      adjustments[worstPerformer.id] = 0.88;
    }

    return adjustments;
  }

  // ============================================
  // 渲染（本地/单智能体/多智能体共用结构化渲染）
  // ============================================

  static formatAdviceHTML(advice) {
    if (advice.raw) {
      // 原始文本兜底渲染（保留以防旧数据）
      const formatted = advice.content
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/(\d+\.\s)/g, '<br>$1');
      return `
        <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
          🤖 ${i18n.t('ai.title')}: ${advice.source}
        </div>
        <div style="line-height:1.9">${formatted}</div>
      `;
    }

    // Structured advice
    const { marketTrend, recommendations, strategy } = advice.structured;

    const sourceNote = advice.isLocal
      ? i18n.t('advisor.source.localNote')
      : i18n.t('advisor.source.aiMemory', advice.memoryCount || 0);

    // 多智能体流水线徽标
    let pipelineBadge = '';
    if (advice.pipeline && advice.pipeline.mode === 'multi') {
      const p = advice.pipeline;
      const analystMark = p.analystOk ? '✓' : '✗';
      const verdictText = p.riskVerdict === 'skipped'
        ? i18n.t('ai.risk.skipped')
        : i18n.t(`ai.risk.${p.riskVerdict}`);
      pipelineBadge = `
        <div class="pipeline-badge">
          <span>${i18n.t('ai.stage.analyst')} ${analystMark}</span>
          <span class="pipeline-badge-sep">→</span>
          <span>${i18n.t('ai.stage.planner')} ✓</span>
          <span class="pipeline-badge-sep">→</span>
          <span>${i18n.t('ai.stage.risk')}：${verdictText}</span>
        </div>
      `;
    }

    let html = `
      <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
        🧠 ${i18n.t('ai.title')}: ${advice.source} (${sourceNote})
      </div>
      ${pipelineBadge}
      <h3 style="margin-bottom:12px">${marketTrend.emoji} ${i18n.t('advisor.market.trend')}：${marketTrend.trend} (${marketTrend.deltaStr})</h3>
      <p style="margin-bottom:16px;color:var(--text-secondary)">${marketTrend.description}</p>
    `;

    recommendations.forEach(rec => {
      html += `<h3 style="margin:16px 0 8px;font-size:0.95rem">${rec.title}</h3>`;
      rec.items.forEach(item => {
        html += `
          <div class="recommendation">
            <strong>${item.name}</strong><br>
            <span style="color:var(--text-secondary)">${item.reason}</span>
          </div>
        `;
      });
    });

    if (strategy.points && strategy.points.length > 0) {
      html += `<h3 style="margin:16px 0 8px;font-size:0.95rem">${strategy.title}</h3>`;
      html += '<ul style="list-style:none;padding:0">';
      strategy.points.forEach(point => {
        html += `<li style="padding:6px 0;color:var(--text-secondary);border-bottom:1px solid rgba(255,255,255,0.03)">• ${point}</li>`;
      });
      html += '</ul>';
    }

    return html;
  }
}

window.CargoAdvisor = CargoAdvisor;
