from __future__ import annotations

import csv
from pathlib import Path

AREA_ROWS = [
    {"area_id":"A001","area_name":"Parc Extension","borough_name":"Villeray-Saint-Michel-Parc-Extension","latitude":45.529,"longitude":-73.633,"population":31200,"income_indicator":82,"age_indicator":54,"language_indicator":88,"immigration_indicator":91,"housing_indicator":76},
    {"area_id":"A002","area_name":"Saint-Michel","borough_name":"Villeray-Saint-Michel-Parc-Extension","latitude":45.560,"longitude":-73.610,"population":48600,"income_indicator":78,"age_indicator":62,"language_indicator":72,"immigration_indicator":84,"housing_indicator":69},
    {"area_id":"A003","area_name":"Cote-des-Neiges","borough_name":"Cote-des-Neiges-Notre-Dame-de-Grace","latitude":45.500,"longitude":-73.630,"population":52400,"income_indicator":74,"age_indicator":58,"language_indicator":83,"immigration_indicator":87,"housing_indicator":71},
    {"area_id":"A004","area_name":"Montreal-Nord","borough_name":"Montreal-Nord","latitude":45.600,"longitude":-73.620,"population":43600,"income_indicator":86,"age_indicator":65,"language_indicator":69,"immigration_indicator":78,"housing_indicator":82},
    {"area_id":"A005","area_name":"Hochelaga","borough_name":"Mercier-Hochelaga-Maisonneuve","latitude":45.545,"longitude":-73.545,"population":33300,"income_indicator":67,"age_indicator":50,"language_indicator":32,"immigration_indicator":28,"housing_indicator":73},
    {"area_id":"A006","area_name":"Verdun","borough_name":"Verdun","latitude":45.458,"longitude":-73.570,"population":70400,"income_indicator":48,"age_indicator":45,"language_indicator":26,"immigration_indicator":31,"housing_indicator":52},
    {"area_id":"A007","area_name":"Ahuntsic","borough_name":"Ahuntsic-Cartierville","latitude":45.555,"longitude":-73.660,"population":39600,"income_indicator":42,"age_indicator":72,"language_indicator":38,"immigration_indicator":44,"housing_indicator":40},
    {"area_id":"A008","area_name":"Lachine","borough_name":"Lachine","latitude":45.435,"longitude":-73.690,"population":27800,"income_indicator":53,"age_indicator":57,"language_indicator":29,"immigration_indicator":35,"housing_indicator":55},
    {"area_id":"A009","area_name":"Westmount","borough_name":"Westmount","latitude":45.485,"longitude":-73.596,"population":19800,"income_indicator":15,"age_indicator":46,"language_indicator":18,"immigration_indicator":24,"housing_indicator":20},
    {"area_id":"A010","area_name":"Plateau Mont-Royal","borough_name":"Le Plateau-Mont-Royal","latitude":45.525,"longitude":-73.575,"population":104000,"income_indicator":35,"age_indicator":34,"language_indicator":22,"immigration_indicator":29,"housing_indicator":45},
    {"area_id":"A011","area_name":"Pointe-Saint-Charles","borough_name":"Le Sud-Ouest","latitude":45.478,"longitude":-73.560,"population":16600,"income_indicator":61,"age_indicator":48,"language_indicator":25,"immigration_indicator":30,"housing_indicator":68},
    {"area_id":"A012","area_name":"Riviere-des-Prairies","borough_name":"Riviere-des-Prairies-Pointe-aux-Trembles","latitude":45.645,"longitude":-73.570,"population":32200,"income_indicator":58,"age_indicator":63,"language_indicator":45,"immigration_indicator":50,"housing_indicator":47},
]

