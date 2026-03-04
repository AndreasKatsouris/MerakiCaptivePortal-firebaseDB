$csvPath = "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\documents\food cost module\Stock Usage 28 - 15 MAR.csv"
$data = Import-Csv -Path $csvPath
Write-Output "Columns in CSV:"
$data[0].PSObject.Properties.Name
Write-Output "`nFirst 5 rows of data:"
$data | Select-Object -First 5 | Format-Table -AutoSize
