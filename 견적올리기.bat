@echo off
chcp 65001 > nul
cd /d "%~dp0"

set /p ID=<deploy-id.txt
set STAMP=%date% %time:~0,5%

echo.
echo   UNION ONE  현장견적  올리기
echo.

echo [1/3] 깃허브에 백업하는 중
call git add -A
call git diff --cached --quiet
if errorlevel 1 goto COMMIT
echo      바뀐 것이 없어 건너뜁니다
goto PUSHED

:COMMIT
call git commit -m "%STAMP%"
if errorlevel 1 goto FAILGIT
call git push
if errorlevel 1 goto FAILGIT

:PUSHED
echo.
echo [2/3] 서버 코드 올리는 중
call clasp push -f
if errorlevel 1 goto FAILCLASP

echo.
echo [3/3] 배포하는 중
call clasp deploy -i %ID% -d "%STAMP%"
if errorlevel 1 goto FAILCLASP

echo.
echo   완료되었습니다. 앱에서 새로고침하세요.
echo.
timeout /t 2 /nobreak > nul
exit /b 0

:FAILGIT
echo.
echo   깃허브 올리기에서 멈췄습니다.
echo   서버는 건드리지 않았습니다. 위 메시지를 확인해주세요.
echo.
pause
exit /b 1

:FAILCLASP
echo.
echo   서버 배포에서 멈췄습니다.
echo   깃허브 백업은 끝났으니 코드는 안전합니다. 위 메시지를 확인해주세요.
echo.
pause
exit /b 1
