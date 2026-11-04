# Windows equivalent of `make demo-reset`. Run from the repo root:  .\demo-reset.ps1
$ErrorActionPreference = "Stop"
$sw = [Diagnostics.Stopwatch]::StartNew()
foreach ($f in "01_schema","02_triggers","03_procedures","04_views","05_events_indexes","06_roles_grants") {
    Write-Host "== $f"
    cmd /c "docker compose exec -T mysql mysql -uroot -proot < db\$f.sql 2>nul"
    if ($LASTEXITCODE -ne 0) { throw "$f failed" }
}
docker compose exec -T mongo mongosh icms_docs --quiet --eval "db.dropDatabase()" | Out-Null
python db\seed\seed.py
if ($LASTEXITCODE -ne 0) { throw "seed failed" }
Write-Host ("demo-reset done in {0:n0}s" -f $sw.Elapsed.TotalSeconds)
