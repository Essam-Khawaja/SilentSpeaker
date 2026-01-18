"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import {
  Plus,
  Space,
  Trash2,
  Volume2,
  Hand,
  Zap,
  Activity,
} from "lucide-react";

interface Prediction {
  label: string;
  confidence: number;
}

interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface Results {
  multiHandLandmarks?: Landmark[][];
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

// Softer neon color palette (dimmed)
const NEON_COLORS = {
  cyan: "rgba(0, 200, 220, 0.8)",
  pink: "rgba(220, 80, 200, 0.8)",
  purple: "rgba(160, 80, 220, 0.8)",
  blue: "rgba(60, 120, 220, 0.8)",
};

// Hand connections for custom drawing
const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_BASES = [1, 5, 9, 13, 17];

export default function SignToSpeech() {
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [handDetected, setHandDetected] = useState(false);

  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const lastFrameTimeRef = useRef(Date.now());
  const trailsRef = useRef<
    Array<{ x: number; y: number; age: number; finger: number }>
  >([]);

  // Custom neon drawing function - softer glow
  const drawNeonHand = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      width: number,
      height: number,
    ) => {
      // Draw glow layer (reduced passes for subtler glow)
      for (let glowPass = 0; glowPass < 2; glowPass++) {
        const glowSize = (2 - glowPass) * 6;
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = "rgba(0, 200, 220, 0.5)";
        ctx.lineWidth = 3 - glowPass;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Draw connections with subtle gradient
        HAND_CONNECTIONS.forEach(([start, end]) => {
          const startPoint = landmarks[start];
          const endPoint = landmarks[end];

          const gradient = ctx.createLinearGradient(
            startPoint.x * width,
            startPoint.y * height,
            endPoint.x * width,
            endPoint.y * height,
          );
          gradient.addColorStop(0, NEON_COLORS.cyan);
          gradient.addColorStop(1, NEON_COLORS.purple);

          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(startPoint.x * width, startPoint.y * height);
          ctx.lineTo(endPoint.x * width, endPoint.y * height);
          ctx.stroke();
        });
      }

      // Draw subtle palm glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(160, 80, 220, 0.3)";
      const palmCenter = landmarks[0];
      const gradient = ctx.createRadialGradient(
        palmCenter.x * width,
        palmCenter.y * height,
        0,
        palmCenter.x * width,
        palmCenter.y * height,
        50,
      );
      gradient.addColorStop(0, "rgba(160, 80, 220, 0.15)");
      gradient.addColorStop(1, "rgba(160, 80, 220, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(palmCenter.x * width, palmCenter.y * height, 50, 0, Math.PI * 2);
      ctx.fill();

      // Draw landmarks with subtle pulsing
      const pulseScale = 1 + Math.sin(Date.now() / 300) * 0.1;
      landmarks.forEach((landmark, index) => {
        const x = landmark.x * width;
        const y = landmark.y * height;
        const isTip = FINGER_TIPS.includes(index);
        const isBase = FINGER_BASES.includes(index);

        ctx.shadowBlur = isTip ? 12 : 8;
        ctx.shadowColor = isTip
          ? "rgba(220, 80, 200, 0.6)"
          : "rgba(0, 200, 220, 0.6)";

        // Subtle ring for tips only
        if (isTip) {
          ctx.beginPath();
          ctx.arc(x, y, 8 * pulseScale, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(220, 80, 200, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        const baseSize = isTip ? 5 : isBase ? 4 : 3;
        const size = baseSize * (isTip ? pulseScale : 1);

        const pointGradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        if (isTip) {
          pointGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
          pointGradient.addColorStop(1, NEON_COLORS.pink);
        } else {
          pointGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
          pointGradient.addColorStop(1, NEON_COLORS.cyan);
        }

        ctx.fillStyle = pointGradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Subtle finger trails
      const currentTrails = trailsRef.current;
      FINGER_TIPS.forEach((tipIndex) => {
        const tip = landmarks[tipIndex];
        currentTrails.push({
          x: tip.x * width,
          y: tip.y * height,
          age: 0,
          finger: tipIndex,
        });
      });

      trailsRef.current = currentTrails
        .map((t) => ({ ...t, age: t.age + 1 }))
        .filter((t) => t.age < 10);

      ctx.shadowBlur = 6;
      trailsRef.current.forEach((trail) => {
        const alpha = (1 - trail.age / 10) * 0.3;
        const size = (1 - trail.age / 10) * 4;
        ctx.shadowColor = "rgba(220, 80, 200, 0.3)";
        ctx.fillStyle = `rgba(220, 80, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    [],
  );

  useEffect(() => {
    async function loadMediaPipe() {
      try {
        await Promise.all([
          import("@mediapipe/hands"),
          import("@mediapipe/camera_utils"),
        ]);
        setMediaPipeLoaded(true);
      } catch (err) {
        console.error("MediaPipe error:", err);
        setError("Failed to load MediaPipe modules");
      }
    }
    loadMediaPipe();
  }, []);

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
      } catch (err) {
        console.error("Labels error:", err);
        setError("Failed to load labels");
      }
    }
    loadLabels();
  }, []);

  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        try {
          const loadedModel = await tf.loadLayersModel(
            "/models/keypoint_classifier/model.json",
          );
          setModel(loadedModel);
          setIsLoading(false);
          return;
        } catch (layersError) {
          const graphModel = await tf.loadGraphModel(
            "/models/keypoint_classifier/model.json",
          );
          const wrappedModel = {
            predict: (input: tf.Tensor) => graphModel.predict(input),
            inputs: [{ shape: [null, 42] }],
            outputs: [{ shape: [null, labels.length || 26] }],
          } as any;
          setModel(wrappedModel);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Model error:", error);
        setError(
          `Failed to load model: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setIsLoading(false);
      }
    }
    loadModel();
  }, [labels]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !mediaPipeLoaded) return;

    async function initializeCamera() {
      try {
        const handsModule = await import("@mediapipe/hands");
        const cameraModule = await import("@mediapipe/camera_utils");

        const hands = new handsModule.Hands({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        });

        handsRef.current = hands;
        hands.onResults(onResults);

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
      } catch (err) {
        console.error("Camera error:", err);
        setError("Failed to initialize camera");
      }
    }

    initializeCamera();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, [mediaPipeLoaded, model, labels]);

  const preprocessLandmarks = (landmarks: Landmark[]): number[] => {
    let points: number[] = [];
    landmarks.forEach((lm) => {
      points.push(lm.x, lm.y);
    });

    const baseX = points[0];
    const baseY = points[1];

    for (let i = 0; i < points.length; i += 2) {
      points[i] -= baseX;
      points[i + 1] -= baseY;
    }

    const maxVal = Math.max(...points.map(Math.abs));
    if (maxVal > 0) {
      points = points.map((p) => p / maxVal);
    }

    return points;
  };

  const predict = async (landmarks: Landmark[]): Promise<Prediction | null> => {
    if (!model || labels.length === 0) return null;

    try {
      const processed = preprocessLandmarks(landmarks);
      const inputTensor = tf.tensor2d([processed], [1, 42]);
      const predictionResult = model.predict(inputTensor) as tf.Tensor;
      const probabilities = await predictionResult.data();
      const maxProb = Math.max(...Array.from(probabilities));
      const maxIndex = Array.from(probabilities).indexOf(maxProb);

      inputTensor.dispose();
      predictionResult.dispose();

      return {
        label: labels[maxIndex] || "Unknown",
        confidence: maxProb,
      };
    } catch (err) {
      console.error("Prediction error:", err);
      return null;
    }
  };

  const onResults = async (results: Results) => {
    const now = Date.now();
    const currentFps = Math.round(1000 / (now - lastFrameTimeRef.current));
    lastFrameTimeRef.current = now;
    setFps(currentFps);

    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setHandDetected(true);
      for (const landmarks of results.multiHandLandmarks) {
        drawNeonHand(ctx, landmarks, canvas.width, canvas.height);
        const pred = await predict(landmarks);
        if (pred) setPrediction(pred);
      }
    } else {
      setHandDetected(false);
      setPrediction(null);
      trailsRef.current = [];
    }

    ctx.restore();
  };

  const speakSentence = () => {
    const text = sentence.join("");
    if (!text.length) return;

    setIsSpeaking(true);

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && prediction) {
        setSentence((prev) => [...prev, prediction.label]);
      } else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        setSentence((prev) => [...prev, " "]);
      } else if (e.key === "Backspace" && e.target === document.body) {
        e.preventDefault();
        setSentence((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prediction]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-[#12121a] border border-red-500/20 rounded-xl p-6 max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="text-lg font-medium text-red-400">Error</h2>
          </div>
          <p className="text-zinc-400 text-sm mb-3">{error}</p>
          <p className="text-xs text-zinc-500">
            Ensure model files are in{" "}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
              public/models/
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Subtle background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(60,120,220,0.08),transparent_50%)]" />
      </div>

      <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Compact Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/80 to-purple-500/80 flex items-center justify-center">
              <Hand className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">
                Sign to Speech
              </h1>
              <p className="text-xs text-zinc-500">ASL Translation</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-800/50 text-xs">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-zinc-400">{fps}</span>
            </div>
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs ${handDetected ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800/50 text-zinc-500"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${handDetected ? "bg-emerald-400" : "bg-zinc-600"}`}
              />
              {handDetected ? "Active" : "Waiting"}
            </div>
          </div>
        </header>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 flex items-center gap-4">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-zinc-700" />
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/80 border-t-transparent animate-spin" />
              </div>
              <div>
                <p className="font-medium text-white">Loading</p>
                <p className="text-xs text-zinc-500">Initializing models...</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content - Mobile-first stacked layout */}
        {!isLoading && (
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Video + Controls - Primary column */}
            <div className="flex-1 space-y-4">
              {/* Video Feed */}
              <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800">
                <video ref={videoRef} className="hidden" playsInline />
                <canvas
                  ref={canvasRef}
                  className="w-full aspect-[4/3] scale-x-[-1]"
                />

                {/* Minimal corner indicators */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-cyan-500/40 rounded-tl" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-cyan-500/40 rounded-tr" />
                  <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-cyan-500/40 rounded-bl" />
                  <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-cyan-500/40 rounded-br" />
                </div>
              </div>

              {/* Current Sign - Mobile prominent display */}
              <div className="lg:hidden bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                      Detected
                    </p>
                    <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                      {prediction ? prediction.label : "—"}
                    </div>
                  </div>
                  {prediction && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Confidence
                      </p>
                      <p className="text-lg font-mono text-zinc-300">
                        {(prediction.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sentence Builder */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Message
                  </p>
                  <p className="text-[10px] text-zinc-600 hidden sm:block">
                    Enter to add
                  </p>
                </div>

                <div className="min-h-[56px] bg-black/40 rounded-lg p-3 mb-4 border border-zinc-800/50">
                  <p className="text-lg text-white leading-relaxed">
                    {sentence.length > 0 ? (
                      sentence.map((char, i) => (
                        <span key={i} className={char === " " ? "mx-0.5" : ""}>
                          {char === " " ? "\u00A0" : char}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-600">
                        Show signs to begin...
                      </span>
                    )}
                    <span className="inline-block w-0.5 h-5 bg-cyan-400/60 ml-0.5 animate-pulse" />
                  </p>
                </div>

                {/* Action buttons - Mobile optimized grid */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <button
                    onClick={() =>
                      prediction && setSentence([...sentence, prediction.label])
                    }
                    disabled={!prediction}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500/90 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>

                  <button
                    onClick={() => setSentence([...sentence, " "])}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Space className="w-4 h-4" />
                    <span>Space</span>
                  </button>

                  <button
                    onClick={() => setSentence([])}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear</span>
                  </button>

                  <button
                    onClick={speakSentence}
                    disabled={sentence.length === 0 || isSpeaking}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500/90 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Volume2
                      className={`w-4 h-4 ${isSpeaking ? "animate-pulse" : ""}`}
                    />
                    <span>{isSpeaking ? "..." : "Speak"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar - Desktop only */}
            <div className="hidden lg:flex flex-col gap-4 w-72">
              {/* Current Sign Display */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-4">
                  Detected Sign
                </p>

                <div className="text-center py-6">
                  <div className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-purple-400 to-pink-400">
                    {prediction ? prediction.label : "?"}
                  </div>

                  {prediction && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-zinc-500">Confidence</span>
                        <span className="font-mono text-zinc-300">
                          {(prediction.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300 rounded-full"
                          style={{ width: `${prediction.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Guide */}
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-4">
                  Quick Guide
                </p>
                <ul className="space-y-3 text-sm text-zinc-400">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                      1
                    </span>
                    Allow camera access
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                      2
                    </span>
                    Show hand clearly
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                      3
                    </span>
                    Make ASL signs
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                      4
                    </span>
                    Press Enter to add
                  </li>
                </ul>
              </div>

              {/* Shortcuts */}
              <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-3">
                  Shortcuts
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Add letter</span>
                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">
                      Enter
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Add space</span>
                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">
                      Space
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Delete</span>
                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">
                      Backspace
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
