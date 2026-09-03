@echo off
setlocal
title 爱冒险玖日 · 游戏网站
set "BUNDLED=C:\Users\31148\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED%" (
  set "NODE=%BUNDLED%"
) else (
  set "NODE=node"
)
echo 正在启动服务器，请稍候...
"%NODE%" "%~dp0server\server.js"
pause
