// app/components/ASLDetector.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";

interface Prediction {
  label: string;
  confidence: number;
}

// Type definitions for MediaPipe
interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface Results {
  multiHandLandmarks?: Landmark[][];
}

interface HandsConfig {
  locateFile: (file: string) => string;
}

interface Hands {
  setOptions: (options: any) => void;
  onResults: (callback: (results: Results) => void) => void;
  send: (inputs: { image: HTMLVideoElement }) => Promise<void>;
}

interface Camera {
  start: () => Promise<void>;
  stop: () => void;
}

interface DrawingUtils {
  drawConnectors: (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    connections: any,
    options: any,
  ) => void;
  drawLandmarks: (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    options: any,
  ) => void;
}

export default function ASLDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [sentence, setSentence] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [fps, setFps] = useState(0);
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [mediaPipeLoaded, setMediaPipeLoaded] = useState(false);

  // Store MediaPipe instances
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const handConnectionsRef = useRef<any>(null);
  const lastFrameTimeRef = useRef(Date.now());

  // Load all MediaPipe modules dynamically
  useEffect(() => {
    async function loadMediaPipe() {
      try {
        console.log("Loading MediaPipe modules...");

        // Load all MediaPipe modules
        const [handsModule, cameraModule, drawingModule] = await Promise.all([
          import("@mediapipe/hands"),
          import("@mediapipe/camera_utils"),
          import("@mediapipe/drawing_utils"),
        ]);

        drawingUtilsRef.current = drawingModule;
        handConnectionsRef.current = handsModule.HAND_CONNECTIONS;

        console.log("✓ MediaPipe modules loaded");
        setMediaPipeLoaded(true);
      } catch (err) {
        console.error("Error loading MediaPipe:", err);
        setError("Failed to load MediaPipe modules");
      }
    }
    loadMediaPipe();
  }, []);

  // Load labels from CSV
  useEffect(() => {
    async function loadLabels() {
      try {
        const response = await fetch("/models/labels.csv");
        const text = await response.text();
        const labelList = text
          .trim()
          .split("\n")
          .map((l) => l.trim());
        setLabels(labelList);
        console.log("✓ Loaded labels:", labelList);
      } catch (err) {
        console.error("Error loading labels:", err);
        setError("Failed to load labels");
      }
    }
    loadLabels();
  }, []);

  // Load TensorFlow.js model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        console.log("Loading TensorFlow.js model...");

        // Test if the file exists first
        const testResponse = await fetch(
          "/models/keypoint_classifier/model.json",
        );
        console.log("Model file response status:", testResponse.status);

        if (!testResponse.ok) {
          throw new Error(
            `Model file not found: ${testResponse.status} ${testResponse.statusText}`,
          );
        }

        const loadedModel = await tf.loadLayersModel(
          "/models/keypoint_classifier/model.json",
        );
        setModel(loadedModel);

        console.log("✓ Model loaded successfully");
        console.log("Input shape:", loadedModel.inputs[0].shape);
        console.log("Output shape:", loadedModel.outputs[0].shape);

        setIsLoading(false);
      } catch (error) {
        console.error("Error loading model:", error);
        console.error("Full error details:", JSON.stringify(error, null, 2));
        setError(
          `Failed to load model: ${error instanceof Error ? error.message : "Unknown error"}. Check console for details.`,
        );
        setIsLoading(false);
      }
    }
    loadModel();
  }, []);

  // Initialize MediaPipe Hands
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !mediaPipeLoaded) return;

    async function initializeCamera() {
      try {
        const handsModule = await import("@mediapipe/hands");
        const cameraModule = await import("@mediapipe/camera_utils");

        const hands = new handsModule.Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        });

        hands.onResults(onResults);
        handsRef.current = hands;

        if (!videoRef.current) return;

        const camera = new cameraModule.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
        cameraRef.current = camera;
        console.log("✓ Camera initialized");
      } catch (err) {
        console.error("Error initializing camera:", err);
        setError("Failed to initialize camera");
      }
    }

    initializeCamera();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, [mediaPipeLoaded]);

  // Preprocess landmarks (SAME AS YOUR PYTHON CODE)
  const preprocessLandmarks = (landmarks: Landmark[]): number[] => {
    // Step 1: Flatten to [x1, y1, x2, y2, ..., x21, y21]
    let points: number[] = [];
    landmarks.forEach((lm) => {
      points.push(lm.x, lm.y);
    });

    // Step 2: Make relative to wrist (landmark 0)
    const baseX = points[0];
    const baseY = points[1];

    for (let i = 0; i < points.length; i += 2) {
      points[i] -= baseX;
      points[i + 1] -= baseY;
    }

    // Step 3: Normalize by max absolute value
    const maxVal = Math.max(...points.map(Math.abs));
    if (maxVal > 0) {
      points = points.map((p) => p / maxVal);
    }

    return points; // 42 values
  };

  // Make prediction using YOUR trained model
  const predict = async (landmarks: Landmark[]): Promise<Prediction | null> => {
    if (!model || labels.length === 0) return null;

    try {
      // Preprocess (same as Python)
      const processed = preprocessLandmarks(landmarks);

      // Create tensor [1, 42]
      const inputTensor = tf.tensor2d([processed], [1, 42]);

      // Run inference
      const prediction = model.predict(inputTensor) as tf.Tensor;
      const probabilities = await prediction.data();

      // Get best prediction
      const maxProb = Math.max(...Array.from(probabilities));
      const maxIndex = Array.from(probabilities).indexOf(maxProb);

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      return {
        label: labels[maxIndex] || "Unknown",
        confidence: maxProb,
      };
    } catch (err) {
      console.error("Prediction error:", err);
      return null;
    }
  };

  // Handle MediaPipe results
  const onResults = async (results: Results) => {
    // Calculate FPS
    const now = Date.now();
    const currentFps = Math.round(1000 / (now - lastFrameTimeRef.current));
    lastFrameTimeRef.current = now;
    setFps(currentFps);

    if (!canvasRef.current || !videoRef.current || !drawingUtilsRef.current)
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw hand landmarks
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        // Draw connections
        drawingUtilsRef.current.drawConnectors(
          ctx,
          landmarks,
          handConnectionsRef.current,
          {
            color: "#00FF00",
            lineWidth: 5,
          },
        );
        // Draw landmarks
        drawingUtilsRef.current.drawLandmarks(ctx, landmarks, {
          color: "#FF0000",
          lineWidth: 2,
          radius: 4,
        });

        // Make prediction
        const pred = await predict(landmarks);
        if (pred) {
          setPrediction(pred);
        }
      }
    } else {
      setPrediction(null);
    }

    ctx.restore();
  };

  // Sentence building functions
  const addToSentence = () => {
    if (prediction && prediction.confidence > 0.7) {
      setSentence([...sentence, prediction.label]);
    }
  };

  const addSpace = () => {
    setSentence([...sentence, " "]);
  };

  const clearSentence = () => {
    setSentence([]);
  };

  const speakSentence = () => {
    const text = sentence.join("");
    if ("speechSynthesis" in window && text.length > 0) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-500 to-red-700">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">⚠️ Error</h2>
          <p className="text-gray-700">{error}</p>
          <p className="text-sm text-gray-500 mt-4">
            Make sure your model files are in <code>public/models/</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-4">
        🤟 ASL Real-Time Translator
      </h1>

      {isLoading && (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <div>
              <p className="text-lg font-semibold">Loading AI model...</p>
              <p className="text-sm text-gray-500">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Video Container */}
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm z-10 flex gap-3">
          <span>FPS: {fps}</span>
          {model && <span className="text-green-400">● Model Ready</span>}
          {mediaPipeLoaded && (
            <span className="text-blue-400">● Camera Ready</span>
          )}
        </div>
        <video ref={videoRef} className="hidden" playsInline />
        <canvas
          ref={canvasRef}
          className="w-full max-w-3xl scale-x-[-1]"
          style={{ maxHeight: "480px" }}
        />
      </div>

      {/* Prediction Display */}
      <div className="w-full max-w-3xl bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="text-sm uppercase tracking-wider opacity-80 mb-2">
          Current Sign
        </div>
        <div className="text-5xl font-bold mb-2">
          {prediction ? prediction.label : "Show your hand..."}
        </div>
        {prediction && (
          <div className="flex items-center gap-4">
            <div className="text-lg opacity-80">
              Confidence: {(prediction.confidence * 100).toFixed(1)}%
            </div>
            <div className="flex-1 bg-white/20 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${prediction.confidence * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sentence Builder */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6">
        <div className="text-sm text-gray-600 uppercase tracking-wider mb-3">
          Sentence Builder
        </div>
        <div className="text-2xl text-gray-800 min-h-12 mb-4 p-4 bg-gray-50 rounded-lg">
          {sentence.length > 0
            ? sentence.join("")
            : "Start signing to build a sentence..."}
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={addToSentence}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!prediction || prediction.confidence < 0.7}
          >
            ➕ Add to Sentence
          </button>
          <button
            onClick={addSpace}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-all hover:scale-105"
          >
            ⎵ Space
          </button>
          <button
            onClick={clearSentence}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all hover:scale-105"
          >
            🗑️ Clear
          </button>
          <button
            onClick={speakSentence}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all hover:scale-105 disabled:opacity-50"
            disabled={sentence.length === 0}
          >
            🔊 Speak
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="w-full max-w-3xl bg-blue-50 rounded-2xl p-6 border-l-4 border-blue-500">
        <h3 className="text-xl font-bold text-blue-900 mb-3">📝 How to Use</h3>
        <ul className="space-y-2 text-blue-800">
          <li>• Allow camera access when prompted</li>
          <li>• Show your hand clearly in front of the camera</li>
          <li>• Make ASL signs - AI will detect them in real-time</li>
          <li>• Wait for confidence {">"} 70% before adding to sentence</li>
          <li>• Click "Speak" to hear your sentence out loud</li>
        </ul>
      </div>

      {/* Debug Info */}
      {model && (
        <div className="w-full max-w-3xl bg-gray-800 rounded-lg p-4 text-white text-sm font-mono">
          <div className="grid grid-cols-2 gap-2">
            <div>Model: Loaded ✓</div>
            <div>Labels: {labels.length} classes</div>
            <div>Input: 42 features</div>
            <div>FPS: {fps}</div>
            <div>MediaPipe: {mediaPipeLoaded ? "Ready ✓" : "Loading..."}</div>
          </div>
        </div>
      )}
    </div>
  );
}
