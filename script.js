const map = L.map('map').setView([37.3382, -121.8863], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let demographics = {};
let geoLayer = null;
let colorMode = 'age'; 
let groups = {};  
let showGroups = true;
let selectedNeighborhoods = new Set();

fetch('groups.json')
  .then(res => res.json())
  .then(groupData => { 
    groups = groupData;
    return fetch('demographics.json');
  })
  .then(res => res.json())
  .then(data => {
    demographics = data;
    loadGeoJSON(showGroups);
  });

function setColorMode(mode) {
  colorMode = mode;
  if (geoLayer) geoLayer.clearLayers();
  loadGeoJSON(showGroups);
  updateLegend();
}

function loadGeoJSON(showGroupsMode = true) {
  fetch('Neighborhoods.geojson')
    .then(res => res.json())
    .then(geojsonData => {
      const features = geojsonData.features;
      let usedNames = new Set();
      let mergedFeatures = [];
      if (showGroupsMode) {
        for (const [groupName, memberNames] of Object.entries(groups)) {
          const matches = features.filter(f => memberNames.includes(f.properties.NAME));
          usedNames = new Set([...usedNames, ...memberNames]);
          if (matches.length === 0) continue;
          let merged = matches[0];
          for (let i = 1; i < matches.length; i++) {
            merged = turf.union(merged, matches[i]);
          }
          merged.properties.NAME = groupName;
          mergedFeatures.push(merged);
        }
        const ungrouped = features.filter(f => !usedNames.has(f.properties.NAME));
        mergedFeatures = mergedFeatures.concat(ungrouped);
        geoLayer = L.geoJSON({ type: "FeatureCollection", features: mergedFeatures }, {
          style: featureStyle,
          onEachFeature: onEachFeature
        }).addTo(map);
      } else {
        geoLayer = L.geoJSON({ type: "FeatureCollection", features: features }, {
          style: featureStyle,
          onEachFeature: onEachFeature
        }).addTo(map);
      }
    });
}

function getAgeColor(percent) {
  if (percent > 30) return "#08306b";
  if (percent > 20) return "#2171b5";
  if (percent > 15) return "#4292c6";
  if (percent > 10) return "#6baed6";
  if (percent > 5) return "#9ecae1";
  if (percent > 2) return "#c6dbef";
  return "#d9ecff";
}

function getIncomeColor(bin) {
  switch (bin) {
    case "Less than $50,000": return "#fff5d6";    
    case "$50,000 to $74,999": return "#fde7a3";  
    case "$75,000 to $99,999": return "#fbc75d";  
    case "$100,000 to $149,999": return "#f5a623"; 
    case "$150,000 to $199,999": return "#e18c0d"; 
    case "$200,000 or more": return "#b05e00";   
    default: return "#f2efe7";                    
  }
}

function getMedianIncomeBin(income) {
  const sortedBins = [
    "Less than $50,000",
    "$50,000 to $74,999",
    "$75,000 to $99,999",
    "$100,000 to $149,999",
    "$150,000 to $199,999",
    "$200,000 or more"
  ];
  const total = sortedBins.reduce((sum, bin) => sum + (income[bin] || 0), 0);
  let cumulative = 0;
  for (let bin of sortedBins) {
    cumulative += income[bin] || 0;
    if (cumulative >= total/2) return bin;
  }
  return "N/A";
}

function mergeDemographics(groupSet, data) {
  const merged = { income: {}, age: {} };
  const keysIncome = Object.keys(data[Array.from(groupSet)[0]].income);
  const keysAge = Object.keys(data[Array.from(groupSet)[0]].age);
  for (const key of keysIncome) {
    merged.income[key] = Array.from(groupSet).reduce((sum, name) => sum + (data[name].income[key] || 0), 0);
  }
  for (const key of keysAge) {
    merged.age[key] = Array.from(groupSet).reduce((sum, name) => sum + (data[name].age[key] || 0), 0);
  }
  return merged;
}

function featureStyle(feature) {
  const name = feature.properties.NAME;
  const isGroup = groups.hasOwnProperty(name);
  const demo = isGroup ? mergeDemographics(new Set(groups[name]), demographics) : demographics[name];
  if (!demo) return { color: "#999", fillColor: "#ccc", fillOpacity: 0.3, weight: 1 };
  const ageTotal = Object.values(demo.age).reduce((sum, val) => sum + val, 0);
  const over65 = demo.age["Over 65"] || 0;
  const percentOver65 = (over65 / ageTotal) * 100;
  const medianBin = getMedianIncomeBin(demo.income);
  const fillColor = colorMode === 'income' ? getIncomeColor(medianBin) : getAgeColor(percentOver65);
  return {
    color: "#333",
    weight: 1,
    fillColor,
    fillOpacity: 0.6
  };
}

function onEachFeature(feature, layer) {
  const name = feature.properties.NAME;
  const isGroup = groups.hasOwnProperty(name);
  const demo = isGroup ? mergeDemographics(new Set(groups[name]), demographics) : demographics[name];

  if (!demo || !demo.age || !demo.income) {
    layer.bindPopup(`<strong>${name}</strong><br>No information on neighborhood available`);
  } else {
    const ageTotal = Object.values(demo.age).reduce((sum, val) => sum + val, 0);
    const over65 = demo.age["Over 65"] || 0;
    const percentOver65 = ageTotal > 0 ? ((over65 / ageTotal) * 100).toFixed(1) : "N/A";
    const medianIncome = getMedianIncomeBin(demo.income);
    layer.bindPopup(`<strong>${name}</strong><br><b>Median Income:</b> ${medianIncome}<br><b>% Over Age 65:</b> ${percentOver65}%`);
  }

  layer.on("click", function (e) {
  
    if (selectedNeighborhoods.has(name)) {
      selectedNeighborhoods.delete(name);
      this.setStyle({ weight: 1, fillOpacity: 0.6 }); 
    } else {
      selectedNeighborhoods.add(name);
      this.setStyle({ weight: 3, fillOpacity: 0.9 }); 
    }
    updateSidebarForSelection();
  });

  layer.on("mouseover", function () {
    this.setStyle({ weight: 2, fillOpacity: 0.9 });
  });
  layer.on("mouseout", function () {
    this.setStyle({ weight: 1, fillOpacity: 0.6 });
  });
}

map.on('zoomend', function() {
  const zoom = map.getZoom();
  let shouldShowGroups = zoom < 13;
  if (shouldShowGroups !== showGroups) {
    showGroups = shouldShowGroups;
    if (geoLayer) geoLayer.clearLayers();
    loadGeoJSON(showGroups);
  }
});

const legend = L.control({ position: 'bottomright' });
legend.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = '';
  return div;
};
legend.addTo(map);
updateLegend();

