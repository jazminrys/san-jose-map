const map = L.map('map').setView([37.3382, -121.8863], 11); // JavaScript library for interactive maps

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
 }).addTo(map);

let demographics = {};
let geoLayer = null;
let colorMode = 'age'; 
let groups = {};  
let showGroups = true; // true = show groups, false = show individuals

fetch('groups.json')
 .then(res=> res.json())
 .then( groupData  => { 
     groups = groupData;
     return fetch('demographics.json');
    })
       .then(res => res.json())
       .then(data => {
  demographics = data;
  loadGeoJSON(showGroups);
});
function setColorMode(mode) { //switching between tabs
   colorMode = mode;
   if (geoLayer) {
     geoLayer.clearLayers();
     loadGeoJSON();
  }
}

function loadGeoJSON(showGroupsMode = true) {
  fetch('Neighborhoods.geojson')
    .then(res => res.json())
    .then(geojsonData => {
      const features = geojsonData.features;
      let usedNames = new Set();
      let mergedFeatures = [];
      if (showGroupsMode) {
        // Add merged group features
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
        // Add ungrouped neighborhoods
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
   if (percent > 5)  return "#9ecae1";
   if (percent > 2)  return "#c6dbef";
   return "#d9ecff";
}

function getIncomeColor(bin) {
   switch (bin) {
     case "200,000 or more": return "#b05e00";
     case "150,000 to $199,999": return "#e18c0d";
     case "$100,000 to $149,999": return "#f5a623";
     case "$75,000 to $99,999": return "#fbc75d";
     case "$50,000 to $74,999": return "#fde7a3";
     case "Less than $50,000": return "#fff5d6";
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
   const merged = {income: {}, age: {}};
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
function featureStyle(feature) { //style the features
   const name = feature.properties.NAME;
   const isGroup = groups.hasOwnProperty(name);
   const demo = isGroup ? mergeDemographics(new Set(groups[name]), demographics) : demographics[name];
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

function onEachFeature(feature, layer) { // calculate percentage of old people 
   const name = feature.properties.NAME;
   const isGroup = groups.hasOwnProperty(name);
   const demo = isGroup ? mergeDemographics(new Set(groups[name]), demographics) : demographics[name];
   if (!demo) return layer.bindPopup(`<strong>${name}</strong><br>No data available.`);

   const ageTotal = Object.values(demo.age).reduce((sum, val) => sum + val, 0);
   const over65 = demo.age["Over 65"] || 0;
   const percentOver65 = ((over65 / ageTotal) * 100).toFixed(1);
   const medianIncome = getMedianIncomeBin(demo.income);

   const popup = `
     <strong>${name}</strong><br>
     <b> Median Income:</b> ${medianIncome}<br>
     <b>% Over Age 65:</b> ${percentOver65}% `;
   layer.bindPopup(popup);
   layer.on("mouseover", function () {
     this.setStyle({ weight: 2, fillOpacity: 0.9 });
  });
   layer.on("mouseout", function () {
     this.setStyle({ weight: 1, fillOpacity: 0.6 });
  });
}

map.on('zoomend', function() {
  const zoom = map.getZoom();
  let shouldShowGroups = zoom < 13; // adjust threshold as needed
  if (shouldShowGroups !== showGroups) {
    showGroups = shouldShowGroups;
    if (geoLayer) geoLayer.clearLayers();
    loadGeoJSON(showGroups);
  }
});

