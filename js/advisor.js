// ============================================
// AI 调度智能体 — advisor.js
// DeepSeek API（JSON 结构化决策 + 决策记忆闭环 + 护栏校验）
// 本地规则引擎作为降级与对照基线
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

    // 护栏参数
    this.MULT_MIN = 0.75;          // 运量乘数下限
    this.MULT_MAX = 1.30;          // 运量乘数上限
    this.MAX_MONTHLY_STEP = 0.10;  // 单月乘数相对上次决策的最大变化幅度

    // 智能体决策记忆（跨会话持久化，用于闭环反馈）
    this.decisionHistory = this._loadMemory();

    // 上一次实际应用到模拟器的乘数（用于单月限幅计算）
    this._prevAdjustments = null;
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    this.useAPI = this.apiKey.length > 0;
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
        return await this._getDeepSeekAdvice(simulationSummary);
      } else {
        return this._getLocalAdvice(simulationSummary);
      }
    } catch (error) {
      console.error('Advisor error:', error);
      // 降级到本地规则引擎
      return this._getLocalAdvice(simulationSummary);
    } finally {
      this.isLoading = false;
    }
  }

  // ---- DeepSeek 智能体：感知 → 规划（JSON 结构化决策） ----

  async _getDeepSeekAdvice(summary) {
    const systemPrompt = i18n.t('advisor.prompt.system');
    const userPrompt = this._buildPrompt(summary);

    let lastError = null;
    // DeepSeek JSON Output 有概率返回空 content，失败时重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawJson = await this._callDeepSeek(systemPrompt, userPrompt);
        return this._parseAgentResponse(rawJson, summary);
      } catch (err) {
        console.warn(`DeepSeek attempt ${attempt + 1} failed:`, err);
        lastError = err;
      }
    }
    throw lastError;
  }

  async _callDeepSeek(systemPrompt, userPrompt) {
    const response = await fetch(this.apiEndpoint, {
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
      })
    });

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

  // 解析智能体的 JSON 决策，执行护栏校验后转为内部结构化建议
  _parseAgentResponse(rawJson, summary) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      throw new Error('Invalid JSON from DeepSeek: ' + e.message);
    }

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
      source: 'AI (DeepSeek)',
      content: null,
      raw: false,
      isLocal: false,
      memoryCount: this.decisionHistory.length,
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

  // ---- 护栏层：钳制 + 单月限幅，不信任 LLM 的原始输出 ----

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

  // ---- 决策记忆（智能体闭环反馈） ----

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
      ? `\n你的历史决策及其实际效果（请从中学习，避免重复无效决策）：\n${lines.join('\n')}\n`
      : `\nYour past decisions and their actual outcomes (learn from them, avoid repeating ineffective moves):\n${lines.join('\n')}\n`;
  }

  // ---- Prompt 构建（含 JSON 输出契约与决策记忆） ----

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

  // ---- 本地规则引擎（降级方案与对照基线） ----

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

  // Format advice as HTML（本地引擎与 DeepSeek 智能体共用结构化渲染）
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

    let html = `
      <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
        🧠 ${i18n.t('ai.title')}: ${advice.source} (${sourceNote})
      </div>

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
