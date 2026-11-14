import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  Lock,
  Unlock,
  RotateCcw,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
  Upload,
  X,
  Eye,
  EyeOff,
  Sliders,
  Camera as CameraIcon,
  Video as VideoIcon,
  Sun,
  Flame,
  Layers,
  Box
} from 'lucide-react';
import './ProjectionInterface.css';

const PRESET_VIDEOS = [
  {
    id: 'rose',
    name: 'Red Rose (Deep Black)',
    icon: '🌹',
    src: '/videos/rose_black.webm',
    desc: 'Vibrant red rose isolated on pitch black background (MacBook Pro XDR)'
  },
  {
    id: 'cactus',
    name: 'Cactus Bloom (Black BG)',
    icon: '🌵',
    src: '/videos/cactus_bloom.webm',
    desc: 'Six cactus flowers opening simultaneously on black background'
  },
  {
    id: 'mushroom',
    name: 'Oyster Mushrooms',
    icon: '🍄',
    src: '/videos/mushroom.webm',
    desc: 'Glowing mushroom colony growth timelapse'
  },
  {
    id: 'flower',
    name: 'Orange Blossom',
    icon: '🌸',
    src: '/videos/flower.webm',
    desc: 'Portulaca flower opening timelapse'
  },
  {
    id: 'sunset',
    name: 'Sky & Sunset',
    icon: '🌅',
    src: '/videos/sunset.webm',
    desc: 'Lake Huron clouds & sunset'
  }
];

