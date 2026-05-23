// ============================================
// 图表模块 — charts.js
// Chart.js 图表渲染
// ============================================

class ChartManager {
  constructor() {
    this.trendChart = null;
    this.cargoChart = null;
    this.deltaChart = null;
    this.comparisonChart = null;
  }

  init() {
    // Set Chart.js defaults for dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    this._initTrendChart();
    this._initCargoChart();
  }

  _initTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    this.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: i18n.t('chart.trend.revenue'),
            data: [],
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderWidth: 2.5,
            pointBackgroundColor: '#667eea',
            pointBorderColor: '#667eea',
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: i18n.t('chart.trend.delta'),
            data: [],
            borderColor: '#06d6a0',
            backgroundColor: 'rgba(6, 214, 160, 0.05)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#06d6a0',
            fill: false,
            tension: 0.4,
            yAxisID: 'y1',
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              padding: 20,
              usePointStyle: true,
              pointStyleWidth: 10
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f0f4ff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 14,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 0) {
                  return `${i18n.t('chart.tooltip.revenue')}: $${formatNumber(context.raw)}`;
                } else {
                  return `${i18n.t('chart.tooltip.delta')}: ${context.raw > 0 ? '+' : ''}${context.raw.toFixed(1)}%`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, font: { size: 11 } }
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              callback: v => '$' + formatNumber(v),
              font: { size: 11 }
            }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              callback: v => v.toFixed(0) + '%',
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  _initCargoChart() {
    const ctx = document.getElementById('cargoChart');
    if (!ctx) return;

    this.cargoChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: CARGO_TYPES.map(c => i18n.cargoName(c.id)),
        datasets: [{
          data: [0, 0, 0, 0, 0, 0],
          backgroundColor: CARGO_TYPES.map(c => c.color + '99'),
          borderColor: CARGO_TYPES.map(c => c.color),
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f0f4ff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: function(context) {
                const value = context.raw;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((value / total) * 100).toFixed(1);
                return `${context.label}: $${formatNumber(value)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Update trend chart with all monthly data
  updateTrendChart(monthlyData) {
    if (!this.trendChart) return;

    const labels = monthlyData.map(d => d.monthLabel);
    const revenues = monthlyData.map(d => d.totalRevenue);
    const deltas = monthlyData.map((d, i) => {
      if (i === 0) return 0;
      const prev = monthlyData[i - 1].totalRevenue;
      return ((d.totalRevenue - prev) / prev) * 100;
    });

    this.trendChart.data.labels = labels;
    this.trendChart.data.datasets[0].data = revenues;
    this.trendChart.data.datasets[1].data = deltas;
    this.trendChart.update('active');
  }

  // Update cargo doughnut chart
  updateCargoChart(cargoData) {
    if (!this.cargoChart) return;

    const data = CARGO_TYPES.map(c => cargoData[c.id]?.revenue || 0);
    this.cargoChart.data.datasets[0].data = data;
    this.cargoChart.update('active');
  }

  // Initialize comparison chart
  initComparisonChart() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    // Destroy existing if any
    if (this.comparisonChart) {
      this.comparisonChart.destroy();
    }

    this.comparisonChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: i18n.t('comparison.actual'),
            data: [],
            borderColor: '#06d6a0',
            backgroundColor: 'rgba(6, 214, 160, 0.12)',
            borderWidth: 3,
            pointBackgroundColor: '#06d6a0',
            pointBorderColor: '#06d6a0',
            pointRadius: 5,
            pointHoverRadius: 9,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: i18n.t('comparison.baseline'),
            data: [],
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.08)',
            borderWidth: 2.5,
            pointBackgroundColor: '#667eea',
            pointBorderColor: '#667eea',
            pointRadius: 4,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderWidth: 3,
            fill: true,
            tension: 0.4,
            borderDash: [6, 4]
          },
          {
            label: i18n.t('comparison.diff'),
            data: [],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#f59e0b',
            fill: false,
            tension: 0.4,
            yAxisID: 'y1',
            borderDash: [3, 3]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              padding: 20,
              usePointStyle: true,
              pointStyleWidth: 10,
              font: { size: 12 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f0f4ff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 16,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: function(context) {
                if (context.datasetIndex <= 1) {
                  return `${context.dataset.label}: $${formatNumber(context.raw)}`;
                } else {
                  const sign = context.raw >= 0 ? '+' : '';
                  return `${i18n.t('comparison.tooltip.diff')}: ${sign}$${formatNumber(context.raw)}`;
                }
              },
              afterBody: function(tooltipItems) {
                if (tooltipItems.length >= 2) {
                  const actual = tooltipItems[0].raw;
                  const baseline = tooltipItems[1].raw;
                  if (baseline > 0) {
                    const pct = ((actual - baseline) / baseline * 100).toFixed(1);
                    return `\n${i18n.t('comparison.tooltip.change')}: ${pct > 0 ? '+' : ''}${pct}%`;
                  }
                }
                return '';
              }
            }
          },
          title: {
            display: true,
            text: i18n.t('comparison.chart.title'),
            color: '#f0f4ff',
            font: { size: 15, weight: 700 },
            padding: { bottom: 20 }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, font: { size: 11 } }
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              callback: v => '$' + formatNumber(v),
              font: { size: 11 }
            },
            title: {
              display: true,
              text: i18n.t('comparison.yAxis'),
              color: '#94a3b8',
              font: { size: 11 }
            }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              callback: v => (v >= 0 ? '+$' : '-$') + formatNumber(Math.abs(v)),
              font: { size: 11 }
            },
            title: {
              display: true,
              text: i18n.t('comparison.yAxis2'),
              color: '#94a3b8',
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // Update comparison chart with revenue history
  updateComparisonChart(revenueHistory) {
    if (!this.comparisonChart) {
      this.initComparisonChart();
    }
    if (!this.comparisonChart) return;

    const labels = revenueHistory.map(d => d.month);
    const actual = revenueHistory.map(d => d.actualRevenue);
    const baseline = revenueHistory.map(d => d.baselineRevenue);
    const diff = revenueHistory.map(d => d.actualRevenue - d.baselineRevenue);

    this.comparisonChart.data.labels = labels;
    this.comparisonChart.data.datasets[0].data = actual;
    this.comparisonChart.data.datasets[1].data = baseline;
    this.comparisonChart.data.datasets[2].data = diff;

    // Color-code points where AI was applied
    const pointColors = revenueHistory.map(d => d.aiApplied ? '#06d6a0' : '#94a3b8');
    const pointSizes = revenueHistory.map(d => d.aiApplied ? 7 : 4);
    this.comparisonChart.data.datasets[0].pointBackgroundColor = pointColors;
    this.comparisonChart.data.datasets[0].pointRadius = pointSizes;

    this.comparisonChart.update('active');
  }

  // Update locale translations dynamically without rebuilding the charts
  updateLocale() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    if (this.trendChart) {
      this.trendChart.data.datasets[0].label = i18n.t('chart.trend.revenue');
      this.trendChart.data.datasets[1].label = i18n.t('chart.trend.delta');
      
      this.trendChart.options.plugins.tooltip.callbacks.label = function(context) {
        if (context.datasetIndex === 0) {
          return `${i18n.t('chart.tooltip.revenue')}: $${formatNumber(context.raw)}`;
        } else {
          return `${i18n.t('chart.tooltip.delta')}: ${context.raw > 0 ? '+' : ''}${context.raw.toFixed(1)}%`;
        }
      };
      this.trendChart.update('active');
    }

    if (this.cargoChart) {
      this.cargoChart.data.labels = CARGO_TYPES.map(c => i18n.cargoName(c.id));
      this.cargoChart.update('active');
    }

    if (this.comparisonChart) {
      this.comparisonChart.data.datasets[0].label = i18n.t('comparison.actual');
      this.comparisonChart.data.datasets[1].label = i18n.t('comparison.baseline');
      this.comparisonChart.data.datasets[2].label = i18n.t('comparison.diff');

      this.comparisonChart.options.plugins.title.text = i18n.t('comparison.chart.title');
      this.comparisonChart.options.scales.y.title.text = i18n.t('comparison.yAxis');
      this.comparisonChart.options.scales.y1.title.text = i18n.t('comparison.yAxis2');

      this.comparisonChart.options.plugins.tooltip.callbacks.label = function(context) {
        if (context.datasetIndex <= 1) {
          return `${context.dataset.label}: $${formatNumber(context.raw)}`;
        } else {
          const sign = context.raw >= 0 ? '+' : '';
          return `${i18n.t('comparison.tooltip.diff')}: ${sign}$${formatNumber(context.raw)}`;
        }
      };

      this.comparisonChart.options.plugins.tooltip.callbacks.afterBody = function(tooltipItems) {
        if (tooltipItems.length >= 2) {
          const actual = tooltipItems[0].raw;
          const baseline = tooltipItems[1].raw;
          if (baseline > 0) {
            const pct = ((actual - baseline) / baseline * 100).toFixed(1);
            return `\n${i18n.t('comparison.tooltip.change')}: ${pct > 0 ? '+' : ''}${pct}%`;
          }
        }
        return '';
      };
      this.comparisonChart.update('active');
    }
  }

  // Download comparison chart as PNG
  downloadComparisonChart() {
    if (!this.comparisonChart) return;

    const canvas = this.comparisonChart.canvas;
    // Create a new canvas with white-ish dark background for export
    const exportCanvas = document.createElement('canvas');
    const padding = 40;
    exportCanvas.width = canvas.width + padding * 2;
    exportCanvas.height = canvas.height + padding * 2 + 60;
    const ctx = exportCanvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Border
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, exportCanvas.width - 8, exportCanvas.height - 8);

    // Draw chart
    ctx.drawImage(canvas, padding, padding);

    // Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      i18n.t('export.footer', new Date().toLocaleString(i18n.lang === 'zh' ? 'zh-CN' : 'en-US')),
      exportCanvas.width / 2,
      exportCanvas.height - 20
    );

    // Download
    const link = document.createElement('a');
    link.download = `CKU-Railway-AI-Comparison-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  destroy() {
    if (this.trendChart) this.trendChart.destroy();
    if (this.cargoChart) this.cargoChart.destroy();
    if (this.comparisonChart) this.comparisonChart.destroy();
  }
}

window.ChartManager = ChartManager;
