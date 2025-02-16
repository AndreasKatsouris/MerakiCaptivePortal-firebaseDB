// Core authentication module
class Auth {
    constructor() {
        this.user = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Initialize Firebase Auth
            firebase.auth().onAuthStateChanged((user) => {
                this.user = user;
                console.log('Auth state changed:', user ? 'User logged in' : 'No user');
            });
            
            this.initialized = true;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            throw error;
        }
    }

    // Basic authentication methods
    async login(email, password) {
        try {
            const userCredential = await firebase.auth()
                .signInWithEmailAndPassword(email, password);
            return userCredential.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    async logout() {
        try {
            await firebase.auth().signOut();
            this.user = null;
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    getCurrentUser() {
        return this.user;
    }
}

// Export a singleton instance
export const auth = new Auth(); 