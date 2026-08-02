import React, { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles } from "../lib/theme";
import { Activity, Radio } from "lucide-react";

type VisualizerStyle = "bars" | "wave" | "circle" | "led";

export const Visualizer: React.FC = () => {
  const { analyserNode, isPlaying, theme } = useAudio();
  const [style, setStyle] = useState<VisualizerStyle>("led");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 250 });

  const activeStyles = themeStyles[theme] || themeStyles.red;

  // Handle ResizeObserver to strictly comply with canvas guidelines
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 100),
        height: Math.max(height, 150),
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Real-time canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const width = dimensions.width;
    const height = dimensions.height;

    // Buffer for analyser data
    let bufferLength = analyserNode ? analyserNode.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      // Loop
      animationRef.current = requestAnimationFrame(draw);

      if (analyserNode && isPlaying) {
        if (style === "wave") {
          analyserNode.getByteTimeDomainData(dataArray);
        } else {
          analyserNode.getByteFrequencyData(dataArray);
        }
      } else {
        // Subtle ambient state waveforms when paused
        for (let i = 0; i < bufferLength; i++) {
          if (style === "wave") {
            dataArray[i] = 128 + Math.sin(i * 0.1) * 3.5;
          } else {
            dataArray[i] = Math.max(4, Math.sin(i * 0.15) * 8 + 4);
          }
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Dark background
      ctx.fillStyle = "rgba(9, 9, 11, 0.95)";
      ctx.fillRect(0, 0, width, height);

      if (style === "bars") {
        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * (height - 30);

          let barColor = `hsla(0, 95%, 55%, ${isPlaying ? 0.9 : 0.45})`;
          if (theme === "green") {
            barColor = `hsla(142, 70%, 45%, ${isPlaying ? 0.9 : 0.45})`;
          } else if (theme === "blue") {
            barColor = `hsla(217, 91%, 56%, ${isPlaying ? 0.9 : 0.45})`;
          } else if (theme === "orange") {
            barColor = `hsla(24, 94%, 50%, ${isPlaying ? 0.9 : 0.45})`;
          } else if (theme === "slate") {
            barColor = `hsla(240, 5%, 65%, ${isPlaying ? 0.9 : 0.45})`;
          }

          ctx.fillStyle = barColor;
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight - 10, barWidth - 1.5, barHeight + 5, [3, 3, 0, 0]);
          ctx.fill();

          x += barWidth;
        }
      } else if (style === "wave") {
        ctx.lineWidth = 3;
        
        let strokeColor = "#dc2626";
        if (theme === "green") strokeColor = "#10b981";
        else if (theme === "blue") strokeColor = "#3b82f6";
        else if (theme === "orange") strokeColor = "#f97316";
        else if (theme === "slate") strokeColor = "#cbd5e1";

        ctx.strokeStyle = strokeColor;
        ctx.shadowBlur = isPlaying ? 10 : 3;
        ctx.shadowColor = strokeColor;

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (style === "circle") {
        const centerX = width / 2;
        const centerY = height / 2;
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avgVolume = sum / bufferLength;
        const pulse = (avgVolume / 255) * 45;
        const baseRadius = Math.min(width, height) * 0.22 + pulse;

        // Pulsing halo ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.25, 0, 2 * Math.PI);
        
        let strokeColor = "rgba(220, 38, 38, 0.2)";
        if (theme === "green") strokeColor = "rgba(16, 185, 129, 0.2)";
        else if (theme === "blue") strokeColor = "rgba(59, 130, 246, 0.2)";
        else if (theme === "orange") strokeColor = "rgba(249, 115, 22, 0.2)";
        else if (theme === "slate") strokeColor = "rgba(203, 213, 225, 0.2)";

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 4;
        ctx.stroke();

        const numRays = Math.min(bufferLength, 80);
        for (let i = 0; i < numRays; i++) {
          const angle = (i / numRays) * Math.PI * 2;
          const amplitude = (dataArray[i] / 255) * 60;
          
          const startX = centerX + Math.cos(angle) * baseRadius;
          const startY = centerY + Math.sin(angle) * baseRadius;
          const endX = centerX + Math.cos(angle) * (baseRadius + amplitude);
          const endY = centerY + Math.sin(angle) * (baseRadius + amplitude);

          let rayColor = `hsla(0, 95%, 55%, ${isPlaying ? 0.85 : 0.35})`;
          if (theme === "green") {
            rayColor = `hsla(142, 70%, 45%, ${isPlaying ? 0.85 : 0.35})`;
          } else if (theme === "blue") {
            rayColor = `hsla(217, 91%, 56%, ${isPlaying ? 0.85 : 0.35})`;
          } else if (theme === "orange") {
            rayColor = `hsla(24, 94%, 50%, ${isPlaying ? 0.85 : 0.35})`;
          } else if (theme === "slate") {
            rayColor = `hsla(240, 5%, 65%, ${isPlaying ? 0.85 : 0.35})`;
          }

          ctx.strokeStyle = rayColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }

        const circleGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, baseRadius);
        if (theme === "green") {
          circleGrad.addColorStop(0, "rgba(16, 185, 129, 0.95)");
          circleGrad.addColorStop(1, "rgba(4, 120, 87, 0.85)");
        } else if (theme === "blue") {
          circleGrad.addColorStop(0, "rgba(59, 130, 246, 0.95)");
          circleGrad.addColorStop(1, "rgba(29, 78, 216, 0.85)");
        } else if (theme === "orange") {
          circleGrad.addColorStop(0, "rgba(249, 115, 22, 0.95)");
          circleGrad.addColorStop(1, "rgba(194, 65, 12, 0.85)");
        } else if (theme === "slate") {
          circleGrad.addColorStop(0, "rgba(148, 163, 184, 0.95)");
          circleGrad.addColorStop(1, "rgba(71, 85, 105, 0.85)");
        } else {
          circleGrad.addColorStop(0, "rgba(220, 38, 38, 0.95)");
          circleGrad.addColorStop(1, "rgba(185, 28, 28, 0.85)");
        }

        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
        ctx.fill();
      } else if (style === "led") {
        const numCols = Math.min(bufferLength, 32);
        const numRows = 12;
        const colWidth = width / numCols;
        const rowHeight = (height - 20) / numRows;

        for (let c = 0; c < numCols; c++) {
          const amplitude = dataArray[c] / 255;
          const activeRows = Math.floor(amplitude * numRows);

          for (let r = 0; r < numRows; r++) {
            const rowIndexFromBottom = numRows - 1 - r;
            const isLit = rowIndexFromBottom < activeRows;

            let ledColor = "rgba(255, 255, 255, 0.04)";
            if (!isLit) {
              if (theme === "green") {
                ledColor = "rgba(16, 185, 129, 0.05)";
              } else if (theme === "blue") {
                ledColor = "rgba(59, 130, 246, 0.05)";
              } else if (theme === "orange") {
                ledColor = "rgba(249, 115, 22, 0.05)";
              } else if (theme === "slate") {
                ledColor = "rgba(148, 163, 184, 0.05)";
              } else {
                ledColor = "rgba(220, 38, 38, 0.05)";
              }
            } else {
              // Classic authentic LED colors
              if (r < 3) {
                ledColor = "rgba(239, 68, 68, 0.95)"; // Red
              } else if (r < 6) {
                ledColor = "rgba(245, 158, 11, 0.95)"; // Orange/Yellow
              } else {
                ledColor = "rgba(16, 185, 129, 0.95)"; // Green
              }
            }

            ctx.fillStyle = ledColor;
            ctx.fillRect(
              c * colWidth + 2,
              r * rowHeight + 2,
              colWidth - 4,
              rowHeight - 4
            );
          }
        }
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserNode, style, dimensions, isPlaying, theme]);

  return (
    <div id="visualizer-container" className="flex flex-col gap-3 h-full bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${activeStyles.text} animate-pulse`} />
          <h3 className="font-bold text-slate-100 text-sm md:text-base">Real-time Visualizer</h3>
        </div>
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-850">
          {(["bars", "wave", "circle", "led"] as VisualizerStyle[]).map((mode) => (
            <button
              id={`visualizer-btn-${mode}`}
              key={mode}
              onClick={() => setStyle(mode)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all capitalize cursor-pointer touch-target min-h-[32px] flex items-center ${
                style === mode
                  ? `${activeStyles.bg} text-white shadow-md`
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 w-full min-h-[160px] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-900">
        <canvas ref={canvasRef} className="block w-full h-full" />
        {!isPlaying && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 pointer-events-none">
            <Radio className="w-6 h-6 text-zinc-700 animate-pulse" />
            <span className="text-xs text-zinc-500 font-mono">Audio Engine Standby</span>
          </div>
        )}
      </div>
    </div>
  );
};
export default Visualizer;
