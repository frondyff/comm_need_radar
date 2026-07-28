# Spatial Join Validation

Validation snapshot: 2026-07-14

## Boundary Source

- Source: Ville de Montreal, Limites administratives de l'agglomeration
- Source URL: https://donnees.montreal.ca/fr/dataset/9797a946-9da8-41ec-8815-f6b276dec7e9
- License: CC BY 4.0
- Downloaded: 2026-06-23
- Input: `data/raw/boundaries/montreal_boroughs.geojson`, 11 selected official
  administrative polygons in WGS84

## Transformation

Ten project areas map one-to-one to an official administrative polygon. The two
stable IDs inside Villeray-Saint-Michel-Parc-Extension (`A001` Parc Extension and
`A002` Saint-Michel) partition that official polygon using nearest project
centroid in a local equirectangular projection. The outer boundary remains
official; the internal divider is derived and labeled
`centroid_partition_within_official_boundary` in GeoJSON.

This transformation preserves all 12 existing `area_id` values without polygon
overlap. It also matches the previously documented nearest-centroid rule used by
`center_area_lookup.csv`.

## Join Results

| Dataset | Total | Matched once | Unmatched | Multiple matches | Lookup mismatches |
| --- | ---: | ---: | ---: | ---: | ---: |
| scored_area_centroids | 12 | 12 | 0 | 0 | 0 |
| service_centers | 4255 | 2537 | 1718 | 0 | 0 |
| census_tract_centroids | 1004 | 309 | 695 | 0 | 0 |

Polygon pairs with positive-area overlap: **0**.

Every unmatched record is listed in
`data/processed/spatial_join_issues.csv`. Unmatched center and census-tract
centroids fall outside the 11-polygon study area and remain intentionally
unassigned. Multiple matches and center lookup mismatches are release blockers.

## Frontend Payload Decision

- `frontend/public/geo/areas.geojson`: 265,418 bytes raw
- Deterministic gzip size: 71,183 bytes
- Budget: 600,000 bytes raw / 200,000
  bytes gzip

GeoJSON remains appropriate for 12 low-complexity interactive features at this
size. PMTiles or vector tiles are deferred until the product adopts tract-level
or citywide high-resolution geography.

## Limitations

- `A001` and `A002` are operational project areas, not official administrative
  units; their shared divider is derived from the two committed centroids.
- The dataset covers the 11 selected administrative polygons, not the complete
  Montreal CMA, so out-of-study centers and census tracts are expected.
- Point-on-boundary matches are checked explicitly; any point covered by more
  than one polygon fails validation.
