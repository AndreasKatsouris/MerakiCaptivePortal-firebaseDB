// admin/AdminLogin.js

import { authManager } from '../auth/AuthManager.js';

const AdminLogin = {
    data() {
        return {
            email: '',
            password: '',
            loading: false,
            error: null,
            lastLogoutReason: sessionStorage.getItem('logoutReason')
        };
    },

    mounted() {
        // Clear any existing session data
        sessionStorage.removeItem('logoutReason');
    },

    methods: {
        async handleLogin() {
            this.loading = true;
            this.error = null;

            try {
                const result = await authManager.login(this.email, this.password);
                
                if (result.success) {
                    // Success handling is managed by AuthManager
                    // It will automatically redirect to dashboard
                    console.log('Login successful');
                }
            } catch (error) {
                console.error('Login error:', error);
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        }
    },

    template: `
        <div class="login-container">
            <div class="card">
                <div class="card-header">
                    <h2 class="text-center">Admin Login</h2>
                </div>
                <div class="card-body">
                    <!-- Logout reason message -->
                    <div v-if="lastLogoutReason" class="alert alert-info alert-dismissible fade show">
                        {{ lastLogoutReason }}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>

                    <!-- Error message -->
                    <div v-if="error" class="alert alert-danger alert-dismissible fade show">
                        {{ error }}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>

                    <!-- Login form -->
                    <form @submit.prevent="handleLogin">
                        <div class="form-group mb-3">
                            <label for="adminEmail">Email</label>
                            <input 
                                type="email" 
                                class="form-control" 
                                id="adminEmail" 
                                v-model="email"
                                :disabled="loading"
                                required
                            >
                        </div>
                        
                        <div class="form-group mb-3">
                            <label for="adminPassword">Password</label>
                            <input 
                                type="password" 
                                class="form-control" 
                                id="adminPassword" 
                                v-model="password"
                                :disabled="loading"
                                required
                            >
                        </div>

                        <button 
                            type="submit" 
                            class="btn btn-primary w-100" 
                            :disabled="loading"
                        >
                            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                            {{ loading ? 'Logging in...' : 'Login' }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `
};

// Initialize Vue app
const app = Vue.createApp(AdminLogin);
app.mount('#adminLoginApp');