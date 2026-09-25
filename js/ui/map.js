// ============================================
// ui/map.js — 可缩放地图 + 商路（只读 engine 状态）
// 底图：OpenStreetMap 现代栅格瓦片（可缩放、清晰、稳定）
// 技术：Leaflet
// 商路节点/连线：Leaflet 图层叠加
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;

  // 默认视图：聚焦欧亚商路（汉口 → 恰克图）
  const DEFAULT_CENTER = [42.0, 112.0];
  const DEFAULT_ZOOM = 4;

  const MapUI = {
    _map: null,
    _routeLayers: [],
    _fitted: false,

    // ---- 初始化地图（首次调用） ----
    init(container) {
      if (this._map) return;

      const map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 2,
        maxZoom: 13,
        zoomControl: true,
        attributionControl: true
      });
      this._map = map;

      // 底图：高德道路图（大陆网络直连可达，中文标注；OSM 官方瓦片在部分网络会 access block）
      // 注：高德为 GCJ-02 坐标系，存在数百米偏移；省级视野（zoom 4-6）下对商路展示影响可忽略
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        maxZoom: 18,
        subdomains: '1234',
        attribution: '&copy; 高德地图'
      }).addTo(map);
    },

    // ---- 渲染商路（节点 + 连线） ----
    renderRoutes(state) {
      if (!this._map) return;

      // 清除旧图层
      this._routeLayers.forEach(l => this._map.removeLayer(l));
      this._routeLayers = [];

      const cities = state.cities;
      const routes = state.tradeLine.routes;

      // 连线
      routes.forEach((r) => {
        const latlngs = r.path
          .map(id => cities.find(c => c.id === id))
          .filter(Boolean)
          .map(c => [c.lat, c.lng]);

        const color = r.id === 'land_main' ? '#8B3A1A' : '#43B3AE';
        const dash = r.id === 'land_main' ? null : '6,4';

        const line = L.polyline(latlngs, {
          color,
          weight: 3,
          opacity: 0.9,
          dashArray: dash
        }).addTo(this._map);
        this._routeLayers.push(line);
      });

      // 节点：用 circleMarker（矢量圆点，锚点精确在经纬度上，连线自动穿过圆心）
      cities.forEach((c) => {
        const isBorder = c.type === 'border';
        const color = isBorder ? '#B87333' : '#3C2415';

        const dot = L.circleMarker([c.lat, c.lng], {
          radius: 6,
          color: '#FFF8E7',
          weight: 2,
          fillColor: color,
          fillOpacity: 1
        }).addTo(this._map);
        this._routeLayers.push(dot);

        // 城市名标签（permanent tooltip，固定在节点上方）
        const label = L.tooltip({
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'cku2-node-label'
        }).setContent(c.name).setLatLng([c.lat, c.lng]).addTo(this._map);
        this._routeLayers.push(label);

        // 悬浮提示（角色说明）
        dot.bindTooltip(`${c.name}（${c.role}）`, { direction: 'top', offset: [0, -8] });
      });

      // 自适应视图（仅首次）
      if (!this._fitted) {
        const allLatLngs = cities.map(c => [c.lat, c.lng]);
        if (allLatLngs.length) {
          this._map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 6 });
        }
        this._fitted = true;
      }
    },

    // ---- 主渲染入口（app.js 调用） ----
    render(container, state) {
      this.init(container);
      this.renderRoutes(state);
    }
  };

  global.CKUMapUI = MapUI;

})(typeof window !== 'undefined' ? window : globalThis);
