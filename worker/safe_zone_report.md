# Discussion Report: Safe Zone Nullification

## Problem Description
It was identified that "Safe Zones" could geographically reside within active "Threat Zones" (e.g. areas with active flood, traffic, or weather risk alerts). Visually and logically, this is problematic because a safe zone located inside a threat zone is no longer safe for evacuation or shelter.

## Solution Detail
Any Safe Zone located within the geographical radius of an active Threat Zone must be nullified (erased/suppressed).

An active Threat Zone is identified by:
1. An open `RiskAlert` with a probability $\ge 20\%$.
2. An active `ZoneStatus` overall risk score $\ge 25$ (MEDIUM or HIGH severity).

The distance between the Safe Zone coordinates and the Threat Zone center is calculated using the Haversine formula. If this distance is less than or equal to the Threat Zone's radius, the Safe Zone is excluded.

## Subsystem Implementation

### Worker (`worker/engine.py`)
- During the scoring loop in `run_analysis`, safe zones are filtered out before calculating the `safe_zone_bonus` for crowd density scores.
- Any safe zone within the radius of an active threat zone is discarded, preventing it from applying a safety discount to crowd scores in compromised locations.

### Constraints
- Checked and ensured that no files with the `RB_` prefix were modified.
