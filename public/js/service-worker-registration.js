/**
 * Service Worker Registration Script
 * Manages the registration and updating of the service worker
 */

// Register the service worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
            console.log('ServiceWorker update check initiated');
          }, 60 * 60 * 1000); // Check every hour
        })
        .catch(error => {
          console.error('ServiceWorker registration failed: ', error);
        });
    });
    
    // Listen for controller change events
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('ServiceWorker controller has changed, reloading page for fresh content');
      // Optional: reload the page to ensure fresh content
      // window.location.reload();
    });
    
    // Handle offline status changes
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    updateOnlineStatus();
  } else {
    console.warn('Service workers are not supported in this browser');
  }
}

// Update UI based on online/offline status
function updateOnlineStatus() {
  const condition = navigator.onLine ? 'online' : 'offline';
  console.log(`Network status changed to: ${condition}`);
  
  // Make sure the document.body exists before trying to access it
  if (document.body) {
    // Add a class to the body to allow styling changes
    document.body.className = document.body.className.replace(/\b(online|offline)\b/g, '') + ' ' + condition;
    
    // Optional: Show a notification to the user
    if (!navigator.onLine) {
      // Show offline notification
      showNotification('You are currently offline. Some features may be limited.');
    } else {
      // Hide any offline notifications
      hideNotification();
    }
  } else {
    // Body not available yet, wait for it to be ready
    console.log('Document body not ready, will retry when document is loaded');
    document.addEventListener('DOMContentLoaded', function() {
      updateOnlineStatus();
    });
  }
}

// Show a notification to the user
function showNotification(message) {
  // Check if notification element already exists
  let notification = document.getElementById('offline-notification');
  
  if (!notification) {
    // Create notification element
    notification = document.createElement('div');
    notification.id = 'offline-notification';
    notification.className = 'offline-notification';
    notification.innerHTML = `
      <div class="offline-content">
        <i class="fas fa-wifi"></i> ${message}
      </div>
    `;
    document.body.appendChild(notification);
    
    // Add some basic styling
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.left = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = '#f8d7da';
    notification.style.color = '#721c24';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '5px';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notification.style.zIndex = '9999';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.justifyContent = 'center';
  }
}

// Hide the notification
function hideNotification() {
  const notification = document.getElementById('offline-notification');
  if (notification) {
    notification.remove();
  }
}

// Initialize only when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerServiceWorker);
} else {
  // Document already loaded
  registerServiceWorker();
}
