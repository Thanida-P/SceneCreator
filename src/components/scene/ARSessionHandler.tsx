import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useXRStore } from "@react-three/xr";
import * as THREE from "three";

interface ARSessionHandlerProps {
  arModeRequested: boolean;
  onARSessionReady?: () => void;
}

export function ARSessionHandler({ arModeRequested, onARSessionReady }: ARSessionHandlerProps) {
  const { gl } = useThree();
  const xrStore = useXRStore();
  const sessionRequestedRef = useRef(false);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    // Don't process if already processing or if AR not requested
    if (!arModeRequested) {
      // Reset flags when AR is not requested
      sessionRequestedRef.current = false;
      isProcessingRef.current = false;
      return;
    }
    
    // Prevent multiple simultaneous requests
    if (sessionRequestedRef.current || isProcessingRef.current) {
      console.log('AR session request already in progress, skipping...');
      return;
    }
    
    // Check if session is already AR
    const currentSession = xrStore.getState().session;
    if (currentSession && (currentSession as any).mode === 'immersive-ar') {
      console.log('AR session already active');
      sessionRequestedRef.current = true;
      return;
    }
    
    isProcessingRef.current = true;
    
    const requestARSession = async () => {
      try {
        // Check if AR is supported
        if (!navigator.xr || !(navigator.xr as any).isSessionSupported) {
          console.warn('XR not available');
          isProcessingRef.current = false;
          return;
        }

        const isARSupported = await (navigator.xr as any).isSessionSupported('immersive-ar');
        if (!isARSupported) {
          console.warn('AR not supported');
          isProcessingRef.current = false;
          return;
        }

        // End current session if exists and is not AR
        if (currentSession && (currentSession as any).mode !== 'immersive-ar') {
          try {
            // Check if session is still active before ending
            if (!currentSession.ended) {
              await currentSession.end();
              // Wait longer for cleanup to prevent context loss
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (err) {
            console.warn('Error ending previous session:', err);
            // Continue anyway - session might already be ended
          }
        }

        // Check if renderer is available
        if (!gl || !gl.xr) {
          console.warn('Renderer not ready, waiting...');
          // Wait for renderer
          let retries = 0;
          while ((!gl || !gl.xr) && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 200));
            retries++;
          }
          if (!gl || !gl.xr) {
            console.error('Renderer not available after waiting');
            isProcessingRef.current = false;
            return;
          }
        }

        // Request AR session (without dom-overlay)
        const arSession = await (navigator.xr as any).requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
          // Note: 'dom-overlay' is not supported in AR mode
        });

        // Set the AR session on the renderer
        if (gl && gl.xr) {
          await gl.xr.setSession(arSession);
          xrStore.setState({ session: arSession });
          
          // Add session end listener
          arSession.addEventListener('end', () => {
            xrStore.setState({ session: null });
            sessionRequestedRef.current = false;
            isProcessingRef.current = false;
          });
          
          sessionRequestedRef.current = true;
          isProcessingRef.current = false;
          console.log('AR session started successfully');
          console.log('Environment blend mode:', (arSession as any).environmentBlendMode);
          onARSessionReady?.();
        } else {
          console.error('Renderer or XR manager not available');
          await arSession.end();
          isProcessingRef.current = false;
        }
      } catch (err) {
        console.error('Failed to start AR session:', err);
        sessionRequestedRef.current = false;
        isProcessingRef.current = false;
      }
    };

    // Wait a bit to ensure renderer is ready and avoid rapid re-renders
    const timer = setTimeout(() => {
      requestARSession();
    }, 200);

    return () => {
      clearTimeout(timer);
      isProcessingRef.current = false;
    };
  }, [arModeRequested, gl, xrStore, onARSessionReady]);

  // Reset flag when AR mode is turned off
  useEffect(() => {
    if (!arModeRequested) {
      sessionRequestedRef.current = false;
    }
  }, [arModeRequested]);

  return null;
}

