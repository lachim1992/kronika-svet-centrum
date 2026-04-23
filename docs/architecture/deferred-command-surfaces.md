# Deferred Command Surfaces

Commands and UI surfaces not yet migrated to `dispatchCommand` server-side execution.
These remain as client-side direct writes pending Sprint B.

| Surface | Current Bypass | Target Command | Priority |
|---|---|---|---|
| DeployBattlePanel | `.update("military_stacks")` for deployment | DEPLOY_STACK (server-side) | Sprint B |
| WorldHexMap | `.update("military_stacks")` for hex movement | MOVE_STACK (already server-side) | Sprint B cleanup |
| CityManagement | `.update("realm_resources")` + `.insert("city_buildings")` | BUILD_BUILDING (server-side) | Deferred |
| SettlementUpgradePanel | `.update("cities")` + `.update("realm_resources")` | UPGRADE_SETTLEMENT (server-side) | Deferred |
| CouncilTab applyImmediateEffects | `.update("realm_resources")` + `.update("cities")` | ENACT_DECREE (server-side) | Deferred |