function updateLegend() {
  const div = document.querySelector('.legend');
  if (!div) return;

  if (colorMode === 'income') {
    div.innerHTML = `
      <b>Median Income</b><br>
      <i style="background:#b05e00"></i> $200,000+<br>
      <i style="background:#e18c0d"></i> $150,000–$199,999<br>
      <i style="background:#f5a623"></i> $100,000–$149,999<br>
      <i style="background:#fbc75d"></i> $75,000–$99,999<br>
      <i style="background:#fde7a3"></i> $50,000–$74,999<br>
      <i style="background:#fff5d6"></i> &lt; $50,000
    `;
  } else {
    div.innerHTML = `
      <b>% Over Age 65+</b><br>
      <i style="background:#08306b"></i> 30%+<br>
      <i style="background:#2171b5"></i> 20–30%<br>
      <i style="background:#4292c6"></i> 15–20%<br>
      <i style="background:#6baed6"></i> 10–15%<br>
      <i style="background:#9ecae1"></i> 5–10%<br>
      <i style="background:#c6dbef"></i> 2–5%<br>
      <i style="background:#d9ecff"></i> &lt;2%
    `;
  }
}

function updateSidebarForSelection() {
  const sidebar = document.getElementById('sidebar');
  if (selectedNeighborhoods.size === 0) {
    sidebar.innerHTML = "<p>Select neighborhoods to see combined stats.</p>";
    sidebar.style.display = 'block';
    return;
  }
 
  let merged = { income: {}, age: {} };
  let first = true;
  for (const name of selectedNeighborhoods) {
    const isGroup = groups.hasOwnProperty(name);
    const demo = isGroup ? mergeDemographics(new Set(groups[name]), demographics) : demographics[name];
    if (!demo) continue;
    if (first) {
      merged.income = { ...demo.income };
      merged.age = { ...demo.age };
      first = false;
    } else {
      for (const k in demo.income) merged.income[k] = (merged.income[k] || 0) + (demo.income[k] || 0);
      for (const k in demo.age) merged.age[k] = (merged.age[k] || 0) + (demo.age[k] || 0);
    }
  }
 
  const ageTotal = Object.values(merged.age).reduce((sum, val) => sum + val, 0);
  const over65 = merged.age["Over 65"] || 0;
  const percentOver65 = ageTotal > 0 ? ((over65 / ageTotal) * 100).toFixed(1) : "N/A";
  const medianIncome = getMedianIncomeBin(merged.income);


  let html = `<button id="closeSidebar" style="float:right;font-size:1.2em;">&times;</button>`;
  html += `<h2>${[...selectedNeighborhoods].join(", ")}</h2>`;
  html += `<p><b>Median Income:</b> ${medianIncome}</p>`;
  html += `<p><b>Percent of Population Age 65+:</b> ${percentOver65}%</p>`;
  html += `<p><b>Total Population:</b> ${ageTotal.toLocaleString()}</p>`; // <-- Add this line here
  html += `<h3>Income</h3><ul>`;
  const incomeTotal = Object.values(merged.income).reduce((sum, val) => sum + val, 0);
  for (const [bin, val] of Object.entries(merged.income)) {
    const percent = incomeTotal > 0 ? ((val / incomeTotal) * 100).toFixed(1) : "N/A";
    html += `<li>${bin}: ${val} &asymp; ${percent}%</li>`;
  }
  html += `</ul><h3>Age</h3><ul>`;
  for (const [age, val] of Object.entries(merged.age)) {
    const percent = ageTotal > 0 ? ((val / ageTotal) * 100).toFixed(1) : "N/A";
    html += `<li>${age}: ${val} &asymp; ${percent}%</li>`;
  }
  html += `</ul>`;
  html += `<div style="margin-bottom:1em;">`;
  for (const name of selectedNeighborhoods) {
    html += `<span style="display:inline-block;background:#eee;padding:4px 8px;margin:2px 4px 2px 0;border-radius:12px;">
      ${name}
      <button class="remove-neigh" data-name="${name}" style="margin-left:6px;border:none;background:none;color:#c00;font-weight:bold;cursor:pointer;">&times;</button>
    </span>`;
  }
  html += `</div>`;
  sidebar.innerHTML = html;
  sidebar.style.display = 'block';
  document.getElementById('closeSidebar').onclick = function() {
    sidebar.style.display = 'none';
    selectedNeighborhoods.clear();
    geoLayer.eachLayer(l => l.setStyle({ weight: 1, fillOpacity: 0.6 }));
  };

  sidebar.querySelectorAll('.remove-neigh').forEach(btn => {
    btn.onclick = function() {
      const name = this.getAttribute('data-name');
      selectedNeighborhoods.delete(name);
      geoLayer.eachLayer(l => {
        if (l.feature && l.feature.properties && l.feature.properties.NAME === name) {
          l.setStyle({ weight: 1, fillOpacity: 0.6 });
        }
      });
      updateSidebarForSelection();
    };
  });

}