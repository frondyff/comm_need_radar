from __future__ import annotations


def area_summary_en(area_name: str, vulnerability: float, access: float, drivers: str) -> str:
    return (
        f"{area_name} has structural vulnerability {vulnerability:.2f}/100 "
        f"and relative service accessibility {access:.2f}/100 in this POC. "
        f"Structural drivers: {drivers}."
    )


def area_summary_fr(area_name: str, vulnerability: float, access: float, drivers: str) -> str:
    return (
        f"{area_name} a une vulnerabilite structurelle de {vulnerability:.2f}/100 "
        f"et une accessibilite relative aux services de {access:.2f}/100 dans "
        f"cette preuve de concept. Facteurs structurels: {drivers}."
    )
