const map = L.map('map').setView([37.3382, -121.8863], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let demographics = {};
let geoLayer = null;
let colorMode = 'age'; // default mode

fetch('demographics.json')
  .then(res => res.json())
  .then(data => {
    demographics = data;
    loadGeoJSON();
  });

function setColorMode(mode) {
  colorMode = mode;
  if (geoLayer) {
    geoLayer.clearLayers();
    loadGeoJSON();
  }
}

function loadGeoJSON() {
  fetch('Neighborhoods.geojson')
    .then(res => res.json())
    .then(geojsonData => {
      geoLayer = L.geoJSON(geojsonData, {
        style: featureStyle,
        onEachFeature: onEachFeature
      }).addTo(map);
    });
}

function getAgeColor(percent) {
  if (percent > 30) return "#800026";
  if (percent > 20) return "#BD0026";
  if (percent > 15) return "#E31A1C";
  if (percent > 10) return "#FC4E2A";
  if (percent > 5)  return "#FD8D3C";
  if (percent > 2)  return "#FEB24C";
  return "#FFEDA0";
}

function getIncomeColor(bin) {
  switch (bin) {
    case "200,000 or more": return "#08306b";
    case "150,000 to $199,999": return "#2171b5";
    case "$100,000 to $149,999": return "#4292c6";
    case "$75,000 to $99,999": return "#6baed6";
    case "$50,000 to $74,999": return "#9ecae1";
    case "Less than $50,000": return "#c6dbef";
    default: return "#f7fbff";
  }
}

function getMedianIncomeBin(income) {
  const sortedBins = [
    "Less than $50,000",
    "$50,000 to $74,999",
    "$75,000 to $99,999",
    "$100,000 to $149,999",
    "150,000 to $199,999",
    "200,000 or more"
  ];
  const total = sortedBins.reduce((sum, bin) => sum + (income[bin] || 0), 0);
  let cumulative = 0;
  for (let bin of sortedBins) {
    cumulative += income[bin] || 0;
    if (cumulative >= total / 2) return bin;
  }
  return "N/A";
}

function featureStyle(feature) {
  const name = feature.properties.NAME;
  const demo = demographics[name];

  if (!demo) return { color: "#999", fillColor: "#ccc", fillOpacity: 0.3, weight: 1 };

  const ageTotal = Object.values(demo.age).reduce((sum, val) => sum + val, 0);
  const over65 = demo.age["Over 65"] || 0;
  const percentOver65 = (over65 / ageTotal) * 100;

  const medianBin = getMedianIncomeBin(demo.income);

  const fillColor = colorMode === 'income'
    ? getIncomeColor(medianBin)
    : getAgeColor(percentOver65);

  return {
    color: "#333",
    weight: 1,
    fillColor,
    fillOpacity: 0.6
  };
}

function onEachFeature(feature, layer) {
  const name = feature.properties.NAME;
  const demo = demographics[name];
  if (!demo) return layer.bindPopup(`<strong>${name}</strong><br>No data available.`);

  const ageTotal = Object.values(demo.age).reduce((sum, val) => sum + val, 0);
  const over65 = demo.age["Over 65"] || 0;
  const percentOver65 = ((over65 / ageTotal) * 100).toFixed(1);
  const medianIncome = getMedianIncomeBin(demo.income);

  const popup = `
    <strong>${name}</strong><br>
    💰 <b>Median Income:</b> ${medianIncome}<br>
    👵 <b>% Over Age 65:</b> ${percentOver65}%
  `;
  layer.bindPopup(popup);

  layer.on("mouseover", function () {
    this.setStyle({ weight: 2, fillOpacity: 0.9 });
  });

  layer.on("mouseout", function () {
    this.setStyle({ weight: 1, fillOpacity: 0.6 });
  });
}