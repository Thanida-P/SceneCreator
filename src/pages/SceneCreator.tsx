import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { createXRStore, XR } from "@react-three/xr";
import { makeAuthenticatedRequest } from "../utils/Auth";
import { SceneContent } from "../components/scene/SceneContent";

const xrStore = createXRStore();

interface DigitalHome {
  id: number;
  name: string;
  home_id: number;
  deployedItems: Array<{ id: string; is_container: boolean }>;
  spatialData: {
    id: number;
    positions: any;
    rotation: any;
    scale: any;
    boundary: {
      min_x: number;
      max_x: number;
      min_y: number;
      max_y: number;
      min_z: number;
      max_z: number;
    };
  };
  texture_id: number | null;
  created_at: string;
  updated_at: string;
}

export function SceneCreator() {
  const { homeId } = useParams<{ homeId: string }>();
  const navigate = useNavigate();
  const [digitalHome, setDigitalHome] = useState<DigitalHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arModeRequested, setArModeRequested] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0); // Key to force Canvas remount if needed

  useEffect(() => {
    if (!homeId) {
      navigate('/');
      return;
    }

    const loadDigitalHome = async () => {
      try {
        const response = await makeAuthenticatedRequest(`/digitalhomes/get_digital_home/${homeId}/`);
        
        if (response.ok) {
          const data = await response.json();
          setDigitalHome(data.digital_home);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to load digital home');
        }
      } catch (error) {
        console.error('Error loading digital home:', error);
        setError(error instanceof Error ? error.message : 'Failed to load digital home');
      } finally {
        setLoading(false);
      }
    };

    loadDigitalHome();
  }, [homeId, navigate]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f7fa',
        color: '#1e293b',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid rgba(59, 130, 246, 0.3)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem',
          }} />
          <p>Loading scene editor...</p>
        </div>
      </div>
    );
  }

  if (error || !digitalHome) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f7fa',
        color: '#1e293b',
        flexDirection: 'column',
      }}>
        <h2 style={{ color: '#f87171', marginBottom: '1rem' }}>Error Loading Scene</h2>
        <p style={{ marginBottom: '2rem', maxWidth: '500px', textAlign: 'center' }}>
          {error || 'Digital home not found'}
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {error && error.includes('WebGL') && (
            <button
              onClick={() => {
                setError(null);
                setCanvasKey(prev => prev + 1);
                window.location.reload();
              }}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Retry / Refresh
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.75rem 1.5rem',
              background: error && error.includes('WebGL') ? '#6b7280' : '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas 
        key={canvasKey}
        style={{ 
          width: "100vw", 
          height: "100vh", 
          position: "fixed",
          backgroundColor: arModeRequested ? 'transparent' : '#808080'
        }}
        gl={{ 
          alpha: true, 
          antialias: true, 
          preserveDrawingBuffer: true,
          premultipliedAlpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
          stencil: false,
          depth: true
        }}
        onCreated={({ gl }) => {
          // Handle WebGL context loss
          const handleContextLost = (event: Event) => {
            event.preventDefault();
            console.warn('WebGL context lost, attempting to restore...');
            setError('WebGL context lost. Please refresh the page.');
            
            // Try to restore context after a delay
            setTimeout(() => {
              try {
                // Check if context is still lost
                const canvas = gl.domElement;
                const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (!context || context.isContextLost()) {
                  // Force page reload if context cannot be restored
                  console.warn('Context cannot be restored, reloading page...');
                  window.location.reload();
                }
              } catch (err) {
                console.error('Failed to restore context:', err);
                // Reload page as last resort
                window.location.reload();
              }
            }, 2000);
          };

          const handleContextRestored = () => {
            console.log('WebGL context restored');
            setError(null);
            // Reset canvas key to force remount if needed
            setCanvasKey(prev => prev + 1);
          };

          // Add event listeners
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', handleContextLost);
          canvas.addEventListener('webglcontextrestored', handleContextRestored);

          // Cleanup on unmount
          return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
          };
        }}
        onError={(error) => {
          console.error('Canvas error:', error);
          setError('Failed to initialize 3D renderer. Please refresh the page.');
        }}
      >
        <XR 
          store={xrStore} 
          sessionInit={arModeRequested ? {
            mode: 'immersive-ar',
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
            // Note: 'dom-overlay' is not supported in AR mode, so we don't include it
          } : {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
          }}
        >
          {homeId && <SceneContent homeId={homeId} digitalHome={digitalHome} arModeRequested={arModeRequested} />}
        </XR>
      </Canvas>

      <div style={{ 
        position: "fixed", 
        width: "100vw", 
        height: "100vh", 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "flex-end", 
        pointerEvents: "none" 
      }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button
            style={{
              padding: "12px 24px",
              backgroundColor: "#4CAF50",
              color: "#1e293b",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              pointerEvents: "auto"
            }}
            onClick={() => {
              setArModeRequested(false);
              xrStore.enterVR().catch((err) => console.warn("Failed to enter VR:", err));
            }}
          >
            Enter VR
          </button>
          <button
            style={{
              padding: "12px 24px",
              backgroundColor: "#2196F3",
              color: "#1e293b",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              pointerEvents: "auto"
            }}
            onClick={async () => {
              try {
                // Check if AR is supported first
                if (navigator.xr && (navigator.xr as any).isSessionSupported) {
                  const isARSupported = await (navigator.xr as any).isSessionSupported('immersive-ar');
                  
                  if (isARSupported) {
                    // End current session if exists
                    const currentSession = xrStore.getState().session;
                    if (currentSession) {
                      await currentSession.end();
                      // Wait for session to fully end
                      await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                    // Set AR mode requested flag - ARSessionHandler component will handle the session creation
                    setArModeRequested(true);
                    console.log('AR mode requested - session will be initialized by ARSessionHandler');
                  } else {
                    console.warn('AR not supported, falling back to VR');
                    setArModeRequested(false);
                    await xrStore.enterVR();
                  }
                } else {
                  console.warn('XR not available');
                  setArModeRequested(false);
                }
              } catch (err) {
                console.error("Failed to enter AR:", err);
                setArModeRequested(false);
                // Fallback to VR
                try {
                  await xrStore.enterVR();
                } catch (vrErr) {
                  console.error("Failed to enter VR:", vrErr);
                }
              }
            }}
          >
            Enter AR
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}