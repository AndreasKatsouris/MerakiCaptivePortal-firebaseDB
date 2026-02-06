/**
 * Global Error Handler
 * Provides centralized error handling with user-friendly messages
 * for network errors, Firebase errors, and other exceptions
 */

class ErrorHandler {
    constructor() {
        this.errorListeners = [];
        this.init();
    }

    init() {
        // Global error handler for uncaught exceptions
        window.addEventListener('error', (event) => {
            console.error('Uncaught error:', event.error);
            this.handleError(event.error, 'Uncaught Error');
        });

        // Global handler for unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleError(event.reason, 'Promise Rejection');
        });

        // Monitor online/offline status
        window.addEventListener('offline', () => {
            this.showNetworkError('You are currently offline. Please check your internet connection.');
        });

        window.addEventListener('online', () => {
            this.showNetworkSuccess('Connection restored. You are back online.');
        });
    }

    /**
     * Handle various types of errors and show user-friendly messages
     * @param {Error} error - The error object
     * @param {string} context - Context where error occurred
     */
    handleError(error, context = 'Error') {
        if (!error) return;

        console.error(`[${context}]`, error);

        // Network errors
        if (this.isNetworkError(error)) {
            this.showNetworkError('Network error, please check your connection');
            return;
        }

        // Firebase errors
        if (this.isFirebaseError(error)) {
            this.showFirebaseError(error);
            return;
        }

        // Validation errors
        if (this.isValidationError(error)) {
            this.showValidationError(error);
            return;
        }

        // Generic error
        this.showGenericError(error);
    }

    /**
     * Check if error is network-related
     */
    isNetworkError(error) {
        const networkIndicators = [
            'network',
            'fetch',
            'NetworkError',
            'Failed to fetch',
            'ERR_INTERNET_DISCONNECTED',
            'ERR_NETWORK_CHANGED',
            'net::',
            'ECONNREFUSED',
            'ETIMEDOUT'
        ];

        const errorString = error?.toString()?.toLowerCase() || '';
        const messageString = error?.message?.toLowerCase() || '';

        return networkIndicators.some(indicator =>
            errorString.includes(indicator.toLowerCase()) ||
            messageString.includes(indicator.toLowerCase())
        );
    }

    /**
     * Check if error is Firebase-related
     */
    isFirebaseError(error) {
        return error?.code && error.code.startsWith('firebase/') ||
               error?.code && error.code.includes('auth/') ||
               error?.message && error.message.includes('Firebase');
    }

    /**
     * Check if error is validation-related
     */
    isValidationError(error) {
        return error?.type === 'validation' ||
               error?.message && error.message.toLowerCase().includes('validation');
    }

    /**
     * Show network error message
     */
    showNetworkError(message = 'Network error, please check your connection') {
        this.showErrorToast(message, 'Network Error');
        this.notifyListeners({ type: 'network', message });
    }

    /**
     * Show network success message
     */
    showNetworkSuccess(message) {
        this.showSuccessToast(message);
    }

    /**
     * Show Firebase error with user-friendly message
     */
    showFirebaseError(error) {
        const firebaseMessages = {
            'auth/invalid-email': 'Invalid email address',
            'auth/user-disabled': 'This account has been disabled',
            'auth/user-not-found': 'No account found with this email',
            'auth/wrong-password': 'Incorrect password',
            'auth/email-already-in-use': 'Email already in use',
            'auth/weak-password': 'Password is too weak',
            'auth/network-request-failed': 'Network error, please check your connection',
            'auth/too-many-requests': 'Too many attempts. Please try again later',
            'permission-denied': 'Permission denied. You don\'t have access to this resource',
            'unavailable': 'Service temporarily unavailable. Please try again',
        };

        const message = firebaseMessages[error.code] ||
                       `Firebase error: ${error.message || 'Unknown error'}`;

        this.showErrorToast(message, 'Firebase Error');
        this.notifyListeners({ type: 'firebase', code: error.code, message });
    }

    /**
     * Show validation error
     */
    showValidationError(error) {
        const message = error.message || 'Validation failed';
        this.showErrorToast(message, 'Validation Error');
        this.notifyListeners({ type: 'validation', message });
    }

    /**
     * Show generic error
     */
    showGenericError(error) {
        const message = error.message || 'An unexpected error occurred';
        this.showErrorToast(message, 'Error');
        this.notifyListeners({ type: 'generic', message });
    }

    /**
     * Show error toast notification
     */
    showErrorToast(message, title = 'Error') {
        // Try to use existing toast system if available
        if (window.showToast) {
            window.showToast(message, 'error');
        } else if (window.bootstrap && window.bootstrap.Toast) {
            this.createBootstrapToast(message, 'danger', title);
        } else {
            // Fallback to alert
            alert(`${title}: ${message}`);
        }
    }

    /**
     * Show success toast notification
     */
    showSuccessToast(message, title = 'Success') {
        if (window.showToast) {
            window.showToast(message, 'success');
        } else if (window.bootstrap && window.bootstrap.Toast) {
            this.createBootstrapToast(message, 'success', title);
        }
    }

    /**
     * Create Bootstrap toast element
     */
    createBootstrapToast(message, type = 'danger', title = 'Notification') {
        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <strong>${title}:</strong> ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        container.appendChild(toastEl);

        // Show toast
        const toast = new window.bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 5000
        });
        toast.show();

        // Remove from DOM after hidden
        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }

    /**
     * Add error listener
     */
    addListener(callback) {
        this.errorListeners.push(callback);
    }

    /**
     * Remove error listener
     */
    removeListener(callback) {
        this.errorListeners = this.errorListeners.filter(cb => cb !== callback);
    }

    /**
     * Notify all listeners
     */
    notifyListeners(errorInfo) {
        this.errorListeners.forEach(callback => {
            try {
                callback(errorInfo);
            } catch (err) {
                console.error('Error in error listener:', err);
            }
        });
    }

    /**
     * Wrap async function with error handling
     */
    async wrapAsync(fn, context = 'Async Operation') {
        try {
            return await fn();
        } catch (error) {
            this.handleError(error, context);
            throw error; // Re-throw for caller to handle if needed
        }
    }

    /**
     * Wrap fetch calls with error handling
     */
    async fetchWithErrorHandling(url, options = {}) {
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            this.handleError(error, 'Fetch Request');
            throw error;
        }
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Export for use in other modules
export { errorHandler, ErrorHandler };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
    window.errorHandler = errorHandler;
}
