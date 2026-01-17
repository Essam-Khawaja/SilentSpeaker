// SignToSpeech.jsx
import { useState, useRef, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import { Plus, Space, Trash2, Volume2 } from "lucide-react";

export default function SignToSpeech({ setFps, setModel, setMediaPipeLoaded }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [prediction, setPrediction] = useState(null);
  const [sentence, setSentence] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localModel, setLocalModel] = useState(null);

  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const drawingUtilsRef = useRef(null);
  const handConnectionsRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());

  // Load MediaPipe
  useEffect(() => {
    async function loadMediaPipe() {
      try {
        const [handsModule, cameraModule, drawingModule] = await Promise.all([
          import("@mediapipe/hands"),
          import("@mediapipe/camera_utils"),
          import("@mediapipe/drawing_utils"),
        ]);

        drawingUtilsRef.current = drawingModule;
        handConnectionsRef.current = handsModule.HAND_CONNECTIONS;
        setMediaPipeLoaded(true);
      } catch (err) {
        console.error("MediaPipe error:", err);
        setError("Failed to load MediaPipe modules");
      }
    }
    loadMediaPipe();
  }, [setMediaPipeLoaded]);

  // Load labels
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

  // Load model
  useEffect(() => {
    async function loadModel() {
      if (labels.length === 0) return;

      try {
        setIsLoading(true);
        const loadedModel = await tf.loadLayersModel(
          "/models/keypoint_classifier/model.json",
        );
        setLocalModel(loadedModel);
        setModel(loadedModel);
        setIsLoading(false);
      } catch (error) {
        console.error("Model error:", error);
        setError(
          `Failed to load model: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setIsLoading(false);
      }
    }
    loadModel();
  }, [labels, setModel]);

  // Initialize camera
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !localModel) return;

    async function initializeCamera() {
      try {
        const handsModule = await import("@mediapipe/hands");
        const cameraModule = await import("@mediapipe/camera_utils");

        const hands = new handsModule.Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        });

        handsRef.current = hands;
        hands.onResults(onResults);

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
  }, [localModel]);

  const preprocessLandmarks = (landmarks) => {
    let points = [];
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

  const predict = async (landmarks) => {
    if (!localModel || labels.length === 0) return null;

    try {
      const processed = preprocessLandmarks(landmarks);
      const inputTensor = tf.tensor2d([processed], [1, 42]);
      const prediction = localModel.predict(inputTensor);
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

  const onResults = async (results) => {
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
        if (pred) setPrediction(pred);
      }
    } else {
      setPrediction(null);
    }

    ctx.restore();
  };

  const speakWithAI = () => {
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
    const handleKeyDown = (e) => {
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md">
          <h2 className="text-xl font-semibold text-destructive mb-4">Error</h2>
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
    <>
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
        <div className="lg:col-span-2 space-y-6">
          {/* Video Feed */}
          <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
            <video ref={videoRef} className="hidden" playsInline />
            <canvas
              ref={canvasRef}
              className="w-full aspect-video scale-x-[-1] bg-secondary/50"
            />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
                Live Feed
              </div>
              <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/50 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/50 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/50 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/50 rounded-br-lg" />
            </div>
          </div>

          {/* Sentence Builder */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Sentence Builder
            </h3>
            <div className="min-h-[60px] bg-secondary/50 rounded-xl p-4 mb-4 border border-border/50">
              <p className="text-xl font-medium text-foreground">
                {sentence.length > 0 ? (
                  sentence.join("")
                ) : (
                  <span className="text-muted-foreground">
                    Start signing to build a sentence...
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  prediction && setSentence([...sentence, prediction.label])
                }
                disabled={!prediction}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Letter
              </button>
              <button
                onClick={() => setSentence([...sentence, " "])}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-secondary/80"
              >
                <Space className="w-4 h-4" />
                Space
              </button>
              <button
                onClick={() => setSentence([])}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-destructive/20 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
              <button
                onClick={speakWithAI}
                disabled={sentence.length === 0 || isSpeaking}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent/20 text-accent rounded-xl font-medium text-sm transition-all hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Volume2 className="w-4 h-4" />
                {isSpeaking ? "Speaking..." : "Speak"}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              How to Use
            </h3>
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
          </div>
        </div>
      </div>
    </>
  );
}
