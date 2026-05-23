// ============================================
// 地图模块 — map.js
// Leaflet.js 铁路路线可视化
// ============================================

class RailwayMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.routeLayers = {};
    this.stationMarkers = [];
    this.trainMarker = null;
    this.trainAnimInterval = null;
    this.selectedRegion = null;
    this.onRegionSelect = null; // callback

    // Railway route coordinates
    this.stations = [
      { name: '喀什 Kashgar', lat: 39.47, lng: 75.99, region: 'china', major: true },
      { name: '阿图什 Artux', lat: 39.72, lng: 76.17, region: 'china', major: false },
      { name: '吐尔尕特 Torugart', lat: 40.52, lng: 75.34, region: 'china', major: true },
      { name: '阿尔帕 Arpa', lat: 40.70, lng: 74.80, region: 'kyrgyzstan', major: false },
      { name: '纳伦 Naryn', lat: 41.43, lng: 76.00, region: 'kyrgyzstan', major: false },
      { name: '马克马尔 Makmal', lat: 41.25, lng: 73.50, region: 'kyrgyzstan', major: true },
      { name: '贾拉拉巴德 Jalal-Abad', lat: 40.93, lng: 73.00, region: 'kyrgyzstan', major: true },
      { name: '卡拉苏 Kara-Suu', lat: 40.70, lng: 72.85, region: 'kyrgyzstan', major: false },
      { name: '安集延 Andijan', lat: 40.78, lng: 72.34, region: 'uzbekistan', major: true },
      { name: '塔什干 Tashkent', lat: 41.30, lng: 69.28, region: 'uzbekistan', major: true },
    ];

    // Extended route to Europe (simplified)
    this.europeStations = [
      { name: '撒马尔罕 Samarkand', lat: 39.65, lng: 66.96, region: 'europe', major: false },
      { name: '布哈拉 Bukhara', lat: 39.77, lng: 64.42, region: 'europe', major: false },
      { name: '土库曼巴什 Turkmenbashi', lat: 40.05, lng: 52.96, region: 'europe', major: false },
      { name: '巴库 Baku', lat: 40.41, lng: 49.87, region: 'europe', major: false },
      { name: '第比利斯 Tbilisi', lat: 41.72, lng: 44.79, region: 'europe', major: false },
      { name: '伊斯坦布尔 Istanbul', lat: 41.01, lng: 28.98, region: 'europe', major: true },
    ];

    this.regionColors = {
      china: '#ef4444',
      kyrgyzstan: '#f59e0b',
      uzbekistan: '#06d6a0',
      europe: '#667eea'
    };

    this.routeCoords = {
      china: [],
      kyrgyzstan: [],
      uzbekistan: [],
      europe: []
    };
  }

  init() {
    // Initialize map
    this.map = L.map(this.containerId, {
      center: [40.5, 60],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 12,
      worldCopyJump: true
    });

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Dark map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors © CARTO'
    }).addTo(this.map);

    this._buildRouteCoords();
    this._drawRoutes();
    this._addStations();
    this._addTrainMarker();
    this._startTrainAnimation();

    return this;
  }

  _buildRouteCoords() {
    const allStations = [...this.stations, ...this.europeStations];

    // Build region coordinate arrays
    let currentRegion = null;
    allStations.forEach((station, i) => {
      const coord = [station.lat, station.lng];
      if (!this.routeCoords[station.region]) {
        this.routeCoords[station.region] = [];
      }

      // Add to current region
      this.routeCoords[station.region].push(coord);

      // For continuity, add first station of next region to previous region
      if (currentRegion && currentRegion !== station.region) {
        this.routeCoords[currentRegion].push(coord);
      }
      currentRegion = station.region;
    });
  }

  _drawRoutes() {
    const regionOrder = ['china', 'kyrgyzstan', 'uzbekistan', 'europe'];

    regionOrder.forEach(regionId => {
      const coords = this.routeCoords[regionId];
      if (coords.length < 2) return;

      const color = this.regionColors[regionId];

      // Glow effect (wider, more transparent line behind)
      const glow = L.polyline(coords, {
        color: color,
        weight: 8,
        opacity: 0.2,
        smoothFactor: 1.5,
        lineCap: 'round'
      }).addTo(this.map);

      // Main line
      const line = L.polyline(coords, {
        color: color,
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1.5,
        lineCap: 'round',
        dashArray: regionId === 'europe' ? '10, 8' : null
      }).addTo(this.map);

      // Click handler
      line.on('click', () => this._onRegionClick(regionId));
      glow.on('click', () => this._onRegionClick(regionId));

      // Hover effect
      line.on('mouseover', () => {
        line.setStyle({ weight: 6, opacity: 1 });
        glow.setStyle({ weight: 12, opacity: 0.35 });
      });
      line.on('mouseout', () => {
        line.setStyle({ weight: 4, opacity: 0.8 });
        glow.setStyle({ weight: 8, opacity: 0.2 });
      });

      this.routeLayers[regionId] = { line, glow };
    });
  }

  _addStations() {
    const allStations = [...this.stations, ...this.europeStations];

    allStations.forEach(station => {
      if (!station.major) return; // Only show major stations

      const color = this.regionColors[station.region];

      const icon = L.divIcon({
        className: 'station-marker-wrapper',
        html: `<div class="station-marker" style="background:${color};box-shadow:0 0 12px ${color}80"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([station.lat, station.lng], { icon })
        .addTo(this.map);

      // Tooltip
      marker.bindTooltip(station.name, {
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'station-tooltip'
      });

      this.stationMarkers.push(marker);
    });
  }

  _addTrainMarker() {
    const startCoord = [this.stations[0].lat, this.stations[0].lng];
    const icon = L.divIcon({
      className: 'train-marker-wrapper',
      html: '<div class="train-marker">🚂</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    this.trainMarker = L.marker(startCoord, { icon, zIndexOffset: 1000 })
      .addTo(this.map);
  }

  _startTrainAnimation() {
    const allCoords = [];
    const allStations = [...this.stations, ...this.europeStations];
    allStations.forEach(s => allCoords.push([s.lat, s.lng]));

    // Interpolate between stations
    const interpolatedCoords = [];
    for (let i = 0; i < allCoords.length - 1; i++) {
      const steps = 20;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const lat = allCoords[i][0] + (allCoords[i + 1][0] - allCoords[i][0]) * t;
        const lng = allCoords[i][1] + (allCoords[i + 1][1] - allCoords[i][1]) * t;
        interpolatedCoords.push([lat, lng]);
      }
    }

    let idx = 0;
    this.trainAnimInterval = setInterval(() => {
      if (this.trainMarker) {
        this.trainMarker.setLatLng(interpolatedCoords[idx]);
      }
      idx = (idx + 1) % interpolatedCoords.length;
    }, 100);
  }

  _onRegionClick(regionId) {
    this.selectedRegion = regionId;

    // Highlight selected region
    Object.keys(this.routeLayers).forEach(key => {
      const { line, glow } = this.routeLayers[key];
      if (key === regionId) {
        line.setStyle({ weight: 6, opacity: 1 });
        glow.setStyle({ weight: 14, opacity: 0.4 });
      } else {
        line.setStyle({ weight: 3, opacity: 0.4 });
        glow.setStyle({ weight: 6, opacity: 0.1 });
      }
    });

    // Zoom to region
    const coords = this.routeCoords[regionId];
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 7 });
    }

    if (this.onRegionSelect) {
      this.onRegionSelect(regionId);
    }
  }

  resetView() {
    this.map.flyTo([40.5, 60], 4, { duration: 1 });

    // Reset route styles
    Object.keys(this.routeLayers).forEach(key => {
      const { line, glow } = this.routeLayers[key];
      line.setStyle({ weight: 4, opacity: 0.8 });
      glow.setStyle({ weight: 8, opacity: 0.2 });
    });

    this.selectedRegion = null;
  }

  // Update popup content for a region with revenue data
  showRegionPopup(regionId, data) {
    const region = REGIONS.find(r => r.id === regionId);
    if (!region) return;

    const coords = this.routeCoords[regionId];
    const midIdx = Math.floor(coords.length / 2);
    const midCoord = coords[midIdx];

    const localRegionName = i18n.regionName(regionId);
    const localRegionDesc = i18n.regionDesc(regionId);

    const popupContent = `
      <div class="popup-title">${region.emoji} ${localRegionName}</div>
      <div class="popup-stat">
        <span class="label">${i18n.t('popup.section')}</span>
        <span class="value">${localRegionDesc}</span>
      </div>
      <div class="popup-stat">
        <span class="label">${i18n.t('popup.distance')}</span>
        <span class="value">${region.distance}</span>
      </div>
      <div class="popup-stat">
        <span class="label">${i18n.t('popup.monthRevenue')}</span>
        <span class="value" style="color:#06d6a0">$${formatNumber(data.revenue)}</span>
      </div>
      <div class="popup-stat">
        <span class="label">${i18n.t('popup.revenueShare')}</span>
        <span class="value">${(region.revenueShare * 100).toFixed(0)}%</span>
      </div>
    `;

    L.popup()
      .setLatLng(midCoord)
      .setContent(popupContent)
      .openOn(this.map);
  }

  destroy() {
    if (this.trainAnimInterval) {
      clearInterval(this.trainAnimInterval);
    }
    if (this.map) {
      this.map.remove();
    }
  }
}

// Helper
function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

window.RailwayMap = RailwayMap;
window.formatNumber = formatNumber;
