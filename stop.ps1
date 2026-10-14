$taskListeners = Get-NetTCPConnection -LocalPort 8797 -State Listen -ErrorAction SilentlyContinue
foreach($taskListener in $taskListeners){
 $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskListener.OwningProcess)"
 if($taskProcess.CommandLine -like '*evolution-cat-editor*server.py*'){Stop-Process -Id $taskListener.OwningProcess}else{throw 'Port 8797 is owned by another process; refusing to stop'}
}
