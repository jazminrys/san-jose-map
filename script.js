const map = L.map('map').setView([37.3382, -121.8863], 11); // JavaScript library for interactive maps

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
 }).addTo(map);

let demographics = {};
let geoLayer = null;
let colorMode = 'age'; 
let groups = {};  

fetch('groups.json')
 .then(res=> res.json())
 .then( groupData  => { 
     groups = groupData;
     return fetch('demographics.json');
    })
       .then(res => res.json())
       .then(data => {
         demographics = data;
         loadGeoJSON();
  });
function setColorMode(mode) { //switching between tabs
   colorMode = mode;
   if (geoLayer) {
     geoLayer.clearLayers();
     loadGeoJSON();
  }
}

function loadGeoJSON() { //neighborhood dataset 
  fetch('Neighborhoods.geojson')
     .then(res => res.json())
     .then(geojsonData => {
       const features = geojsonData.features;
       let usedNames = new Set();
       let mergedFeatures = [];
       for (const [ groupName, memberNames ] of Object.entries(groups)) {
         const matches = features.filter(f => memberNames.includes(f.properties.NAME)); 
         usedNames = new Set([...usedNames, ...memberNames]);
         if(matches.length === 0) continue; //skip if no matches
         let merged = matches[0];
         for (let i = 1; i < matches.length; i++) {
           merged = turf.union(merged, matches[i]); //merge features
        }
         merged.properties.NAME = groupName; //set name of merged neighborhood
         mergedFeatures.push(merged);
      }
       const others = features.filter(f => !usedNames.has(f.properties.NAME)); //get neighborhoods not in groups
       const finalFeatures = [...others, ...mergedFeatures,];
         geoLayer = L.geoJSON({type: "FeatureCollection", features: finalFeatures }, {
           style: featureStyle,
           onEachFeature: onEachFeature
        }).addTo(map);
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
     case "200,000 or more": return "#ffd700";
     case "150,000 to $199,999": return "#ffec8b";
     case "$100,000 to $149,999": return "#fffacd";
     case "$75,000 to $99,999": return "#ffffe0";
     case "$50,000 to $74,999": return "#fafad2";
     case "Less than $50,000": return "#fafad2";
     default: return "#FFEDA0";
  }
}

function getMostCommonIncome(income) {
   let maxBin = null;
   let maxValue = -1;
   for (const [bin, value] of Object.entries(income)) {
     if (value > maxValue) {
       maxValue = value;
       maxBin = bin;
     }
   }
   return maxBin || "N/A";
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
   const medianBin = getMostCommonIncome(demo.income);
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
   const commonIncome = getMostCommonIncome(demo.income);

   const popup = `
     <strong>${name}</strong><br>
     <b>Income:</b> ${commonIncome}<br>
     <b>% Over Age 65:</b> ${percentOver65}%
  `;
   layer.bindPopup(popup);

   layer.on("mouseover", function () {
     this.setStyle({ weight: 2, fillOpacity: 0.9 });
  });

   layer.on("mouseout", function () {
     this.setStyle({ weight: 1, fillOpacity: 0.6 });
  });
}

