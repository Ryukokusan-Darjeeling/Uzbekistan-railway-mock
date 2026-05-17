// ============================================
// 模拟引擎 — simulation.js
// 中吉乌铁路经济收益模拟
// ============================================

const CARGO_TYPES = [
  {
    id: 'electronics',
    name: '电子产品',
    nameEn: 'Electronics',
    emoji: '📱',
    basePrice: 8500,    // $/吨
    minVolume: 2000,
    maxVolume: 5000,
    // 季节系数 [1月-12月]
    seasonFactor: [0.9, 0.85, 0.95, 1.0, 1.0, 1.1, 1.05, 1.0, 1.15, 1.1, 1.2, 1.3],
    growthRate: 0.02,   // 月增长率
    color: '#667eea',
    description: '智能手机、笔记本电脑、平板等'
  },
  {
    id: 'textiles',
    name: '纺织品',
    nameEn: 'Textiles',
    emoji: '👔',
    basePrice: 2200,
    minVolume: 5000,
    maxVolume: 12000,
    seasonFactor: [0.8, 0.8, 1.1, 1.2, 1.0, 0.9, 0.85, 0.9, 1.2, 1.15, 1.1, 0.9],
    growthRate: 0.015,
    color: '#ec4899',
    description: '服装、面料、家纺用品'
  },
  {
    id: 'machinery',
    name: '机械设备',
    nameEn: 'Machinery',
    emoji: '⚙️',
    basePrice: 6000,
    minVolume: 3000,
    maxVolume: 8000,
    seasonFactor: [0.95, 0.9, 1.0, 1.05, 1.1, 1.05, 1.0, 0.95, 1.0, 1.05, 1.0, 0.9],
    growthRate: 0.018,
    color: '#f59e0b',
    description: '工程机械、零部件、工具'
  },
  {
    id: 'agriculture',
    name: '农产品',
    nameEn: 'Agricultural Products',
    emoji: '🌾',
    basePrice: 1500,
    minVolume: 8000,
    maxVolume: 20000,
    seasonFactor: [0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.0, 0.8],
    growthRate: 0.01,
    color: '#06d6a0',
    description: '粮食、水果、干果、茶叶'
  },
  {
    id: 'energy',
    name: '新能源产品',
    nameEn: 'New Energy Products',
    emoji: '🔋',
    basePrice: 12000,
    minVolume: 1000,
    maxVolume: 4000,
    seasonFactor: [0.95, 0.9, 1.0, 1.05, 1.1, 1.15, 1.2, 1.15, 1.1, 1.05, 1.0, 0.95],
    growthRate: 0.035,  // 增长最快
    color: '#22d3ee',
    description: '锂电池、太阳能板、储能设备'
  },
  {
    id: 'consumer',
    name: '日用消费品',
    nameEn: 'Consumer Goods',
    emoji: '🛒',
    basePrice: 3000,
    minVolume: 4000,
    maxVolume: 10000,
    seasonFactor: [0.85, 0.8, 0.9, 0.95, 1.0, 1.0, 0.95, 0.9, 1.0, 1.05, 1.15, 1.3],
    growthRate: 0.012,
    color: '#a855f7',
    description: '家具、塑料制品、小家电'
  }
];

// 铁路区段
const REGIONS = [
  {
    id: 'china',
    name: '中国段',
    nameEn: 'China Section',
    emoji: '🇨🇳',
    revenueShare: 0.30,
    description: '喀什 → 吐尔尕特',
    distance: '213 km',
    color: '#ef4444'
  },
  {
    id: 'kyrgyzstan',
    name: '吉尔吉斯斯坦段',
    nameEn: 'Kyrgyzstan Section',
    emoji: '🇰🇬',
    revenueShare: 0.25,
    description: '吐尔尕特 → 贾拉拉巴德',
    distance: '300 km',
    color: '#f59e0b'
  },
  {
    id: 'uzbekistan',
    name: '乌兹别克斯坦段',
    nameEn: 'Uzbekistan Section',
    emoji: '🇺🇿',
    revenueShare: 0.15,
    description: '贾拉拉巴德 → 安集延',
    distance: '60 km',
    color: '#06d6a0'
  },
  {
    id: 'europe',
    name: '欧洲连线',
    nameEn: 'Europe Connection',
    emoji: '🇪🇺',
    revenueShare: 0.30,
    description: '安集延 → 欧洲市场',
    distance: '~4,000 km',
    color: '#667eea'
  }
];

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

const MONTH_NAMES_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

class SimulationEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentYear = 2026;
    this.currentMonth = 0; // 0-indexed (0 = January)
    this.totalMonthsSimulated = 0;
    this.monthlyData = [];  // Array of monthly records
    this.totalRevenue = 0;

    // AI adjustment tracking
    this.aiEnabled = false;
    this.aiAdjustments = {};  // { cargoId: multiplier } e.g. { electronics: 1.15, textiles: 0.85 }
    this.revenueHistory = [];  // { month, label, actualRevenue, aiApplied }
    // Store a baseline simulation (without AI) for comparison
    this.baselineRNG = null;
    this.baselineRevHistory = [];  // revenue if AI was never applied

    // Generate first month's data
    this._generateMonthData();
  }

  getCurrentDateStr() {
    return `${this.currentYear}年${MONTH_NAMES[this.currentMonth]}`;
  }

  getCurrentDateStrEn() {
    return `${MONTH_NAMES_EN[this.currentMonth]} ${this.currentYear}`;
  }

  getMonthIndex() {
    return this.currentMonth;
  }

  getTotalMonths() {
    return this.totalMonthsSimulated;
  }

  // Set AI enabled state
  setAIEnabled(enabled) {
    this.aiEnabled = enabled;
  }

  // Set AI adjustments from advice (cargo volume multipliers)
  setAIAdjustments(adjustments) {
    this.aiAdjustments = adjustments || {};
  }

  // Advance to next month
  advanceMonth() {
    this.currentMonth++;
    if (this.currentMonth >= 12) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this._generateMonthData();
    return this.getLatestMonthData();
  }

  // Simple seeded random for consistent baseline comparison
  _seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Generate data for current month
  _generateMonthData() {
    const monthIdx = this.currentMonth;
    const monthsFromStart = this.totalMonthsSimulated;
    const record = {
      year: this.currentYear,
      month: monthIdx,
      monthLabel: `${this.currentYear}.${String(monthIdx + 1).padStart(2, '0')}`,
      monthLabelCN: `${this.currentYear}年${MONTH_NAMES[monthIdx]}`,
      cargo: {},
      regionRevenue: {},
      totalRevenue: 0,
      totalVolume: 0,
      aiApplied: this.aiEnabled && Object.keys(this.aiAdjustments).length > 0
    };

    let baselineRevenue = 0;

    // Calculate revenue for each cargo type
    CARGO_TYPES.forEach((cargo, idx) => {
      const season = cargo.seasonFactor[monthIdx];
      const growth = Math.pow(1 + cargo.growthRate, monthsFromStart);
      const randVol = Math.random();
      const baseVolume = cargo.minVolume + randVol * (cargo.maxVolume - cargo.minVolume);
      let volume = Math.round(baseVolume * season * growth);

      // Baseline volume (without AI adjustments)
      const baselineVol = volume;

      // Apply AI adjustments if enabled
      if (record.aiApplied && this.aiAdjustments[cargo.id]) {
        const multiplier = this.aiAdjustments[cargo.id];
        volume = Math.round(volume * multiplier);
      }

      // Price fluctuation ±15%
      const priceFluctuation = 0.85 + Math.random() * 0.30;
      const price = Math.round(cargo.basePrice * priceFluctuation * growth * 0.5); // scale down for realism
      const revenue = volume * price;
      const baselineRev = baselineVol * price;

      record.cargo[cargo.id] = {
        volume,
        price,
        revenue,
        name: cargo.name,
        emoji: cargo.emoji,
        aiAdjusted: record.aiApplied && !!this.aiAdjustments[cargo.id]
      };

      record.totalRevenue += revenue;
      record.totalVolume += volume;
      baselineRevenue += baselineRev;
    });

    // Distribute revenue across regions
    REGIONS.forEach(region => {
      record.regionRevenue[region.id] = {
        revenue: Math.round(record.totalRevenue * region.revenueShare),
        name: region.name,
        emoji: region.emoji
      };
    });

    this.totalRevenue += record.totalRevenue;
    this.monthlyData.push(record);
    this.totalMonthsSimulated++;

    // Track revenue history for comparison
    this.revenueHistory.push({
      month: record.monthLabel,
      label: record.monthLabelCN,
      actualRevenue: record.totalRevenue,
      baselineRevenue: record.aiApplied ? baselineRevenue : record.totalRevenue,
      aiApplied: record.aiApplied
    });

    return record;
  }

  getLatestMonthData() {
    return this.monthlyData[this.monthlyData.length - 1];
  }

  getPreviousMonthData() {
    if (this.monthlyData.length < 2) return null;
    return this.monthlyData[this.monthlyData.length - 2];
  }

  getMonthlyDelta() {
    const current = this.getLatestMonthData();
    const previous = this.getPreviousMonthData();
    if (!previous) return { percentage: 0, amount: 0 };

    const amount = current.totalRevenue - previous.totalRevenue;
    const percentage = ((amount / previous.totalRevenue) * 100);
    return { percentage, amount };
  }

  getAllMonthlyData() {
    return this.monthlyData;
  }

  getMonthData(index) {
    return this.monthlyData[index] || null;
  }

  // Get revenue comparison history for chart export
  getRevenueComparisonData() {
    return this.revenueHistory;
  }

  // Get summary for AI advisor
  getSimulationSummary() {
    const latest = this.getLatestMonthData();
    const delta = this.getMonthlyDelta();
    const cargoPerformance = [];

    CARGO_TYPES.forEach(cargo => {
      const currentData = latest.cargo[cargo.id];
      const prevMonth = this.getPreviousMonthData();
      let trend = 'N/A';
      if (prevMonth) {
        const prevRev = prevMonth.cargo[cargo.id].revenue;
        const change = ((currentData.revenue - prevRev) / prevRev * 100).toFixed(1);
        trend = `${change > 0 ? '+' : ''}${change}%`;
      }
      cargoPerformance.push({
        name: cargo.name,
        nameEn: cargo.nameEn,
        id: cargo.id,
        revenue: currentData.revenue,
        volume: currentData.volume,
        trend
      });
    });

    // Sort by revenue descending
    cargoPerformance.sort((a, b) => b.revenue - a.revenue);

    return {
      currentDate: this.getCurrentDateStr(),
      totalRevenue: this.totalRevenue,
      monthRevenue: latest.totalRevenue,
      delta,
      cargoPerformance,
      nextMonth: MONTH_NAMES[(this.currentMonth + 1) % 12],
      nextMonthIndex: (this.currentMonth + 1) % 12,
      monthsSimulated: this.totalMonthsSimulated
    };
  }
}

// Export for use
window.SimulationEngine = SimulationEngine;
window.CARGO_TYPES = CARGO_TYPES;
window.REGIONS = REGIONS;
window.MONTH_NAMES = MONTH_NAMES;
window.MONTH_NAMES_EN = MONTH_NAMES_EN;
