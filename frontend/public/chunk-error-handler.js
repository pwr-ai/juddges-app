/**
 * Global Chunk Error Handler
 * 
 * This script runs before React and catches chunk loading errors
 * at the global level, providing an additional safety net.
 * 
 * Place this in <head> to catch errors before app initialization.
 */

(function() {
  'use strict';

  // Track if we've already reloaded to prevent infinite loops
  const RELOAD_KEY = '__chunk_error_reload_timestamp';
  const RELOAD_THRESHOLD = 10000; // 10 seconds

  // Check if we recently reloaded due to chunk error
  function shouldReload() {
    const lastReload = sessionStorage.getItem(RELOAD_KEY);
    if (!lastReload) return true;
    
    const timeSinceReload = Date.now() - parseInt(lastReload, 10);
    return timeSinceReload > RELOAD_THRESHOLD;
  }

  // Handle chunk load errors
  function handleChunkError(error) {
    const isChunkError = 
      error.name === 'ChunkLoadError' ||
      (error.message && (
        error.message.includes('Loading chunk') ||
        error.message.includes('Failed to fetch dynamically imported module') ||
        error.message.includes('Importing a module script failed')
      ));

    if (isChunkError && shouldReload()) {
      console.warn('Chunk load error detected, initiating recovery...', error);
      
      // Mark that we're reloading
      sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
      
      // Clear caches if available
      if ('caches' in window) {
        caches.keys().then(function(names) {
          names.forEach(function(name) {
            caches.delete(name);
          });
        }).catch(function(err) {
          console.warn('Failed to clear caches:', err);
        }).finally(function() {
          // Reload after cache clearing attempt
          window.location.reload();
        });
      } else {
        // No cache API, just reload
        window.location.reload();
      }
      
      return true; // Handled
    }
    
    return false; // Not handled
  }

  // Global error handler
  window.addEventListener('error', function(event) {
    if (event.error) {
      handleChunkError(event.error);
    }
  }, true); // Use capture phase

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason) {
      if (handleChunkError(event.reason)) {
        event.preventDefault(); // Prevent default error handling
      }
    }
  });

  // Clear reload flag on successful load
  window.addEventListener('load', function() {
    // Keep the flag for a bit to prevent rapid reloads
    setTimeout(function() {
      sessionStorage.removeItem(RELOAD_KEY);
    }, 5000);
  });

  console.log('Chunk error handler initialized');
})();

