@echo off
REM Device Guard blocks hermesc.exe — compile via WSL linux64 hermesc.
node "%~dp0hermesc-wsl.js" %*
