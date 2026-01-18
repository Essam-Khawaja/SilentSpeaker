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

// Neon color palette
const NEON_COLORS = {
  cyan: "#00f5ff",
  pink: "#ff00ff",
  purple: "#bf00ff",
  blue: "#0066ff",
  green: "#00ff66",
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

export default function ASLDetector(props: any) {
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

  // Custom neon drawing function
  const drawNeonHand = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      width: number,
      height: number,
    ) => {
      // Draw glow layer (multiple passes for intense glow)
      for (let glowPass = 0; glowPass < 3; glowPass++) {
        const glowSize = (3 - glowPass) * 8;
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = NEON_COLORS.cyan;
        ctx.lineWidth = 6 - glowPass * 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Draw connections with gradient
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
          gradient.addColorStop(0.5, NEON_COLORS.purple);
          gradient.addColorStop(1, NEON_COLORS.pink);

          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(startPoint.x * width, startPoint.y * height);
          ctx.lineTo(endPoint.x * width, endPoint.y * height);
          ctx.stroke();
        });
      }

      // Draw energy field around palm
      ctx.shadowBlur = 30;
      ctx.shadowColor = NEON_COLORS.purple;
      const palmCenter = landmarks[0];
      const gradient = ctx.createRadialGradient(
        palmCenter.x * width,
        palmCenter.y * height,
        0,
        palmCenter.x * width,
        palmCenter.y * height,
        80,
      );
      gradient.addColorStop(0, "rgba(191, 0, 255, 0.3)");
      gradient.addColorStop(0.5, "rgba(191, 0, 255, 0.1)");
      gradient.addColorStop(1, "rgba(191, 0, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(palmCenter.x * width, palmCenter.y * height, 80, 0, Math.PI * 2);
      ctx.fill();

      // Draw landmarks with pulsing effect
      const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.2;
      landmarks.forEach((landmark, index) => {
        const x = landmark.x * width;
        const y = landmark.y * height;
        const isTip = FINGER_TIPS.includes(index);
        const isBase = FINGER_BASES.includes(index);

        ctx.shadowBlur = isTip ? 25 : 15;
        ctx.shadowColor = isTip ? NEON_COLORS.pink : NEON_COLORS.cyan;

        // Draw multiple rings for tips
        if (isTip) {
          for (let ring = 3; ring >= 1; ring--) {
            ctx.beginPath();
            ctx.arc(x, y, ring * 4 * pulseScale, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 255, ${0.3 / ring})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        const baseSize = isTip ? 8 : isBase ? 6 : 4;
        const size = baseSize * (isTip ? pulseScale : 1);

        const pointGradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        if (isTip) {
          pointGradient.addColorStop(0, "#ffffff");
          pointGradient.addColorStop(0.3, NEON_COLORS.pink);
          pointGradient.addColorStop(1, NEON_COLORS.purple);
        } else {
          pointGradient.addColorStop(0, "#ffffff");
          pointGradient.addColorStop(0.5, NEON_COLORS.cyan);
          pointGradient.addColorStop(1, NEON_COLORS.blue);
        }

        ctx.fillStyle = pointGradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Update and draw finger trails
      const currentTrails = trailsRef.current;
      FINGER_TIPS.forEach((tipIndex, fingerNum) => {
        const tip = landmarks[tipIndex];
        currentTrails.push({
          x: tip.x * width,
          y: tip.y * height,
          age: 0,
          finger: fingerNum,
        });
      });

      trailsRef.current = currentTrails
        .map((t) => ({ ...t, age: t.age + 1 }))
        .filter((t) => t.age < 15);

      ctx.shadowBlur = 10;
      trailsRef.current.forEach((trail) => {
        const alpha = 1 - trail.age / 15;
        const size = (1 - trail.age / 15) * 6;
        ctx.shadowColor = NEON_COLORS.pink;
        ctx.fillStyle = `rgba(255, 0, 255, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw energy lines between finger tips
      ctx.shadowBlur = 15;
      ctx.shadowColor = NEON_COLORS.purple;
      ctx.lineWidth = 1;
      for (let i = 0; i < FINGER_TIPS.length - 1; i++) {
        const tip1 = landmarks[FINGER_TIPS[i]];
        const tip2 = landmarks[FINGER_TIPS[i + 1]];
        const distance = Math.hypot(
          (tip2.x - tip1.x) * width,
          (tip2.y - tip1.y) * height,
        );

        if (distance < 100) {
          const alpha = 1 - distance / 100;
          ctx.strokeStyle = `rgba(191, 0, 255, ${alpha * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(tip1.x * width, tip1.y * height);
          ctx.lineTo(tip2.x * width, tip2.y * height);
          ctx.stroke();
        }
      }
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-red-500/30 rounded-2xl p-8 max-w-md backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-red-400">System Error</h2>
          </div>
          <p className="text-muted-foreground mb-4">{error}</p>
          <p className="text-sm text-muted-foreground/70">
            Ensure model files are in{" "}
            <code className="bg-secondary/50 px-2 py-1 rounded text-xs font-mono text-cyan-400">
              public/models/
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,245,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,245,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 p-4 lg:p-8">
        {/* Header */}
        <header className="max-w-7xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                  <Hand className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -inset-1 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-xl blur opacity-40" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Sign to Speech
                </h1>
                <p className="text-sm text-muted-foreground">
                  Neural ASL Translation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-mono text-cyan-400">
                  {fps} FPS
                </span>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${handDetected ? "bg-green-500/10 border-green-500/30" : "bg-secondary/50 border-border/50"}`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${handDetected ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`}
                />
                <span
                  className={`text-sm ${handDetected ? "text-green-400" : "text-muted-foreground"}`}
                >
                  {handDetected ? "Tracking" : "No Hand"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Loading State */}
        {isLoading && (
          <div className="max-w-7xl mx-auto flex items-center justify-center py-20">
            <div className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-8 flex items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-cyan-500/20" />
                <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                <div
                  className="absolute inset-2 w-12 h-12 rounded-full border-2 border-purple-500 border-b-transparent animate-spin"
                  style={{
                    animationDirection: "reverse",
                    animationDuration: "1.5s",
                  }}
                />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">
                  Initializing Neural Network
                </p>
                <p className="text-sm text-muted-foreground">
                  Loading hand tracking models...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!isLoading && (
          <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-6">
            {/* Video Feed */}
            <div className="lg:col-span-2 space-y-6">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity" />

                <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
                  <video ref={videoRef} className="hidden" playsInline />
                  <canvas
                    ref={canvasRef}
                    className="w-full aspect-video scale-x-[-1] bg-black/90"
                  />

                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_4px] opacity-30" />

                    <svg
                      className="absolute top-4 left-4 w-12 h-12 text-cyan-500/60"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M2 16V2h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    <svg
                      className="absolute top-4 right-4 w-12 h-12 text-cyan-500/60"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M46 16V2H32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    <svg
                      className="absolute bottom-4 left-4 w-12 h-12 text-cyan-500/60"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M2 32v14h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    <svg
                      className="absolute bottom-4 right-4 w-12 h-12 text-cyan-500/60"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M46 32v14H32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>

                    <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 backdrop-blur-sm border border-cyan-500/30 rounded-full">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">
                          Live Neural Feed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentence Builder */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/50 to-pink-500/50 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity" />

                <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Sentence Builder
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                      <kbd className="px-1.5 py-0.5 bg-secondary/50 rounded text-[10px]">
                        Enter
                      </kbd>
                      <span>to add</span>
                    </div>
                  </div>

                  <div className="min-h-[80px] bg-black/30 rounded-xl p-5 mb-5 border border-border/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
                    <p className="relative text-2xl font-medium text-foreground leading-relaxed">
                      {sentence.length > 0 ? (
                        sentence.map((char, i) => (
                          <span
                            key={i}
                            className={
                              char === " "
                                ? "mx-1"
                                : "inline-block animate-in fade-in slide-in-from-bottom-1 duration-200"
                            }
                          >
                            {char === " " ? "\u00A0" : char}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground/50 italic">
                          Show signs to build your message...
                        </span>
                      )}
                      <span className="inline-block w-0.5 h-6 bg-cyan-400 ml-1 animate-pulse" />
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() =>
                        prediction &&
                        setSentence([...sentence, prediction.label])
                      }
                      disabled={!prediction}
                      className="group/btn relative flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl font-medium text-sm transition-all hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
                    >
                      <Plus className="w-4 h-4" />
                      Add Letter
                      <span className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                    </button>

                    <button
                      onClick={() => setSentence([...sentence, " "])}
                      className="flex items-center gap-2 px-5 py-2.5 bg-secondary/80 text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-secondary border border-border/50"
                    >
                      <Space className="w-4 h-4" />
                      Space
                    </button>

                    <button
                      onClick={() => setSentence([])}
                      className="flex items-center gap-2 px-5 py-2.5 bg-secondary/80 text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border border-border/50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear
                    </button>

                    <button
                      onClick={speakSentence}
                      disabled={sentence.length === 0 || isSpeaking}
                      className="group/btn relative flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm transition-all hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none ml-auto"
                    >
                      <Volume2
                        className={`w-4 h-4 ${isSpeaking ? "animate-pulse" : ""}`}
                      />
                      {isSpeaking ? "Speaking..." : "Speak"}
                      <span className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Current Sign Display */}
              <div className="relative group">
                <div
                  className={`absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-2xl blur transition-opacity ${prediction ? "opacity-30" : "opacity-0"}`}
                />

                <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-6 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-bl-full" />

                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6">
                    Detected Sign
                  </p>

                  <div className="text-center py-8">
                    <div className="relative inline-block">
                      <div
                        className={`text-8xl font-bold bg-gradient-to-br from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent transition-all ${prediction ? "scale-100 opacity-100" : "scale-90 opacity-50"}`}
                      >
                        {prediction ? prediction.label : "?"}
                      </div>
                      {prediction && (
                        <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 blur-xl rounded-full animate-pulse" />
                      )}
                    </div>

                    {prediction && (
                      <div className="mt-8 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Confidence
                          </span>
                          <span className="font-mono text-cyan-400">
                            {(prediction.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 transition-all duration-300 rounded-full"
                            style={{ width: `${prediction.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-5">
                  Quick Guide
                </h3>
                <ul className="space-y-4">
                  {[
                    { num: "01", text: "Allow camera access" },
                    { num: "02", text: "Show hand clearly" },
                    { num: "03", text: "Make ASL signs" },
                    { num: "04", text: "Press Enter to add" },
                    { num: "05", text: "Click Speak to hear" },
                  ].map((item) => (
                    <li
                      key={item.num}
                      className="flex items-start gap-3 group/item"
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400 group-hover/item:from-cyan-500/30 group-hover/item:to-purple-500/30 transition-colors">
                        {item.num}
                      </span>
                      <span className="text-sm text-muted-foreground group-hover/item:text-foreground transition-colors">
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  Shortcuts
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Add letter</span>
                    <kbd className="px-2 py-1 bg-secondary/50 rounded text-xs font-mono">
                      Enter
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Add space</span>
                    <kbd className="px-2 py-1 bg-secondary/50 rounded text-xs font-mono">
                      Space
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delete</span>
                    <kbd className="px-2 py-1 bg-secondary/50 rounded text-xs font-mono">
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
