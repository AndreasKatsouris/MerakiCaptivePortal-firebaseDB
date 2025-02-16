export const ERROR_CATEGORIES = {
    AUTH: 'auth',
    ADMIN: 'admin',
    SESSION: 'session',
    NETWORK: 'network',
    UNKNOWN: 'unknown'
};

export const AUTH_ERRORS = {
    // Authentication errors
    'auth/invalid-email': {
        message: 'Invalid email format',
        category: ERROR_CATEGORIES.AUTH
    },
    'auth/user-disabled': {
        message: 'This account has been disabled',
        category: ERROR_CATEGORIES.AUTH
    },
    'auth/user-not-found': {
        message: 'No account found with this email',
        category: ERROR_CATEGORIES.AUTH
    },
    'auth/wrong-password': {
        message: 'Invalid password',
        category: ERROR_CATEGORIES.AUTH
    },
    
    // Admin errors
    'admin/insufficient-privileges': {
        message: 'Admin access required',
        category: ERROR_CATEGORIES.ADMIN
    },
    'admin/claim-failed': {
        message: 'Failed to verify admin status',
        category: ERROR_CATEGORIES.ADMIN
    },
    
    // Session errors
    'session/expired': {
        message: 'Your session has expired',
        category: ERROR_CATEGORIES.SESSION
    },
    'session/invalid': {
        message: 'Invalid session',
        category: ERROR_CATEGORIES.SESSION
    },
    
    // Network errors
    'network/timeout': {
        message: 'Request timed out',
        category: ERROR_CATEGORIES.NETWORK
    },
    'network/offline': {
        message: 'No internet connection',
        category: ERROR_CATEGORIES.NETWORK
    }
};

export class AuthErrorHandler {
    static getErrorDetails(error) {
        const errorCode = error.code || 'unknown';
        const errorInfo = AUTH_ERRORS[errorCode] || {
            message: error.message || 'An unknown error occurred',
            category: ERROR_CATEGORIES.UNKNOWN
        };

        return {
            code: errorCode,
            message: errorInfo.message,
            category: errorInfo.category,
            originalError: error
        };
    }

    static handleError(error, context = '') {
        const errorDetails = this.getErrorDetails(error);
        
        // Log error with context
        console.error(`Authentication Error [${context}]:`, {
            ...errorDetails,
            timestamp: new Date().toISOString()
        });

        // Return formatted error object
        return {
            ...errorDetails,
            context,
            handled: true,
            timestamp: Date.now()
        };
    }

    static isAuthError(error) {
        return error.category === ERROR_CATEGORIES.AUTH;
    }

    static isAdminError(error) {
        return error.category === ERROR_CATEGORIES.ADMIN;
    }

    static isSessionError(error) {
        return error.category === ERROR_CATEGORIES.SESSION;
    }

    static isNetworkError(error) {
        return error.category === ERROR_CATEGORIES.NETWORK;
    }

    static shouldRedirectToLogin(error) {
        return this.isAuthError(error) || 
               this.isSessionError(error) || 
               this.isAdminError(error);
    }
}