export default function ProjectionInterface({ onSwitchMode }) {
  const [selectedVideo, setSelectedVideo] = useState(PRESET_VIDEOS[0].src);
  const [videoTitle, setVideoTitle] = useState(PRESET_VIDEOS[0].name);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Gesture Controls
  const [gestureMode, setGestureMode] = useState('pinch'); // 'pinch' | 'sweep' | 'openness'
  const [handDetected, setHandDetected] = useState(false);
  const [gestureValue, setGestureValue] = useState(0);
  const [fps, setFps] = useState(120);
  const [isGestureLocked, setIsGestureLocked] = useState(false);

  // UI Visibility States (Clean Immersive Cinema Mode)
  const [showControls, setShowControls] = useState(false); // Controls hidden by default!
  const [showCameraWindow, setShowCameraWindow] = useState(true); // Camera window shown by default
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Display & 120Hz Options
  const [fitMode, setFitMode] = useState('cover'); // 'cover' fills 100% screen edge-to-edge
  const [xdrBoost, setXdrBoost] = useState(true); // Liquid Retina XDR deep black + subject pop
  const [smoothingFactor, setSmoothingFactor] = useState(0.35); // Fast & fluid response
  const [invertGesture, setInvertGesture] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calibration ranges for Pinch (min dist: pinched, max dist: wide open)
  const [pinchMin, setPinchMin] = useState(0.04);
  const [pinchMax, setPinchMax] = useState(0.24);

  // Refs
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const targetProgress = useRef(0);
  const currentSmoothedProgress = useRef(0);
  const animationFrameId = useRef(null);
  const fileInputRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const lastSeekTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  const pendingSeekTimeRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const seekTimeoutRef = useRef(null);

  // Auto-hide controls when mouse is idle
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  // Keyboard shortcuts (Space: play/pause, C: toggle controls, F: fullscreen, H: toggle camera)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'c' || e.key === 'C') {
        setShowControls((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'h' || e.key === 'H') {
        setShowCameraWindow((prev) => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        handleStop();
      } else if (e.key === 'p' || e.key === 'P') {
        handlePause();
      } else if (e.key === 'l' || e.key === 'L') {
        toggleGestureLock();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, isPlaying, isGestureLocked]);

  // Fullscreen toggle for edge-to-edge MacBook Pro display
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Non-blocking Queued Video Seek with Watchdog (Eliminates decoder freeze)
  const applySeek = useCallback((targetTime) => {
    const v = videoRef.current;
    if (!v || isNaN(v.duration) || v.duration === 0) return;
    const clamped = Math.max(0, Math.min(v.duration - 0.02, targetTime));

    if (v.seeking || isSeekingRef.current) {
      pendingSeekTimeRef.current = clamped;
      return;
    }

    isSeekingRef.current = true;
    v.currentTime = clamped;

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      if (isSeekingRef.current) {
        isSeekingRef.current = false;
        if (pendingSeekTimeRef.current !== null) {
          const nextTime = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
          applySeek(nextTime);
        }
      }
    }, 75);
  }, []);

  const handleSeeked = useCallback(() => {
    isSeekingRef.current = false;
    if (pendingSeekTimeRef.current !== null) {
      const nextTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
      applySeek(nextTime);
    }
  }, [applySeek]);

  // 120Hz ProMotion-optimized Video Scrubbing Loop
  useEffect(() => {
    const updateScrubbing = () => {
      if (handDetected && !isGestureLocked && videoRef.current && duration > 0) {
        // High-precision responsive Lerp (Linear Interpolation)
        currentSmoothedProgress.current +=
          (targetProgress.current - currentSmoothedProgress.current) * smoothingFactor;

        const clamped = Math.max(0, Math.min(1, currentSmoothedProgress.current));
        const seekTime = clamped * duration;

        if (Math.abs(seekTime - lastSeekTimeRef.current) > 0.01) {
          lastSeekTimeRef.current = seekTime;
          applySeek(seekTime);
          setCurrentTime(seekTime);
        }
      }
      animationFrameId.current = requestAnimationFrame(updateScrubbing);
    };

    animationFrameId.current = requestAnimationFrame(updateScrubbing);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [handDetected, isGestureLocked, duration, smoothingFactor, applySeek]);

  // Initialize Google MediaPipe Hands
  useEffect(() => {
    let hands = null;
    let camera = null;
    let isCancelled = false;

    const setupMediaPipe = async () => {
      const HandsClass = window.Hands;
      const CameraClass = window.Camera;

      if (!HandsClass || !CameraClass) {
        console.warn('Waiting for MediaPipe...');
        setTimeout(setupMediaPipe, 250);
        return;
      }

      hands = new HandsClass({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults((results) => {
        if (isCancelled) return;

        // Monitor Realtime FPS
        frameCountRef.current += 1;
        const now = performance.now();
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current)));
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          setHandDetected(true);
          const landmarks = results.multiHandLandmarks[0];

          // 1. Draw Hand Skeleton (Glow Lines)
          if (window.drawConnectors && window.HAND_CONNECTIONS) {
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
              color: 'rgba(255, 255, 255, 0.85)',
              lineWidth: 2
            });
          }

          // 2. Draw Landmark Joints (Neon Cyan)
          if (window.drawLandmarks) {
            window.drawLandmarks(ctx, landmarks, {
              color: '#00f2fe',
              lineWidth: 1,
              radius: 3
            });
          }

          // 3. Highlight Thumb (4) and Index (8) Fingertips
          const thumb = landmarks[4];
          const index = landmarks[8];

          const tX = thumb.x * canvas.width;
          const tY = thumb.y * canvas.height;
          const iX = index.x * canvas.width;
          const iY = index.y * canvas.height;

          // Glowing laser connection between pinch fingers
          ctx.beginPath();
          ctx.moveTo(tX, tY);
          ctx.lineTo(iX, iY);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.stroke();

          // Thumb tip
          ctx.beginPath();
          ctx.arc(tX, tY, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#ff007a';
          ctx.fill();

          // Index tip
          ctx.beginPath();
          ctx.arc(iX, iY, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#00f2fe';
          ctx.fill();

          // 4. Compute Scale-Invariant Gesture Values
          let rawProgress = 0;

          // Reference points for dynamic user distance calibration
          const wrist = landmarks[0];
          const middleMCP = landmarks[9];
          const handScale = Math.max(
            0.08,
            Math.sqrt(
              Math.pow(middleMCP.x - wrist.x, 2) + Math.pow(middleMCP.y - wrist.y, 2)
            )
          );

          if (gestureMode === 'pinch') {
            const dx = index.x - thumb.x;
            const dy = index.y - thumb.y;
            const rawDist = Math.sqrt(dx * dx + dy * dy);
            const pinchRatio = rawDist / handScale;

            // Pinched shut ~0.15, fully open ~0.75
            const normalized = (pinchRatio - 0.15) / (0.75 - 0.15);
            rawProgress = Math.max(0, Math.min(1, normalized));
          } else if (gestureMode === 'sweep') {
            // Horizontal hand sweep across webcam (landmark 9 is center MCP)
            const palmX = 1 - landmarks[9].x;
            rawProgress = Math.max(0, Math.min(1, (palmX - 0.15) / 0.7));
          } else if (gestureMode === 'openness') {
            const tips = [4, 8, 12, 16, 20];
            let total = 0;
            tips.forEach((idx) => {
              const dx = landmarks[idx].x - wrist.x;
              const dy = landmarks[idx].y - wrist.y;
              total += Math.sqrt(dx * dx + dy * dy);
            });
            const avg = total / tips.length;
            const openRatio = avg / handScale;
            // Fist ~0.50, open palm ~1.25
            rawProgress = Math.max(0, Math.min(1, (openRatio - 0.5) / (1.25 - 0.5)));
          }

          // Auto-resume hand tracking if user actively moves hand
          if (isGestureLocked) {
            if (Math.abs(rawProgress - targetProgress.current) > 0.1) {
              setIsGestureLocked(false);
            }
          }

          if (!isGestureLocked) {
            const finalProgress = invertGesture ? 1 - rawProgress : rawProgress;
            targetProgress.current = finalProgress;
            setGestureValue(finalProgress);

            if (videoRef.current && !videoRef.current.paused) {
              videoRef.current.pause();
              setIsPlaying(false);
            }
          }
        } else {
          setHandDetected(false);
        }

        ctx.restore();
      });

      if (webcamRef.current) {
        camera = new CameraClass(webcamRef.current, {
          onFrame: async () => {
            if (isProcessingFrameRef.current) return;
            isProcessingFrameRef.current = true;
            try {
              if (webcamRef.current && hands) {
                await hands.send({ image: webcamRef.current });
              }
            } catch (err) {
              console.error(err);
            } finally {
              isProcessingFrameRef.current = false;
            }
          },
          width: 320,
          height: 240
        });
        camera.start();
      }
    };

    setupMediaPipe();

    return () => {
      isCancelled = true;
      if (camera) camera.stop();
      if (hands) hands.close();
    };
  }, [gestureMode, invertGesture, pinchMin, pinchMax]);

  const handleTimeUpdate = () => {
    if (videoRef.current && !handDetected) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const switchVideo = (preset) => {
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    isSeekingRef.current = false;
    pendingSeekTimeRef.current = null;
    lastSeekTimeRef.current = 0;
    targetProgress.current = 0;
    currentSmoothedProgress.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setIsGestureLocked(false);

    setSelectedVideo(preset.src);
    setVideoTitle(preset.name);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      isSeekingRef.current = false;
      pendingSeekTimeRef.current = null;
    }
  };

  const handleCanPlay = () => {
    isSeekingRef.current = false;
  };

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
      setIsGestureLocked(true); // lock gesture scrub so video can play smoothly
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsGestureLocked(true); // freeze frame in place
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      targetProgress.current = 0;
      currentSmoothedProgress.current = 0;
      lastSeekTimeRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(false);
      setIsGestureLocked(true); // stop and reset to start
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        handlePlay();
      } else {
        handlePause();
      }
    }
  };

  const toggleGestureLock = () => {
    setIsGestureLocked((prev) => !prev);
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const seekTime = ratio * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
      targetProgress.current = ratio;
      currentSmoothedProgress.current = ratio;
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      switchVideo({ id: 'custom', src: url, name: file.name, desc: 'Uploaded Video' });
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div
      ref={containerRef}
      className="projection-container"
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
    >
      {/* 100% Screen Video Stage */}
      <div className={`video-stage ${fitMode === 'cover' ? 'mode-cover' : 'mode-contain'}`}>
        <video
          ref={videoRef}
          key={selectedVideo}
          src={selectedVideo}
          className={`main-video ${xdrBoost ? 'xdr-boost' : ''}`}
          playsInline
          loop
          muted
          autoPlay
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={handleCanPlay}
          onSeeked={handleSeeked}
          onSeeking={() => { isSeekingRef.current = true; }}
        />
        <div className="pure-black-backdrop" />
      </div>

      {/* Floating "Camera Tracking" Window (Always visible or toggleable, matching the video) */}
      {showCameraWindow && (
        <div className={`camera-floating-window ${handDetected ? 'is-tracking' : ''}`}>
          <div className="camera-window-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className={`status-dot ${handDetected ? 'tracked' : ''}`} />
              <span className="camera-window-title">Camera tracking</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="mini-header-btn"
                onClick={isPlaying ? handlePause : handlePlay}
                title={isPlaying ? "Pause (Space or P)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={10} /> : <Play size={10} />}
              </button>
              <button
                className="mini-header-btn"
                onClick={handleStop}
                title="Stop & Rewind to 0:00 (S)"
              >
                <Square size={9} />
              </button>
              <button
                className="camera-window-close"
                onClick={() => setShowCameraWindow(false)}
                title="Hide Camera Window (Press 'H' to show again)"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="camera-preview-wrapper">
            <video
              ref={webcamRef}
              className="webcam-video"
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={canvasRef}
              className="tracking-canvas"
              width={320}
              height={240}
            />
          </div>

          <div className="tracking-status-bar">
            <span className={`tracking-pill ${handDetected ? 'active' : 'inactive'}`}>
              ● {handDetected ? 'Hand Locked' : 'Show hand to camera'}
            </span>
            <span style={{ color: '#00f2fe', fontWeight: 600 }}>120 Hz</span>
          </div>
        </div>
      )}

      {/* Quick Minimalist Hover Hotspot Trigger at the Bottom */}
      {!showControls && (
        <div
          className="bottom-trigger-bar"
          onClick={() => setShowControls(true)}
          title="Click or Move Mouse to Show Video Controls"
        >
          <span className="trigger-pill">
            <Eye size={13} />
            <span>Controls & Presets (Press 'C')</span>
          </span>
        </div>
      )}

      {/* TOP HEADER OVERLAY (Hidden in Cinema Mode, shown on activity) */}
      <header className={`top-header ${showControls ? 'visible' : 'hidden'}`}>
        <div className="brand-badge">
          <span className={`pulse-dot ${handDetected ? '' : 'inactive'}`} />
          <h1 className="brand-title">ChronoGrip</h1>
          <span className="brand-tag">Gesture Time Scrubber</span>
        </div>

        <div className="header-actions">
          {/* Fit Mode Toggle: Edge-to-Edge Fill vs Centered */}
          <button
            className="icon-btn"
            onClick={() => setFitMode(fitMode === 'cover' ? 'contain' : 'cover')}
            title="Toggle All-Screen Fill vs Aspect Ratio"
          >
            <Layers size={15} />
            <span>{fitMode === 'cover' ? 'Fill Screen' : 'Fit Center'}</span>
          </button>

          {/* Liquid Retina XDR Boost */}
          <button
            className={`icon-btn ${xdrBoost ? 'active' : ''}`}
            onClick={() => setXdrBoost(!xdrBoost)}
            title="MacBook Liquid Retina XDR Deep Black & Subject Boost"
          >
            <Sun size={15} />
            <span>XDR Boost</span>
          </button>

          {/* Fullscreen */}
          <button
            className="icon-btn"
            onClick={toggleFullscreen}
            title="Go Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
          </button>

          {/* Settings Toggle */}
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings & Smoothing"
          >
            <Sliders size={15} />
            <span>Tune</span>
          </button>

          {/* ML Info */}
          <button
            className="icon-btn"
            onClick={() => setShowInfoModal(true)}
            title="ML Model Architecture"
          >
            <Info size={15} />
            <span>Model Info</span>
          </button>

          {/* Upload Custom 4K Clip */}
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload any 4K/HDR video from your Mac"
          >
            <Upload size={15} />
            <span>Load Video</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/*"
            style={{ display: 'none' }}
          />

          {/* Switch to the 3D physics lab */}
          {onSwitchMode && (
            <button
              className="icon-btn"
              onClick={onSwitchMode}
              title="Switch to HoloKinetic Lab"
            >
              <Box size={15} />
              <span>HoloKinetic Lab</span>
            </button>
          )}

          {/* Hide Controls Button */}
          <button
            className="icon-btn"
            onClick={() => setShowControls(false)}
            title="Hide all overlays (Cinema Mode)"
          >
            <EyeOff size={15} />
            <span>Hide UI</span>
          </button>
        </div>
      </header>

      {/* Floating Gesture HUD (Shown only when controls are visible or hand is active) */}
      <aside className={`gesture-hud ${showControls ? 'visible' : 'hidden'}`}>
        <div className="hud-title-row">
          <span className="hud-label">Gesture Position</span>
          <span className="hud-value">{Math.round(gestureValue * 100)}%</span>
        </div>
        <div className="hud-bar-bg">
          <div
            className="hud-bar-fill"
            style={{ width: `${Math.round(gestureValue * 100)}%` }}
          />
        </div>
        <div className="hud-help-hint">
          {handDetected ? (
            <span style={{ color: '#38bdf8' }}>
              ⚡ Controlling Time: {gestureMode === 'pinch' ? 'Pinch/Spread' : gestureMode === 'sweep' ? 'Sweep Hand' : 'Palm Openness'}
            </span>
          ) : (
            <span>✋ Raise hand to control video frames</span>
          )}
        </div>
      </aside>

      {/* Settings Flyout */}
      {showSettings && showControls && (
        <div className="settings-flyout glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
              120Hz Smoothing (Lerp)
            </h4>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {smoothingFactor.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.05"
            max="0.4"
            step="0.01"
            value={smoothingFactor}
            onChange={(e) => setSmoothingFactor(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#00f2fe' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Invert Direction</span>
            <input
              type="checkbox"
              checked={invertGesture}
              onChange={(e) => setInvertGesture(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#00f2fe' }}
            />
          </div>
        </div>
      )}

      {/* BOTTOM CONTROL DOCK (Shown on activity, Hidden in Cinema Mode) */}
      <footer className={`bottom-dock ${showControls ? 'visible' : 'hidden'}`}>
        {/* Timeline Scrubber */}
        <div className="timeline-container">
          <div className="timeline-meta">
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{videoTitle}</span>
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="timeline-track-wrapper" onClick={handleSeek}>
            <div className="timeline-rail">
              <div
                className="timeline-fill"
                style={{
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
                }}
              />
            </div>
            <div
              className={`timeline-thumb ${handDetected ? 'hand-active' : ''}`}
              style={{
                left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
              }}
            />
          </div>
        </div>

        {/* Video Presets and Gesture Modes */}
        <div className="dock-controls-row">
          {/* Black Background / Bright Subject Presets */}
          <div className="video-presets-group">
            {PRESET_VIDEOS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-chip ${selectedVideo === preset.src ? 'active' : ''}`}
                onClick={() => switchVideo(preset)}
                title={preset.desc}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <div className="mode-selector">
            <button
              className={`mode-tab ${gestureMode === 'pinch' ? 'active' : ''}`}
              onClick={() => setGestureMode('pinch')}
              title="Pinch thumb & index finger to manipulate time"
            >
              👌 Pinch Scrub
            </button>
            <button
              className={`mode-tab ${gestureMode === 'sweep' ? 'active' : ''}`}
              onClick={() => setGestureMode('sweep')}
              title="Sweep hand across screen"
            >
              ↔ Sweep
            </button>
            <button
              className={`mode-tab ${gestureMode === 'openness' ? 'active' : ''}`}
              onClick={() => setGestureMode('openness')}
              title="Open hand to bloom / fist to rewind"
            >
              🖐 Palm
            </button>
          </div>

          {/* Playback Controls (Play, Pause, Stop, Lock) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className={`icon-btn ${isPlaying ? 'active' : ''}`}
              onClick={handlePlay}
              title="Play Video at Normal Speed"
            >
              <Play size={14} />
              <span>Play</span>
            </button>

            <button
              className={`icon-btn ${!isPlaying && isGestureLocked && currentTime > 0 ? 'active' : ''}`}
              onClick={handlePause}
              title="Pause Video at Current Frame (Space or P)"
            >
              <Pause size={14} />
              <span>Pause</span>
            </button>

            <button
              className="icon-btn"
              onClick={handleStop}
              title="Stop & Rewind to 0:00 (S)"
            >
              <Square size={13} />
              <span>Stop</span>
            </button>

            <button
              className={`icon-btn ${isGestureLocked ? 'active' : ''}`}
              onClick={toggleGestureLock}
              title={isGestureLocked ? "Hand Tracking Paused (Click to Resume Hand Control)" : "Freeze Current Frame"}
            >
              {isGestureLocked ? <Lock size={13} /> : <Unlock size={13} />}
              <span>{isGestureLocked ? 'Locked' : 'Hand Active'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* ML Model Explanation Modal */}
      {showInfoModal && (
        <div className="modal-backdrop" onClick={() => setShowInfoModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Sparkles size={18} color="#00f2fe" />
                <span>MediaPipe Hands Deep Neural Architecture</span>
              </div>
              <button
                className="camera-window-close"
                onClick={() => setShowInfoModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="info-box">
                <h4 style={{ color: '#fff', marginBottom: '6px' }}>
                  Pre-trained Model • 0 Training Needed
                </h4>
                <p>
                  Google MediaPipe Hands runs a 2-stage detector (BlazePalm + 3D Landmark Regressor).
                  It detects 21 joints per hand at 120 FPS directly on your MacBook Pro Apple Silicon GPU using WebAssembly & WebGL.
                </p>
              </div>

              <h4 style={{ color: '#fff', fontSize: '14px' }}>Tracking Nodes:</h4>
              <div className="landmark-diagram-grid">
                <div className="landmark-card">
                  <span>Landmark #4</span>: Thumb Tip (Pink Node)
                </div>
                <div className="landmark-card">
                  <span>Landmark #8</span>: Index Tip (Cyan Node)
                </div>
                <div className="landmark-card">
                  <span>Landmark #0</span>: Wrist Joint (Base)
                </div>
                <div className="landmark-card">
                  <span>Landmark #9</span>: Middle MCP (Hand Center)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
