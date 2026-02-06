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

        // Timeout errors (check first, before network)
        if (this.isTimeoutError(error)) {
            this.showTimeoutError(error);
            return;
        }

        // Network errors
        if (this.isNetworkError(error)) {
            this.showNetworkError('Network error, please check your connection');
            return;
        }

        // API/Server errors (500, 400 status codes)
        if (this.isApiError(error)) {
            this.showApiError(error);
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
     * Check if error is timeout-related
     */
    isTimeoutError(error) {
        return error?.isTimeout === true ||
               error?.name === 'AbortError' ||
               error?.message?.includes('REQUEST_TIMEOUT') ||
               error?.message?.includes('timeout') ||
               error?.message?.includes('ETIMEDOUT');
    }

    /**
     * Check if error is API/server error (500, 400 status codes)
     */
    isApiError(error) {
        const message = error?.message || '';
        return message.includes('SERVER_ERROR') ||
               message.includes('CLIENT_ERROR') ||
               message.includes('HTTP 500') ||
               message.includes('HTTP 4') ||
               message.includes('HTTP 5');
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
     * Show API/Server error with clear message
     */
    showApiError(error) {
        const message = error.message || '';
        let userMessage = 'Server error, please try again';

        // Customize message based on error type
        if (message.includes('SERVER_ERROR') || message.includes('HTTP 5')) {
            userMessage = 'Server error, please try again';
        } else if (message.includes('CLIENT_ERROR') || message.includes('HTTP 4')) {
            userMessage = 'Request failed. Please check your input and try again';
        }

        this.showErrorToast(userMessage, 'API Error');
        this.notifyListeners({ type: 'api', message: userMessage, originalError: error });
    }

    /**
     * Show timeout error with retry option
     */
    showTimeoutError(error) {
        const message = 'Request timed out. The server took too long to respond.';

        // Show toast with retry button
        this.showTimeoutToastWithRetry(message, error);
        this.notifyListeners({ type: 'timeout', message, error });
    }

    /**
     * Show timeout toast with retry button
     */
    showTimeoutToastWithRetry(message, error) {
        // Use Bootstrap modal for better retry UX
        if (window.bootstrap && window.bootstrap.Modal) {
            this.createRetryModal(message, error);
        } else {
            // Fallback to confirm dialog
            const retry = confirm(`${message}\n\nWould you like to retry?`);
            if (retry && error.originalUrl) {
                this.retryRequest(error.originalUrl, error.originalOptions);
            }
        }
    }

    /**
     * Create Bootstrap modal with retry button
     */
    createRetryModal(message, error) {
        // Remove existing modal if present
        const existingModal = document.getElementById('timeoutRetryModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal element
        const modalHtml = `
            <div class="modal fade" id="timeoutRetryModal" tabindex="-1" aria-labelledby="timeoutRetryModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title" id="timeoutRetryModalLabel">
                                <i class="fas fa-clock me-2"></i>Request Timeout
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                            <p class="text-muted mb-0">Would you like to retry the request?</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="retryRequestBtn">
                                <i class="fas fa-redo me-2"></i>Retry
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modalElement = document.getElementById('timeoutRetryModal');
        const modal = new window.bootstrap.Modal(modalElement);

        // Handle retry button click
        document.getElementById('retryRequestBtn').addEventListener('click', () => {
            modal.hide();
            if (error.originalUrl) {
                this.retryRequest(error.originalUrl, error.originalOptions);
            }
        });

        // Clean up modal after hide
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
        });

        modal.show();
    }

    /**
     * Retry a failed request
     */
    async retryRequest(url, options = {}) {
        try {
            this.showSuccessToast('Retrying request...', 'Retry');
            const response = await this.fetchWithErrorHandling(url, options);
            this.showSuccessToast('Request successful!', 'Success');
            return response;
        } catch (error) {
            console.error('Retry failed:', error);
            // Error will be handled by fetchWithErrorHandling
        }
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
     * Wrap fetch calls with error handling and timeout support
     * @param {string} url - The URL to fetch
     * @param {object} options - Fetch options
     * @param {number} timeout - Timeout in milliseconds (default: 30000)
     * @returns {Promise<Response>} - The response object
     */
    async fetchWithErrorHandling(url, options = {}, timeout = 30000) {
        try {
            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const fetchOptions = {
                ...options,
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // Handle API errors (500, 400, etc.)
            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error(`SERVER_ERROR: ${response.status}`);
                } else if (response.status >= 400) {
                    throw new Error(`CLIENT_ERROR: ${response.status}`);
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }

            return response;
        } catch (error) {
            // Handle timeout
            if (error.name === 'AbortError') {
                const timeoutError = new Error('REQUEST_TIMEOUT');
                timeoutError.isTimeout = true;
                timeoutError.originalUrl = url;
                timeoutError.originalOptions = options;
                this.handleError(timeoutError, 'Request Timeout');
                throw timeoutError;
            }

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
