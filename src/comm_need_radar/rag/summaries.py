from __future__ import annotations


def area_summary_en(area_name: str, vulnerability: float, access: float, drivers: str) -> str:
    if vulnerability >= 70 and access < 55:
        emphasis = "shows elevated need and comparatively limited nearby service access"
    elif vulnerability >= 60:
        emphasis = "shows above-average social need"
    elif access < 50:
        emphasis = "has weaker nearby service access than many comparison areas"
    else:
        emphasis = "has a lower combined priority score in this MVP dataset"
    return f"{area_name} {emphasis}. Main drivers: {drivers}."


def area_summary_fr(area_name: str, vulnerability: float, access: float, drivers: str) -> str:
    if vulnerability >= 70 and access < 55:
        emphasis = "presente des besoins eleves et un acces relativement limite aux services proches"
    elif vulnerability >= 60:
        emphasis = "presente des besoins sociaux superieurs a la moyenne"
    elif access < 50:
        emphasis = "a un acces aux services proches plus faible que plusieurs zones comparees"
    else:
        emphasis = "a un score de priorite combine plus faible dans ce jeu de donnees MVP"
    return f"{area_name} {emphasis}. Principaux facteurs: {drivers}."
