import json

# dont run again
with open('Neighborhoods.geojson') as f:
    data = json.load(f)

names = [feature['properties']['NAME'] for feature in data['features']]

income_bins_template = {
    "Less than $50,000": False,
    "$50,000 to $74,999": False,
    "$75,000 to $99,999": False,
    "$100,000 to $149,999": False,
    "150,000 to $199,999": False,
    "200,000 or more": False
}

age_bins_template = {
    "Under 5": False,
    "5 to 19": False,
    "20 to 34": False,
    "35 to 64": False,
    "Over 65": False
}

result = {}
for name in names:
    result[name] = {
        "income": income_bins_template.copy(),
        "age": age_bins_template.copy()
    }

with open('demographics.json', 'w') as out:
    json.dump(result, out, indent=2)

print("demographics.json created with empty bins")