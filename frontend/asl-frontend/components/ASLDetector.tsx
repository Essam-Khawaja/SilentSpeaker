"use client";

import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import {
  Hand,
  Mic,
  Plus,
  Space,
  Trash2,
  Volume2,
  ArrowLeftRight,
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

  // Speech-to-Sign mode
  const [mode, setMode] = useState<"sign-to-speech" | "speech-to-sign">(
    "sign-to-speech",
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const handConnectionsRef = useRef<any>(null);
  const lastFrameTimeRef = useRef(Date.now());

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + " ";
            }
          }

          if (finalTranscript) {
            setTranscript((prev) => prev + finalTranscript);
            addSpeechToSentence(finalTranscript.trim());
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const addSpeechToSentence = (text: string) => {
    const letters = text
      .toLowerCase()
      .split("")
      .filter((char) => /[a-z\s]/.test(char));

    setSentence((prev) => [...prev, ...letters]);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      setTranscript("");
    }
  };

  useEffect(() => {
    async function loadMediaPipe() {
      try {
        console.log("Loading MediaPipe modules...");
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

  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        console.log("Loading TensorFlow.js model...");

        try {
          const loadedModel = await tf.loadLayersModel(
            "/models/keypoint_classifier/model.json",
          );
          setModel(loadedModel);
          console.log("✓ Model loaded successfully as LayersModel");
          setIsLoading(false);
          return;
        } catch (layersError) {
          console.log("LayersModel failed, trying GraphModel...");
          const graphModel = await tf.loadGraphModel(
            "/models/keypoint_classifier/model.json",
          );

          const wrappedModel = {
            predict: (input: tf.Tensor) => graphModel.predict(input),
            inputs: [{ shape: [null, 42] }],
            outputs: [{ shape: [null, labels.length || 26] }],
          } as any;

          setModel(wrappedModel);
          console.log("✓ Model loaded successfully as GraphModel");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error loading model:", error);
        setError(
          `Failed to load model: ${error instanceof Error ? error.message : "Unknown error"}.`,
        );
        setIsLoading(false);
      }
    }
    loadModel();
  }, [labels]);

  useEffect(() => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !mediaPipeLoaded ||
      mode !== "sign-to-speech"
    )
      return;

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
          maxNumHands: 2,
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
  }, [mediaPipeLoaded, model, labels, mode]);

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
      const prediction = model.predict(inputTensor) as tf.Tensor;
      const probabilities = await prediction.data();
      const maxProb = Math.max(...Array.from(probabilities));
      const maxIndex = Array.from(probabilities).indexOf(maxProb);

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

  const onResults = async (results: Results) => {
    const now = Date.now();
    const currentFps = Math.round(1000 / (now - lastFrameTimeRef.current));
    lastFrameTimeRef.current = now;
    setFps(currentFps);

    if (!canvasRef.current || !videoRef.current || !drawingUtilsRef.current)
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        drawingUtilsRef.current.drawConnectors(
          ctx,
          landmarks,
          handConnectionsRef.current,
          {
            color: "#22d3ee",
            lineWidth: 3,
          },
        );
        drawingUtilsRef.current.drawLandmarks(ctx, landmarks, {
          color: "#f472b6",
          lineWidth: 2,
          radius: 4,
        });

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

  const addToSentence = () => {
    if (prediction) {
      setSentence([...sentence, prediction.label]);
    }
  };

  const addSpace = () => {
    setSentence([...sentence, " "]);
  };

  const clearSentence = () => {
    setSentence([]);
    setTranscript("");
  };

  const speakSentence = () => {
    const text = sentence.join("");
    if ("speechSynthesis" in window && text.length > 0) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== "sign-to-speech") return;

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
  }, [prediction, mode]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
              <span className="text-destructive text-lg">!</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Error</h2>
          </div>
          <p className="text-muted-foreground mb-4">{error}</p>
          <p className="text-sm text-muted-foreground/70">
            Make sure your model files are in{" "}
            <code className="bg-secondary px-2 py-1 rounded text-xs font-mono">
              public/models/
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Hand className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">
                ASL Translator
              </h1>
              <p className="text-xs text-muted-foreground">
                {mode === "sign-to-speech"
                  ? "Sign to Speech"
                  : "Speech to Sign"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Mode Toggle */}
            <button
              onClick={() => {
                setMode(
                  mode === "sign-to-speech"
                    ? "speech-to-sign"
                    : "sign-to-speech",
                );
                if (isListening) toggleListening();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-secondary/80"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Switch Mode
            </button>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${model ? "bg-emerald-500" : "bg-muted"}`}
                />
                <span className="text-muted-foreground">Model</span>
              </div>
              {mode === "sign-to-speech" && (
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${mediaPipeLoaded ? "bg-emerald-500" : "bg-muted"}`}
                  />
                  <span className="text-muted-foreground">Camera</span>
                </div>
              )}
              <div className="text-muted-foreground font-mono text-xs bg-secondary px-2 py-1 rounded">
                {fps} FPS
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="bg-card border border-border rounded-2xl p-8 flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-primary/30 rounded-full" />
                <div className="absolute inset-0 w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <p className="font-medium text-foreground">Loading AI Model</p>
                <p className="text-sm text-muted-foreground">
                  This may take a few seconds...
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {mode === "sign-to-speech" ? (
              /* Video Feed for Sign Detection */
              <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline />
                <canvas
                  ref={canvasRef}
                  className="w-full aspect-video scale-x-[-1] bg-secondary/50"
                />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                    <div className="bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
                      Live Feed
                    </div>
                  </div>
                  <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/50 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/50 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/50 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/50 rounded-br-lg" />
                </div>
              </div>
            ) : (
              /* Speech Input Interface */
              <div className="bg-card border border-border rounded-2xl p-8">
                <div className="text-center mb-8">
                  <div
                    className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
                      isListening
                        ? "bg-red-500/20 animate-pulse"
                        : "bg-primary/20"
                    }`}
                  >
                    <Mic
                      className={`w-12 h-12 ${isListening ? "text-red-500" : "text-primary"}`}
                    />
                  </div>
                  <button
                    onClick={toggleListening}
                    className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
                      isListening
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-primary hover:opacity-90 text-primary-foreground"
                    }`}
                  >
                    {isListening ? "Stop Listening" : "Start Speaking"}
                  </button>
                </div>

                {transcript && (
                  <div className="bg-secondary/50 rounded-xl p-6 border border-border/50">
                    <p className="text-sm text-muted-foreground mb-2">
                      Live Transcript:
                    </p>
                    <p className="text-xl text-foreground">{transcript}</p>
                  </div>
                )}
              </div>
            )}

            {/* Sentence Builder */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {mode === "sign-to-speech"
                    ? "Sentence Builder"
                    : "Generated Signs"}
                </h3>
                <Mic className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-h-[60px] bg-secondary/50 rounded-xl p-4 mb-4 border border-border/50">
                <p className="text-xl font-medium text-foreground">
                  {sentence.length > 0 ? (
                    sentence.join("")
                  ) : (
                    <span className="text-muted-foreground">
                      {mode === "sign-to-speech"
                        ? "Start signing to build a sentence..."
                        : "Start speaking to generate signs..."}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {mode === "sign-to-speech" && (
                  <>
                    <button
                      onClick={addToSentence}
                      disabled={!prediction}
                      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Add Letter
                      <kbd className="ml-1 px-1.5 py-0.5 bg-primary-foreground/20 rounded text-xs">
                        ↵
                      </kbd>
                    </button>
                    <button
                      onClick={addSpace}
                      className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-secondary/80"
                    >
                      <Space className="w-4 h-4" />
                      Space
                      <kbd className="ml-1 px-1.5 py-0.5 bg-foreground/10 rounded text-xs">
                        ␣
                      </kbd>
                    </button>
                  </>
                )}
                <button
                  onClick={clearSentence}
                  className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-destructive/20 hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
                <button
                  onClick={speakSentence}
                  disabled={sentence.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent/20 text-accent rounded-xl font-medium text-sm transition-all hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Volume2 className="w-4 h-4" />
                  Speak
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Current Detection */}
            {mode === "sign-to-speech" && (
              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  Current Sign
                </p>
                <div className="text-center py-6">
                  <div className="text-7xl font-bold text-foreground mb-4">
                    {prediction ? prediction.label : "—"}
                  </div>
                  {prediction && (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        Confidence: {(prediction.confidence * 100).toFixed(1)}%
                      </div>
                      <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300 rounded-full"
                          style={{ width: `${prediction.confidence * 100}%` }}
                        />
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        Ready to add (Enter)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                How to Use
              </h3>
              {mode === "sign-to-speech" ? (
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="text-primary">01</span>
                    <span>Allow camera access when prompted</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">02</span>
                    <span>Show your hand clearly to the camera</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">03</span>
                    <span>Make ASL signs for real-time detection</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">04</span>
                    <span>Press Enter or click to add letter</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">05</span>
                    <span>Click Speak to hear your sentence</span>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="text-primary">01</span>
                    <span>Click "Start Speaking" button</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">02</span>
                    <span>Allow microphone access</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">03</span>
                    <span>Speak clearly into your microphone</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">04</span>
                    <span>Watch your speech convert to signs</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary">05</span>
                    <span>Click Speak to replay the text</span>
                  </li>
                </ul>
              )}
            </div>

            {/* Debug Info */}
            {model && (
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  System Status
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
                  <div>Model</div>
                  <div className="text-emerald-400">Loaded ✓</div>
                  <div>Labels</div>
                  <div>{labels.length} classes</div>
                  <div>Mode</div>
                  <div>{mode === "sign-to-speech" ? "S→T" : "T→S"}</div>
                  {mode === "sign-to-speech" && (
                    <>
                      <div>MediaPipe</div>
                      <div
                        className={
                          mediaPipeLoaded
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {mediaPipeLoaded ? "Ready ✓" : "Loading..."}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
