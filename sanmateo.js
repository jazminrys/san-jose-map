fetch('sanmateo.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  })
  .catch(err => console.error('GeoJSON load error:', err));