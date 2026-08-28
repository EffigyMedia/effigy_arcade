@echo off
rem Code Continuum - double-click to open THIS project's dashboard.
rem
rem THE NAME IS THE INTERFACE (Artifact_Formats.md, Dashboard Launchers): this launcher derives the
rem project name from its own folder and hands it to dashboard.py, which owns the paths. Nothing
rem here is edited per project - the same file works in every project it is copied into.
rem
rem It finds the environment root by WALKING UP for the marker, never by a stored path
rem (Path_Policy.md section 3) - the drive travels, and an absolute path breaks the first move.
setlocal
set "HERE=%~dp0"
for %%I in ("%HERE:~0,-1%") do set "PROJECT=%%~nxI"
set "WALK=%HERE%"
:findroot
if exist "%WALK%.code-continuum-env-root" goto found
for %%I in ("%WALK%..") do set "NEXT=%%~fI\"
if "%NEXT%"=="%WALK%" goto lost
set "WALK=%NEXT%"
goto findroot
:lost
echo [dashboard] no .code-continuum-env-root above %HERE% - is this inside a CC environment?
pause
exit /b 1
:found
"%WALK%Runtime\bin\python.cmd" "%WALK%Commands\dashboard.py" "%PROJECT%" --open
if errorlevel 1 pause
