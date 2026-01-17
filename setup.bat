@echo off
echo Setting up ASL Detector environment...

python -m venv venv
call venv\Scripts\activate

pip install --upgrade pip
pip install "numpy>=1.26.0,<2.0"
pip install "opencv-python==4.8.1.78"
pip install mediapipe
pip install tensorflow==2.19.0
pip install "jax<=0.4.23" "jaxlib<=0.4.23"
pip install pandas scikit-learn matplotlib seaborn

echo Downloading MediaPipe model...
curl -o hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

echo Setup complete!
echo Run: venv\Scripts\activate and then python app.py