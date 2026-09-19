// ============================================
// 国际化模块 — i18n.js
// Chinese / English language switching
// ============================================

const I18N = {
  zh: {
    // Header
    'header.title': '中吉乌铁路经济模拟器',
    'header.subtitle': 'China-Kyrgyzstan-Uzbekistan Railway Simulator',
    'header.simDate.prefix': '📅',
    'header.monthCount': (n) => `第 ${n} 个月`,
    'header.btnAdvance': '▶ 推进下月',
    'header.btnAdvance6': '⏩ 快进6月',
    'header.btnReset': '↺ 重置',

    // Loading
    'loading.text': '正在初始化铁路模拟系统...',

    // Map Section
    'map.title': '铁路路线图 — 点击路线段查看区域收益',
    'map.resetView': '🔄 重置视图',
    'map.legend.title': '路线图例',
    'map.legend.china': '🇨🇳 中国段 (213km)',
    'map.legend.kyrgyzstan': '🇰🇬 吉尔吉斯斯坦段 (300km)',
    'map.legend.uzbekistan': '🇺🇿 乌兹别克斯坦段 (60km)',
    'map.legend.europe': '🇪🇺 欧洲连线',

    // Stat Cards
    'stat.totalRevenue.label': '📊 累计总收益',
    'stat.totalRevenue.sub': '自 2026年1月 起累计',
    'stat.monthlyRevenue.label': '💰 本月收益',
    'stat.monthlyRevenue.sub': '当月运输总收入',
    'stat.delta.label': '📈 环比变化',
    'stat.delta.sub.suffix': '对比上月',
    'stat.volume.label': '📦 本月运量',
    'stat.volume.sub': '所有货物总运输量',
    'stat.volume.unit': '吨',

    // Region Panel
    'region.title': '区域详情',
    'region.distance': '距离：',
    'region.revenue': '收益：',
    'region.share': '占比：',

    // Charts
    'chart.trend.title': '月度收益趋势 & 环比变化',
    'chart.cargo.title': '货物收益构成',
    'chart.trend.revenue': '月度收益 ($)',
    'chart.trend.delta': '环比变化 (%)',
    'chart.tooltip.revenue': '收益',
    'chart.tooltip.delta': '环比',

    // Cargo Table
    'cargo.table.title': '货物运输明细',
    'cargo.table.type': '货物类型',
    'cargo.table.volume': '运量',
    'cargo.table.price': '单价',
    'cargo.table.revenue': '收益',
    'cargo.table.trend': '环比',
    'cargo.unit.ton': '吨',
    'cargo.unit.perTon': '/吨',

    // AI Advisor
    'ai.title': 'AI 货物调度建议',
    'ai.toggle.off': 'AI 调控：关闭',
    'ai.toggle.on': 'AI 调控：开启',
    'ai.status.off': '未采纳 AI 建议',
    'ai.status.on': '已采纳 AI 建议 ✓',
    'ai.status.pending': '请先获取 AI 建议',
    'ai.apiKey.placeholder': '可选：输入 DeepSeek API Key 获取 AI 建议（platform.deepseek.com 注册）',
    'ai.btnGetAdvice': '🧠 获取 AI 建议',
    'ai.btnExport': '📊 导出对比图',
    'ai.result.placeholder': '点击「获取 AI 建议」按钮获取货物调度建议。未设置 API Key 时将使用本地分析引擎。',
    'ai.adjustments.header': '当前 AI 调控参数（将应用于下月模拟）',
    'ai.adjustments.empty': '暂无调控参数',
    'ai.loading': '正在分析数据并生成调度建议...',
    'ai.error': '⚠️ 获取建议失败，请检查网络或 API Key',

    // Algorithm Section
    'algo.title': '模拟算法说明 — Simulation Algorithm',
    'algo.baseline.title': '基线调控算法（无 AI 介入）',
    'algo.baseline.desc': '基线模拟采用<strong>蒙特卡洛随机模拟（Monte Carlo Simulation）</strong>结合<strong>乘法季节分解模型（Multiplicative Seasonal Decomposition）</strong>。',
    'algo.baseline.seasonFactor': '<span class="algo-tag deterministic">确定性</span><strong>季节因子 S[month]</strong>：每种货物拥有 12 个月的季节系数（0.7~1.4），反映真实市场的季节性波动',
    'algo.baseline.growth': '<span class="algo-tag deterministic">确定性</span><strong>指数增长趋势</strong>：复合月增长率 g = 1%~3.5%，模拟铁路通车后货运量的自然增长',
    'algo.baseline.random': '<span class="algo-tag stochastic">随机性</span><strong>均匀分布随机量</strong> U(min, max)：每月运量在 [minVolume, maxVolume] 区间内均匀随机采样',
    'algo.baseline.price': '<span class="algo-tag stochastic">随机性</span><strong>价格波动 ±15%</strong>：每种货物的单价基于基准价上下浮动 15%，模拟市场不确定性',
    'algo.baseline.region': '<span class="algo-tag deterministic">确定性</span><strong>固定比例区域分配</strong>：中国段 30%、吉尔吉斯斯坦段 25%、乌兹别克斯坦段 15%、欧洲连线 30%',
    'algo.ai.title': 'AI 调控算法（开启 AI 后）',
    'algo.ai.desc': 'AI 调控模式下，系统使用<strong>规则基专家系统（Rule-Based Expert System）</strong>或外部 <strong>LLM 智能体（DeepSeek）</strong> 生成调度建议。智能体以结构化 JSON 输出决策，并结合历史决策的实际效果自我修正。',
    'algo.ai.seasonal': '<span class="algo-tag ai">本地引擎</span><strong>季节趋势分析</strong>：对比相邻月份的季节因子变化，识别上升/下降趋势',
    'algo.ai.ranking': '<span class="algo-tag ai">本地引擎</span><strong>绩效排序</strong>：按当月收益降序排列，推荐增加 Top 2、减少 Bottom 1 的运量',
    'algo.ai.heuristic': '<span class="algo-tag ai">本地引擎</span><strong>启发式调整</strong>：季节因子上升 → 增量 +15~20%；下降 → 减量 -10~15%',
    'algo.ai.llm': '<span class="algo-tag ai">LLM 模式</span><strong>自然语言解析</strong>：解析 AI 回复中的百分比关键词，提取运量调整乘数（上限 ±30%）',
    'algo.ai.baseline': '<span class="algo-tag deterministic">对比基准</span><strong>基线对照</strong>：AI 调控月份同时记录基线收益（未调整的运量 × 同一价格），用于效果对比',
    'algo.summary': '基线模拟完全依赖<strong>随机采样 + 固定季节因子</strong>的被动调控；AI 模式则主动分析市场数据，通过<strong>调整运量乘数 M</strong> 来优化货物配比，最终对比两种策略下的收益差异。两种模式共享相同的价格波动和增长模型，仅在运量决策上存在差异。',

    // Comparison Section
    'comparison.title': 'AI 建议采纳 vs 未采纳 — 销售额对比',
    'comparison.download': '⬇️ 下载图片',
    'comparison.close': '✕ 关闭',
    'comparison.chart.title': 'AI 建议采纳 vs 未采纳 — 货物销售额对比',
    'comparison.actual': '实际收益（采纳 AI 建议）',
    'comparison.baseline': '基线收益（未采纳 AI 建议）',
    'comparison.diff': '差异金额 ($)',
    'comparison.yAxis': '销售额 ($)',
    'comparison.yAxis2': '差异金额',
    'comparison.tooltip.diff': '差异',
    'comparison.tooltip.change': '变化幅度',
    'comparison.noData.title': '暂无 AI 调控数据',
    'comparison.noData.desc': '请先获取 AI 建议并开启 AI 调控开关，然后推进月份以查看对比效果。目前显示的两条线完全重叠，因为所有月份均未采纳 AI 建议。',
    'comparison.stat.months': 'AI 调控月数',
    'comparison.stat.months.unit': '个月',
    'comparison.stat.aiRevenue': 'AI 调控期间总收益',
    'comparison.stat.baseRevenue': '同期基线收益',
    'comparison.stat.gain': 'AI 调控增益',

    // Footer
    'footer.line1': '🚂 中吉乌铁路经济模拟器 v1.0 | 数据基于中欧班列统计外推模拟 | 仅供参考',
    'footer.line2': '铁路预计 2028-2030 年完工通车 | 本项目为模拟/假设场景',

    // Toasts
    'toast.advance': (date) => `📅 已推进到 ${date}`,
    'toast.advance.ai': ' (AI 调控生效中)',
    'toast.advance6': '⏩ 已快进 6 个月',
    'toast.reset': '🔄 模拟器已重置到 2026年1月',
    'toast.apiKeySet': '🔑 API Key 已设置，将使用 DeepSeek AI',
    'toast.aiOn': '🤖 AI 调控已开启，下月模拟将采纳 AI 建议',
    'toast.aiNeedAdvice': '⚠️ 请先点击「获取 AI 建议」，再开启 AI 调控',
    'toast.aiOff': 'AI 调控已关闭',
    'toast.adviceGenerated': '✅ AI 建议已生成，可开启 AI 调控开关采纳建议',
    'toast.chartDownloaded': '⬇️ 对比图已下载',

    // Map Popup
    'popup.section': '路段',
    'popup.distance': '距离',
    'popup.monthRevenue': '本月收益',
    'popup.revenueShare': '收益占比',

    // Date Formatting
    'date.format': (year, month) => `${year}年${MONTH_NAMES[month]}`,

    // Advisor local engine
    'advisor.source.local': '本地规则引擎',
    'advisor.source.localNote': '未配置 API Key，使用本地分析引擎',
    'advisor.source.aiMemory': (n) => n > 0 ? `DeepSeek 智能体 · 已积累 ${n} 期决策记忆` : 'DeepSeek 智能体 · 结构化决策',
    'advisor.market.strongUp': '强劲上升',
    'advisor.market.steadyGrow': '稳步增长',
    'advisor.market.fluctuate': '小幅波动',
    'advisor.market.decline': '明显下滑',
    'advisor.market.trend': '市场趋势',
    'advisor.market.matureOps': '随着铁路运营逐步成熟，运输效率持续提升。',
    'advisor.market.earlyOps': '铁路刚开始运营，市场仍在培育阶段。',
    'advisor.rec.increase': '📈 建议增加运量',
    'advisor.rec.decrease': '📉 建议减少运量',
    'advisor.rec.increaseReason': (nextMonth, change) => `下月（${nextMonth}）季节性因子将提升 ${change > 0 ? '+' : ''}${change}%，建议增加运量 15-20%`,
    'advisor.rec.maintainReason': (trend) => `本月表现优异（趋势 ${trend}），市场需求旺盛，建议维持或增加 10% 运量`,
    'advisor.rec.decreaseSeasonReason': (change) => `下月季节性因子将下降 ${change}%，需求可能走弱，建议减少运量 10-15%`,
    'advisor.rec.decreaseWorstReason': (trend) => `本月收益排名末尾（趋势 ${trend}），建议适当减少运量，释放运力给高收益货物`,
    'advisor.strategy.title': '🎯 综合调度策略',
    'advisor.strategy.focus': (emoji, name, rate) => `重点发力 ${emoji} ${name}（月增长率 ${rate}%），长期收益潜力最大`,
    'advisor.strategy.europe': '关注欧洲市场需求变化，出口欧洲占总收益约 30%，是重要利润来源',
    'advisor.strategy.expand': '当前势头良好，可适度扩大总运量 5-10%',
    'advisor.strategy.optimize': '市场出现回调，建议优化货物结构而非盲目扩量',
    'advisor.strategy.layout': '建议在马克马尔换装站提前布局热门货物，减少换装等待时间',
    'advisor.prompt.system': '你是中吉乌铁路（中国-吉尔吉斯斯坦-乌兹别克斯坦）的货运调度智能体，负责根据每月运营数据动态调整各类货物的运量配比。你必须只输出合法的 json 对象，不得输出任何其他文字或 markdown 代码块。json 结构为：{"marketTrend":{"trend":"简短趋势判断","description":"市场分析"},"increase":[{"id":"货物id","reason":"增运理由"}],"decrease":[{"id":"货物id","reason":"减运理由"}],"strategy":["策略要点"],"adjustments":{"货物id":运量乘数}}。全部内容使用中文。',

    // Multi-agent pipeline
    'ai.mode.single': '🤖 单智能体',
    'ai.mode.multi': '🤖×3 多智能体',
    'ai.stage.analyst': '市场分析员',
    'ai.stage.planner': '调度规划官',
    'ai.stage.risk': '风险审查官',
    'ai.stage.status.pending': '等待中',
    'ai.stage.status.running': '进行中…',
    'ai.stage.status.done': '完成',
    'ai.stage.status.failed': '失败（已降级）',
    'ai.risk.approve': '通过',
    'ai.risk.modify': '已修正',
    'ai.risk.reject': '已否决',
    'ai.risk.skipped': '跳过（直接采纳草案）',
    'ai.risk.commentPrefix': '审查官意见：',
    'ai.error.title': '智能体请求失败',
    'ai.error.timeout': '请求超时（单棒上限 60 秒）。网络较慢或模型响应过慢，建议直接重试。',
    'ai.error.http': 'API 返回错误。请检查 API Key 是否有效、余额是否充足，或稍后重试。',
    'ai.error.parse': '模型返回内容无法解析（已自动重试一次仍失败）。可再次重试或改用本地引擎。',
    'ai.error.unknown': '发生未知错误，请重试。',
    'ai.error.retry': '🔄 重试',
    'ai.error.useLocal': '使用本地引擎',
    'toast.modeSingle': '🤖 已切换为单智能体模式',
    'toast.modeMulti': '🤖×3 已切换为多智能体流水线模式',
    'advisor.prompt.analyst': '你是中吉乌铁路（中国-吉尔吉斯斯坦-乌兹别克斯坦）的货运市场分析员，擅长从月度运营数据中识别趋势、机会与风险。你必须只输出合法的 json 对象，不得输出任何其他文字或 markdown 代码块。json 结构为：{"trend":"简短趋势判断","description":"市场分析","opportunities":[{"id":"货物id","note":"机会说明"}],"risks":[{"id":"货物id","note":"风险说明"}],"seasonOutlook":"季节展望"}。全部内容使用中文。',
    'advisor.prompt.planner': '你是中吉乌铁路（中国-吉尔吉斯斯坦-乌兹别克斯坦）的货运调度规划官，根据市场简报与历史决策效果制定下月运量调整方案。你必须只输出合法的 json 对象，不得输出任何其他文字或 markdown 代码块。json 结构为：{"increase":[{"id":"货物id","reason":"理由"}],"decrease":[{"id":"货物id","reason":"理由"}],"strategy":["策略要点"],"adjustments":{"货物id":运量乘数}}。全部内容使用中文。',
    'advisor.prompt.risk': '你是中吉乌铁路（中国-吉尔吉斯斯坦-乌兹别克斯坦）的货运风险审查官，负责审查调度方案的稳健性，有权通过、修正或否决方案。你必须只输出合法的 json 对象，不得输出任何其他文字或 markdown 代码块。json 结构为：{"verdict":"approve或modify或reject","comment":"审查意见","adjustments":{"货物id":运量乘数}}。全部内容使用中文。',

    // Cargo names
    'cargo.electronics': '电子产品',
    'cargo.textiles': '纺织品',
    'cargo.machinery': '机械设备',
    'cargo.agriculture': '农产品',
    'cargo.energy': '新能源产品',
    'cargo.consumer': '日用消费品',

    // Region names
    'region.china': '中国段',
    'region.kyrgyzstan': '吉尔吉斯斯坦段',
    'region.uzbekistan': '乌兹别克斯坦段',
    'region.europe': '欧洲连线',

    // Region descriptions
    'region.china.desc': '喀什 → 吐尔尕特',
    'region.kyrgyzstan.desc': '吐尔尕特 → 贾拉拉巴德',
    'region.uzbekistan.desc': '贾拉拉巴德 → 安集延',
    'region.europe.desc': '安集延 → 欧洲市场',

    // Chart export
    'export.footer': (date) => `🚂 中吉乌铁路经济模拟器 — AI 销售额对比 | 导出时间: ${date}`,

    // Language toggle
    'lang.toggle': 'EN',
    'lang.name': '中文',
  },

  en: {
    // Header
    'header.title': 'CKU Railway Economic Simulator',
    'header.subtitle': 'China-Kyrgyzstan-Uzbekistan Railway',
    'header.simDate.prefix': '📅',
    'header.monthCount': (n) => `Month ${n}`,
    'header.btnAdvance': '▶ Next Month',
    'header.btnAdvance6': '⏩ Skip 6 Months',
    'header.btnReset': '↺ Reset',

    // Loading
    'loading.text': 'Initializing railway simulation...',

    // Map Section
    'map.title': 'Railway Route Map — Click segments for regional details',
    'map.resetView': '🔄 Reset View',
    'map.legend.title': 'Legend',
    'map.legend.china': '🇨🇳 China Section (213km)',
    'map.legend.kyrgyzstan': '🇰🇬 Kyrgyzstan Section (300km)',
    'map.legend.uzbekistan': '🇺🇿 Uzbekistan Section (60km)',
    'map.legend.europe': '🇪🇺 Europe Connection',

    // Stat Cards
    'stat.totalRevenue.label': '📊 Total Revenue',
    'stat.totalRevenue.sub': 'Cumulative since Jan 2026',
    'stat.monthlyRevenue.label': '💰 Monthly Revenue',
    'stat.monthlyRevenue.sub': 'Current month transport income',
    'stat.delta.label': '📈 Month-over-Month',
    'stat.delta.sub.suffix': 'vs last month',
    'stat.volume.label': '📦 Monthly Volume',
    'stat.volume.sub': 'Total cargo transported',
    'stat.volume.unit': ' tons',

    // Region Panel
    'region.title': 'Region Details',
    'region.distance': 'Distance: ',
    'region.revenue': 'Revenue: ',
    'region.share': 'Share: ',

    // Charts
    'chart.trend.title': 'Monthly Revenue Trend & MoM Change',
    'chart.cargo.title': 'Cargo Revenue Composition',
    'chart.trend.revenue': 'Monthly Revenue ($)',
    'chart.trend.delta': 'MoM Change (%)',
    'chart.tooltip.revenue': 'Revenue',
    'chart.tooltip.delta': 'MoM',

    // Cargo Table
    'cargo.table.title': 'Cargo Transport Details',
    'cargo.table.type': 'Cargo Type',
    'cargo.table.volume': 'Volume',
    'cargo.table.price': 'Unit Price',
    'cargo.table.revenue': 'Revenue',
    'cargo.table.trend': 'MoM',
    'cargo.unit.ton': ' tons',
    'cargo.unit.perTon': '/ton',

    // AI Advisor
    'ai.title': 'AI Cargo Dispatch Advisor',
    'ai.toggle.off': 'AI Control: OFF',
    'ai.toggle.on': 'AI Control: ON',
    'ai.status.off': 'AI advice not adopted',
    'ai.status.on': 'AI advice adopted ✓',
    'ai.status.pending': 'Get AI advice first',
    'ai.apiKey.placeholder': 'Optional: Enter DeepSeek API Key for AI advice (sign up at platform.deepseek.com)',
    'ai.btnGetAdvice': '🧠 Get AI Advice',
    'ai.btnExport': '📊 Export Comparison',
    'ai.result.placeholder': 'Click "Get AI Advice" to generate cargo dispatch suggestions. Local analysis engine is used without API Key.',
    'ai.adjustments.header': 'Current AI Control Parameters (applied to next month)',
    'ai.adjustments.empty': 'No control parameters',
    'ai.loading': 'Analyzing data and generating advice...',
    'ai.error': '⚠️ Failed to get advice. Check network or API Key.',

    // Algorithm Section
    'algo.title': 'Simulation Algorithm',
    'algo.baseline.title': 'Baseline Algorithm (without AI)',
    'algo.baseline.desc': 'Baseline simulation uses <strong>Monte Carlo Simulation</strong> combined with <strong>Multiplicative Seasonal Decomposition</strong>.',
    'algo.baseline.seasonFactor': '<span class="algo-tag deterministic">Deterministic</span><strong>Season Factor S[month]</strong>: Each cargo has 12 monthly coefficients (0.7~1.4), reflecting real market seasonality',
    'algo.baseline.growth': '<span class="algo-tag deterministic">Deterministic</span><strong>Exponential Growth Trend</strong>: Compound monthly growth g = 1%~3.5%, simulating natural cargo volume increase',
    'algo.baseline.random': '<span class="algo-tag stochastic">Stochastic</span><strong>Uniform Random Volume</strong> U(min, max): Monthly volume randomly sampled from [minVolume, maxVolume]',
    'algo.baseline.price': '<span class="algo-tag stochastic">Stochastic</span><strong>Price Fluctuation ±15%</strong>: Unit price fluctuates ±15% around base price, simulating market uncertainty',
    'algo.baseline.region': '<span class="algo-tag deterministic">Deterministic</span><strong>Fixed Regional Allocation</strong>: China 30%, Kyrgyzstan 25%, Uzbekistan 15%, Europe 30%',
    'algo.ai.title': 'AI Control Algorithm (with AI enabled)',
    'algo.ai.desc': 'In AI mode, the system uses a <strong>Rule-Based Expert System</strong> or an external <strong>LLM agent (DeepSeek)</strong> to generate dispatch advice. The agent outputs structured JSON decisions and self-corrects using the actual outcomes of past decisions.',
    'algo.ai.seasonal': '<span class="algo-tag ai">Local Engine</span><strong>Seasonal Trend Analysis</strong>: Compares adjacent months\' seasonal factors to identify trends',
    'algo.ai.ranking': '<span class="algo-tag ai">Local Engine</span><strong>Performance Ranking</strong>: Sorts by current revenue, recommends increasing Top 2 and decreasing Bottom 1',
    'algo.ai.heuristic': '<span class="algo-tag ai">Local Engine</span><strong>Heuristic Adjustment</strong>: Rising season factor → +15~20%; falling → -10~15%',
    'algo.ai.llm': '<span class="algo-tag ai">LLM Agent</span><strong>Structured decision loop</strong>: DeepSeek outputs volume multipliers directly in JSON (clamped to 0.75~1.30, max ±10% change per month) and self-corrects by learning from actual revenue deviations of past decisions',
    'algo.ai.baseline': '<span class="algo-tag deterministic">Baseline Ref</span><strong>Baseline Comparison</strong>: Records baseline revenue alongside AI-adjusted revenue for effect comparison',
    'algo.summary': 'Baseline simulation relies entirely on <strong>random sampling + fixed seasonal factors</strong>; AI mode proactively analyzes market data and optimizes cargo mix by <strong>adjusting volume multiplier M</strong>. Both modes share the same price fluctuation and growth models, differing only in volume decisions.',

    // Comparison Section
    'comparison.title': 'AI Adopted vs Not Adopted — Revenue Comparison',
    'comparison.download': '⬇️ Download Image',
    'comparison.close': '✕ Close',
    'comparison.chart.title': 'AI Adopted vs Not Adopted — Revenue Comparison',
    'comparison.actual': 'Actual Revenue (AI Adopted)',
    'comparison.baseline': 'Baseline Revenue (No AI)',
    'comparison.diff': 'Difference ($)',
    'comparison.yAxis': 'Revenue ($)',
    'comparison.yAxis2': 'Difference',
    'comparison.tooltip.diff': 'Diff',
    'comparison.tooltip.change': 'Change',
    'comparison.noData.title': 'No AI Control Data Yet',
    'comparison.noData.desc': 'Please get AI advice first, enable the AI toggle, and advance months to see comparison. Both lines currently overlap as no AI advice has been adopted.',
    'comparison.stat.months': 'AI Control Months',
    'comparison.stat.months.unit': ' months',
    'comparison.stat.aiRevenue': 'Total AI Revenue',
    'comparison.stat.baseRevenue': 'Baseline Revenue',
    'comparison.stat.gain': 'AI Control Gain',

    // Footer
    'footer.line1': '🚂 CKU Railway Economic Simulator v1.0 | Data extrapolated from China-Europe freight statistics | For reference only',
    'footer.line2': 'Railway expected completion: 2028-2030 | This project is a simulation/hypothetical scenario',

    // Toasts
    'toast.advance': (date) => `📅 Advanced to ${date}`,
    'toast.advance.ai': ' (AI Control Active)',
    'toast.advance6': '⏩ Skipped 6 months',
    'toast.reset': '🔄 Simulator reset to Jan 2026',
    'toast.apiKeySet': '🔑 API Key set, using DeepSeek AI',
    'toast.aiOn': '🤖 AI Control enabled, advice applied next month',
    'toast.aiNeedAdvice': '⚠️ Please get AI advice first before enabling AI Control',
    'toast.aiOff': 'AI Control disabled',
    'toast.adviceGenerated': '✅ AI advice generated. Enable AI toggle to adopt.',
    'toast.chartDownloaded': '⬇️ Comparison chart downloaded',

    // Map Popup
    'popup.section': 'Section',
    'popup.distance': 'Distance',
    'popup.monthRevenue': 'Monthly Revenue',
    'popup.revenueShare': 'Revenue Share',

    // Date Formatting
    'date.format': (year, month) => `${MONTH_NAMES_EN[month]} ${year}`,

    // Advisor local engine
    'advisor.source.local': 'Local Rule Engine',
    'advisor.source.localNote': 'No API Key configured, using local analysis engine',
    'advisor.market.strongUp': 'Strong Growth',
    'advisor.market.steadyGrow': 'Steady Growth',
    'advisor.market.fluctuate': 'Minor Fluctuation',
    'advisor.market.decline': 'Notable Decline',
    'advisor.market.trend': 'Market Trend',
    'advisor.market.matureOps': 'As railway operations mature, transport efficiency continues to improve.',
    'advisor.market.earlyOps': 'Railway just started operations, market is still in early development.',
    'advisor.rec.increase': '📈 Recommend Increasing Volume',
    'advisor.rec.decrease': '📉 Recommend Decreasing Volume',
    'advisor.rec.increaseReason': (nextMonth, change) => `Next month (${nextMonth}) seasonal factor rises ${change > 0 ? '+' : ''}${change}%, recommend increasing volume 15-20%`,
    'advisor.rec.maintainReason': (trend) => `Excellent performance this month (trend ${trend}), strong demand, recommend maintaining or increasing 10%`,
    'advisor.rec.decreaseSeasonReason': (change) => `Next month seasonal factor drops ${change}%, demand may weaken, recommend reducing volume 10-15%`,
    'advisor.rec.decreaseWorstReason': (trend) => `Lowest revenue ranking this month (trend ${trend}), recommend reducing volume to free capacity for higher-yield cargo`,
    'advisor.strategy.title': '🎯 Comprehensive Dispatch Strategy',
    'advisor.strategy.focus': (emoji, name, rate) => `Focus on ${emoji} ${name} (monthly growth ${rate}%), highest long-term revenue potential`,
    'advisor.strategy.europe': 'Monitor European market demand changes — exports to Europe account for ~30% of total revenue',
    'advisor.strategy.expand': 'Current momentum is positive, consider expanding total volume by 5-10%',
    'advisor.strategy.optimize': 'Market is pulling back, recommend optimizing cargo mix rather than blindly expanding',
    'advisor.strategy.layout': 'Pre-position popular cargo at Makmal transshipment station to reduce handling wait times',
    'advisor.prompt.system': 'You are the cargo dispatch agent for the CKU Railway (China-Kyrgyzstan-Uzbekistan), dynamically adjusting cargo volume allocation based on monthly operational data. You must output only a valid json object, with no extra text or markdown code blocks. The json structure is: {"marketTrend":{"trend":"brief trend","description":"market analysis"},"increase":[{"id":"cargo id","reason":"reason"}],"decrease":[{"id":"cargo id","reason":"reason"}],"strategy":["strategy point"],"adjustments":{"cargo id":volume multiplier}}. Reply entirely in English.',

    // Multi-agent pipeline
    'ai.mode.single': '🤖 Single agent',
    'ai.mode.multi': '🤖×3 Multi-agent',
    'ai.stage.analyst': 'Market Analyst',
    'ai.stage.planner': 'Dispatch Planner',
    'ai.stage.risk': 'Risk Officer',
    'ai.stage.status.pending': 'Pending',
    'ai.stage.status.running': 'Running…',
    'ai.stage.status.done': 'Done',
    'ai.stage.status.failed': 'Failed (fallback)',
    'ai.risk.approve': 'Approved',
    'ai.risk.modify': 'Modified',
    'ai.risk.reject': 'Rejected',
    'ai.risk.skipped': 'Skipped (draft adopted)',
    'ai.risk.commentPrefix': 'Risk review: ',
    'ai.error.title': 'Agent request failed',
    'ai.error.timeout': 'Request timed out (60s per stage limit). The network or model is slow — try again.',
    'ai.error.http': 'API returned an error. Check whether the API Key is valid and has balance, or retry later.',
    'ai.error.parse': 'Model output could not be parsed (auto-retry already attempted). Retry or switch to the local engine.',
    'ai.error.unknown': 'An unknown error occurred. Please retry.',
    'ai.error.retry': '🔄 Retry',
    'ai.error.useLocal': 'Use local engine',
    'toast.modeSingle': '🤖 Switched to single-agent mode',
    'toast.modeMulti': '🤖×3 Switched to multi-agent pipeline mode',
    'advisor.prompt.analyst': 'You are the freight market analyst for the CKU Railway (China-Kyrgyzstan-Uzbekistan), skilled at identifying trends, opportunities and risks from monthly operational data. You must output only a valid json object, with no extra text or markdown code blocks. The json structure is: {"trend":"brief trend","description":"market analysis","opportunities":[{"id":"cargo id","note":"opportunity"}],"risks":[{"id":"cargo id","note":"risk"}],"seasonOutlook":"season outlook"}. Reply entirely in English.',
    'advisor.prompt.planner': 'You are the cargo dispatch planner for the CKU Railway (China-Kyrgyzstan-Uzbekistan), making next-month volume adjustment plans based on market briefs and historical decision outcomes. You must output only a valid json object, with no extra text or markdown code blocks. The json structure is: {"increase":[{"id":"cargo id","reason":"reason"}],"decrease":[{"id":"cargo id","reason":"reason"}],"strategy":["strategy point"],"adjustments":{"cargo id":volume multiplier}}. Reply entirely in English.',
    'advisor.prompt.risk': 'You are the freight risk officer for the CKU Railway (China-Kyrgyzstan-Uzbekistan), reviewing dispatch plans for robustness with the authority to approve, modify or reject them. You must output only a valid json object, with no extra text or markdown code blocks. The json structure is: {"verdict":"approve or modify or reject","comment":"review comment","adjustments":{"cargo id":volume multiplier}}. Reply entirely in English.',

    // Cargo names
    'cargo.electronics': 'Electronics',
    'cargo.textiles': 'Textiles',
    'cargo.machinery': 'Machinery',
    'cargo.agriculture': 'Agricultural Products',
    'cargo.energy': 'New Energy Products',
    'cargo.consumer': 'Consumer Goods',

    // Region names
    'region.china': 'China Section',
    'region.kyrgyzstan': 'Kyrgyzstan Section',
    'region.uzbekistan': 'Uzbekistan Section',
    'region.europe': 'Europe Connection',

    // Region descriptions
    'region.china.desc': 'Kashgar → Torugart',
    'region.kyrgyzstan.desc': 'Torugart → Jalal-Abad',
    'region.uzbekistan.desc': 'Jalal-Abad → Andijan',
    'region.europe.desc': 'Andijan → European Markets',

    // Chart export
    'export.footer': (date) => `🚂 CKU Railway Simulator — AI Revenue Comparison | Exported: ${date}`,

    // Language toggle
    'lang.toggle': '中文',
    'lang.name': 'English',
  }
};

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem('cku-lang') || 'zh';
    this._listeners = [];
  }

  get lang() {
    return this.currentLang;
  }

  /**
   * Get a translation by key. If the value is a function, pass args to it.
   */
  t(key, ...args) {
    const dict = I18N[this.currentLang];
    if (!dict) return key;
    const val = dict[key];
    if (val === undefined) return key;
    if (typeof val === 'function') return val(...args);
    return val;
  }

  /**
   * Toggle between zh and en
   */
  toggle() {
    this.currentLang = this.currentLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('cku-lang', this.currentLang);
    this._applyStaticTranslations();
    this._notifyListeners();
  }

  /**
   * Set language explicitly
   */
  setLang(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    this.currentLang = lang;
    localStorage.setItem('cku-lang', this.currentLang);
    this._applyStaticTranslations();
    this._notifyListeners();
  }

  /**
   * Register a callback for language changes
   */
  onChange(fn) {
    this._listeners.push(fn);
  }

  _notifyListeners() {
    this._listeners.forEach(fn => fn(this.currentLang));
  }

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  _applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = this.t(key);
      if (val !== key) {
        // Check if content should be set as HTML or text
        if (el.hasAttribute('data-i18n-html')) {
          el.innerHTML = val;
        } else {
          el.textContent = val;
        }
      }
    });

    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = this.t(key);
      if (val !== key) {
        el.placeholder = val;
      }
    });

    // Update html lang attribute
    document.documentElement.lang = this.currentLang === 'zh' ? 'zh-CN' : 'en';

    // Update language toggle button text
    const toggleBtn = document.getElementById('langToggle');
    if (toggleBtn) {
      const btnText = toggleBtn.querySelector('.lang-btn-text');
      if (btnText) {
        btnText.textContent = this.t('lang.toggle');
      }
    }
  }

  /**
   * Get localized cargo name
   */
  cargoName(cargoId) {
    return this.t(`cargo.${cargoId}`);
  }

  /**
   * Get localized region name
   */
  regionName(regionId) {
    return this.t(`region.${regionId}`);
  }

  /**
   * Get localized region description
   */
  regionDesc(regionId) {
    return this.t(`region.${regionId}.desc`);
  }

  /**
   * Format date for current locale
   */
  formatDate(year, monthIdx) {
    return this.t('date.format', year, monthIdx);
  }

  /**
   * Initialize — apply translations on load
   */
  init() {
    this._applyStaticTranslations();
  }
}

// Singleton
const i18n = new I18nManager();
window.i18n = i18n;