SERVICE_ROWS = [
    {"service_id":"S001","service_name":"Parc Extension Food Hub","service_category":"Food Support","address":"Synthetic 101 Bloomfield Ave","latitude":45.531,"longitude":-73.635,"phone":"514-555-0101","website":"https://example.org/food-hub","language":"EN;FR;Other","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S002","service_name":"Saint-Michel Housing Clinic","service_category":"Housing","address":"Synthetic 22 Jarry East","latitude":45.558,"longitude":-73.606,"phone":"514-555-0102","website":"https://example.org/housing-clinic","language":"FR;EN","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S003","service_name":"Cote-des-Neiges Newcomer Centre","service_category":"Newcomer Support","address":"Synthetic 303 Victoria Ave","latitude":45.501,"longitude":-73.628,"phone":"514-555-0103","website":"https://example.org/newcomer","language":"EN;FR;Other","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S004","service_name":"Montreal-Nord Family Resource Centre","service_category":"Family Services","address":"Synthetic 88 Rolland Blvd","latitude":45.602,"longitude":-73.622,"phone":"514-555-0104","website":"https://example.org/family","language":"FR;EN","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S005","service_name":"Hochelaga Community Meals","service_category":"Food Support","address":"Synthetic 44 Ontario East","latitude":45.548,"longitude":-73.548,"phone":"514-555-0105","website":"https://example.org/meals","language":"FR","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S006","service_name":"Verdun Employment Desk","service_category":"Employment","address":"Synthetic 19 Wellington","latitude":45.459,"longitude":-73.567,"phone":"514-555-0106","website":"https://example.org/jobs","language":"FR;EN","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S007","service_name":"Ahuntsic Senior Support","service_category":"Senior Support","address":"Synthetic 710 Fleury","latitude":45.557,"longitude":-73.657,"phone":"514-555-0107","website":"https://example.org/seniors","language":"FR;EN","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S008","service_name":"Lachine Community Access Point","service_category":"General Support","address":"Synthetic 12 Notre-Dame","latitude":45.438,"longitude":-73.686,"phone":"514-555-0108","website":"https://example.org/access","language":"FR;EN","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S009","service_name":"Downtown Legal Aid Satellite","service_category":"Legal Aid","address":"Synthetic 900 Rene-Levesque","latitude":45.500,"longitude":-73.570,"phone":"514-555-0109","website":"https://example.org/legal","language":"FR;EN","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S010","service_name":"Sud-Ouest Housing Desk","service_category":"Housing","address":"Synthetic 61 Centre St","latitude":45.480,"longitude":-73.562,"phone":"514-555-0110","website":"https://example.org/sudhousing","language":"FR;EN","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S011","service_name":"East Island Food Pantry","service_category":"Food Support","address":"Synthetic 17 Perras Blvd","latitude":45.642,"longitude":-73.565,"phone":"514-555-0111","website":"https://example.org/eastfood","language":"FR","source_name":"Synthetic municipal open data","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S012","service_name":"Plateau Youth And Family Centre","service_category":"Family Services","address":"Synthetic 25 Mont-Royal","latitude":45.523,"longitude":-73.580,"phone":"514-555-0112","website":"https://example.org/youth","language":"FR;EN","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S013","service_name":"Cartierville Newcomer Desk","service_category":"Newcomer Support","address":"Synthetic 400 Gouin West","latitude":45.535,"longitude":-73.700,"phone":"514-555-0113","website":"https://example.org/cartier","language":"FR;EN;Other","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
    {"service_id":"S014","service_name":"West End Mental Health Drop-in","service_category":"Mental Health","address":"Synthetic 222 Sherbrooke West","latitude":45.505,"longitude":-73.585,"phone":"514-555-0114","website":"https://example.org/mental-health","language":"FR;EN","source_name":"Synthetic 211-like directory","source_url":"https://example.org","last_checked_date":"2026-06-11"},
]


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_raw_sources(raw_dir: Path) -> None:
    write_csv(raw_dir / "synthetic_area_profiles.csv", AREA_ROWS)
    write_csv(raw_dir / "synthetic_services.csv", SERVICE_ROWS)
