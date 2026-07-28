# 211 Quebec — Data Request

## Do we need to email them?

**Yes.** The 211 Grand Montréal service directory is **not available as open data** and
**cannot be scraped** — verified three ways (June 2026):

- No 211 dataset on Données Québec (CKAN) or Montréal Open Data.
- The 211 Canada APIs are credential/agreement-gated (no open access).
- `www.211qc.ca` blocks automated requests (WAF); its search backend is on that
  same blocked host.

211 provides its directory to researchers and non-profits **on request, under a
data-sharing agreement**. A short email is the only legitimate path.

## Who to contact

| | |
|---|---|
| **Primary** | `donnees@211qc.ca` (211 Grand Montréal — data team) |
| **Secondary** | `info@211qc.ca` |
| **Web form** | https://www.211qc.ca/en/data |
| **National alt.** | 211 Canada Data Sharing Portal — https://findhelp.knack.com/211-data-sharing-portal#data-requests-submit |

## What to ask for

- **Geography:** Greater Montréal / Montréal CMA (or Island of Montréal).
- **Fields per organization:** name, service/AIRS category (taxonomy), street
  address, **latitude/longitude** (or full address for geocoding), phone, website,
  languages of service, eligibility/clientele, and **hours of operation / service
  schedule** (opening days and times — the `hours` field is currently empty in our
  service data).
- **Format:** CSV or Excel (or Export-API access).
- **Use:** non-commercial academic project (McGill MMA, BUSA 649).

## Ready-to-send email

> **To:** donnees@211qc.ca
> **Cc:** info@211qc.ca
> **Subject:** Data request — Greater Montréal service directory (McGill academic project)
>
> Bonjour / Hello,
>
> I'm a graduate student at McGill University (Master of Management in Analytics,
> course BUSA 649). Our team is building a **non-commercial academic** dashboard
> that maps social vulnerability against community-service accessibility across
> Greater Montréal, to help identify under-served neighbourhoods.
>
> Would it be possible to obtain a structured export of the **211 Grand Montréal
> service directory** for the Montréal CMA? Ideally a CSV or Excel file with, per
> organization: name, service category (AIRS/Open Referral taxonomy), address,
> latitude/longitude (or full address), phone, website, languages of service, and
> **hours of operation / service schedule** (opening days and times). Export-API
> access would work equally well.
>
> This is strictly for educational use. We're glad to **sign a data-sharing
> agreement**, credit 211 Grand Montréal as the source, and keep the raw file out
> of any public repository if your terms require it.
>
> Thank you very much for your time.
>
> Best regards,
> Laura Manzanos Zuriarrain — on behalf of Team Next Level, McGill MMA
> laura.manzanoszuriarrain@mail.mcgill.ca

## Two things to expect

1. **Turnaround:** typically a few business days; not guaranteed.
2. **Licensing:** 211 data usually comes with a sharing agreement that **restricts
   redistribution.** Use it inside the app, but keep the raw file **out of the public
   GitHub repo** (add it to `.gitignore`, document it in `source_metadata.csv`).

## How it plugs in

If they send a CSV with `name, lat, lon, service_category`, drop it into
`data/raw/service_sources/` and re-run:

```bash
python scripts/data_pipeline/build_service_centers.py
python scripts/data_pipeline/build_service_table.py
```

No code changes needed — the assembler ingests any `{name, lat, lon}` CSV there.
