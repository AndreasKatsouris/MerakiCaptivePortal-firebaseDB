// Admin claims management
export class AdminClaims {
    static async verifyAdminStatus(user) {
        try {
            // Force token refresh
            await user.getIdToken(true);
            const token = await user.getIdTokenResult();
            
            return token.claims.admin === true;
        } catch (error) {
            console.error('Admin verification failed:', error);
            throw error;
        }
    }

    static async setAdminClaim(user) {
        try {
            const setAdminClaimFunction = firebase.functions().httpsCallable('setAdminClaim');
            const result = await setAdminClaimFunction({
                uid: user.uid,
                email: user.email
            });
            
            return result.data;
        } catch (error) {
            console.error('Setting admin claim failed:', error);
            throw error;
        }
    }
} 