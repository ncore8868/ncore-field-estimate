@echo off
chcp 65001 > nul
cd /d "%~dp0"

set /p ID=<deploy-id.txt

echo.
echo   UNION ONE  현장견적  배포
echo.

echo [1/2] 코드 올리는 중
call clasp push -f
if errorlevel 1 goto FAIL

echo.
echo [2/2] 배포하는 중
call clasp deploy -i %ID% -d "%date% %time:~0,5%"
if errorlevel 1 goto FAIL

echo.
echo   완료되었습니다. 앱에서 새로고침하세요.
echo.
timeout /t 2 /nobreak > nul
exit /b 0

:FAIL
echo.
echo   실패했습니다. 위 메시지를 확인해주세요.
echo.
pause
exit /b 1
