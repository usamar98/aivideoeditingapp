"""Bounded offline face detections, not identity recognition or active-speaker AI.
Input is worker-generated local footage. Coordinates are normalized, sampled at
5 FPS; raw frames are never written to disk or sent to another service.
"""
import json
import os
import sys
import cv2

cv2.setNumThreads(1)
source = sys.argv[1]
cascade_path = os.environ.get("OPENCV_FACE_CASCADE", "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml")
if not os.path.isfile(cascade_path) and hasattr(cv2, "data"):
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
detector = cv2.CascadeClassifier(cascade_path)
if detector.empty():
    raise RuntimeError("Face detector is not installed")
capture = cv2.VideoCapture(source)
if not capture.isOpened():
    raise RuntimeError("Could not read prepared clip")
fps = capture.get(cv2.CAP_PROP_FPS)
if not 1 <= fps <= 120:
    raise RuntimeError("Unsupported frame rate")
samples = []
try:
    for i in range(301):
        t = i / 5
        capture.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = capture.read()
        if not ok:
            break
        height, width = frame.shape[:2]
        small = cv2.resize(frame, (480, max(1, round(height * 480 / width))))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(28, 28))
        samples.append({"t": t, "faces": [{"x": float((x + w / 2) / 480), "size": float(w / 480)} for x, y, w, h in faces][:10]})
finally:
    capture.release()
print(json.dumps(samples, separators=(",", ":")))
