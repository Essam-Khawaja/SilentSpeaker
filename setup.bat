@echo off
setlocal

echo  Setup ALL: Main project + Translator backend

REM ----- Check for Python 3.12 -----
echo Checking for Python 3.12 installation...

py -3.12 --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Python 3.12 is required but not installed.
    echo Please install Python 3.12 from:
    echo https://www.python.org/downloads/
    echo.
    echo After installing, run this setup script again.
    pause
    exit /b 1
)

echo Python 3.12 detected successfully.

REM 1) Main project environment
echo.
echo [1/2] Setting up MAIN environment in .\venv ...
python -m venv venv
call venv\Scripts\activate

python -m pip install --upgrade pip
python -m pip install "numpy>=1.26.0,<2.0"
python -m pip install "opencv-python==4.8.1.78"
python -m pip install mediapipe
python -m pip install tensorflow==2.19.0
python -m pip install "jax<=0.4.23" "jaxlib<=0.4.23"
python -m pip install pandas scikit-learn matplotlib seaborn

echo Downloading MediaPipe model...
curl -L -o hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

call venv\Scripts\deactivate

REM 2) Translator backend environment
echo.
echo [2/2] Setting up TRANSLATOR backend environment using Python 3.12...
cd backend\Ahmad-Library

py -3.12 -m venv .venv
call .venv\Scripts\activate

python -m pip install --upgrade pip
python -m pip install fastapi uvicorn moviepy sign-language-translator

call .venv\Scripts\deactivate

cd ..\..

echo.
echo Setup complete!
echo.
echo To run translator backend for debugging, use the following 3 commands:
echo   cd backend\Ahmad-Library
echo   .venv\Scripts\activate
echo   python -m uvicorn sign_service:app --reload --port 8000

pause
endlocal
