@echo off
rem Code Continuum - double-click to open this project's dashboard.
rem
rem GENERATED. The source is Templates/_Project_Template/Dashboard.bat in the Code Continuum
rem environment, and `Commands/materialize-projects.py` writes it into each project. An edit here is
rem overwritten the next time that runs, and reported as drift before then. Change the template.
rem
rem the name is the interface (Artifact_Formats.md, Dashboard Launchers): this launcher derives the
rem project name from its own folder and hands it to dashboard.py, which owns the paths. Nothing
rem here is edited per project - the same file works in every project it is copied into.
rem
rem It finds the environment root by walking up for the marker, never by a stored path
rem (Path_Policy.md section 3) - the drive travels, and an absolute path breaks the first move.
setlocal
set "here=%~dp0"
for %%I in ("%here:~0,-1%") do set "project=%%~nxI"
set "WALK=%here%"
:findroot
if exist "%WALK%.code-continuum-env-root" goto found
for %%I in ("%WALK%..") do set "NEXT=%%~fI\"
if "%NEXT%"=="%WALK%" goto lost
set "WALK=%NEXT%"
goto findroot
:lost
echo [dashboard] no .code-continuum-env-root above %here% - is this inside a CC environment?
pause
exit /b 1
:found
"%WALK%Runtime\bin\python.cmd" "%WALK%Commands\dashboard.py" "%project%" --open
if errorlevel 1 pause
