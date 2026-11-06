import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import getFriendlyErrorMessage from "../utils/getFriendlyErrorMessage";

const DEFAULT_DURATION = 4000;

function useGameNotification() {
  const [notification,setNotification] = useState(null);
  const timeoutRef = useRef(null);
  const dismissNotification = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current =null;
    }
    setNotification(null);
  },[]);

  const showNotification = useCallback((message,type = "info",options = {}) => {
    const cleanedMessage = String(message ?? "").trim();
    if (!cleanedMessage) {
      return;
    } 
    if(timeoutRef.current){
      clearTimeout(timeoutRef.current);
    }
    setNotification({id: Date.now(), message: cleanedMessage, type, title: options.title});
    const duration = options.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
        timeoutRef.current = null;
        }, duration);
      }
    },[]);

  const showError = useCallback((error, options = {}) => {showNotification(getFriendlyErrorMessage(error),"error",options);},[showNotification]);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  },[]);

  return {
    notification,
    showNotification,
    showError,
    dismissNotification,
  };
}

export default useGameNotification;
