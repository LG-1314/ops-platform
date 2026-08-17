; 安装时自动部署 Visual C++ 运行库（Electron 运行依赖），避免目标机器缺运行库导致"打不开"
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "正在安装 Visual C++ 运行库（若已安装会自动跳过）..."
  ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /install /quiet /norestart'
!macroend
