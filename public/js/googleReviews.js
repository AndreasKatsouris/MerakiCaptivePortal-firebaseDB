// Google Reviews Management Module
const googleReviewsManager = {
    // State management
    state: {
        reviews: [],
        loading: false,
        error: null,
        filters: {
            rating: null,
            dateRange: null,
            responded: null
        },
        metrics: {
            averageRating: 0,
            totalReviews: 0,
            responseRate: 0
        }
    },

    // Initialize the module
    async initialize() {
        try {
            // Load Google Places API
            await this.loadGooglePlacesAPI();
            
            // Add event listeners for review management
            this.addEventListeners();
            
            // Load initial reviews
            await this.loadReviews();
            
            // Calculate initial metrics
            this.calculateMetrics();
        } catch (error) {
            console.error('Error initializing Google Reviews:', error);
            this.handleError(error);
        }
    },

    // Load Google Places API
    async loadGooglePlacesAPI() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_PLACES_API_KEY}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Google Places API'));
            document.head.appendChild(script);
        });
    },

    // Fetch reviews from Google Places API
    async fetchGoogleReviews(placeId) {
        try {
            const service = new google.maps.places.PlacesService(document.createElement('div'));
            
            const place = await new Promise((resolve, reject) => {
                service.getDetails({
                    placeId: placeId,
                    fields: ['reviews', 'rating', 'user_ratings_total']
                }, (place, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        resolve(place);
                    } else {
                        reject(new Error(`Places API Error: ${status}`));
                    }
                });
            });

            // Transform reviews to match our format
            const reviews = place.reviews.map(review => ({
                id: review.time.toString(), // Use timestamp as ID
                reviewerName: review.author_name,
                rating: review.rating,
                text: review.text,
                timestamp: review.time * 1000, // Convert to milliseconds
                profilePhoto: review.profile_photo_url,
                response: null, // Initialize with no response
                flagged: false
            }));

            // Store reviews in Firebase
            await this.syncReviewsWithFirebase(reviews);

            return reviews;
        } catch (error) {
            console.error('Error fetching Google reviews:', error);
            throw error;
        }
    },

    // Sync reviews with Firebase
    async syncReviewsWithFirebase(reviews) {
        try {
            const reviewsRef = firebase.database().ref('googleReviews');
            
            // Get existing reviews
            const snapshot = await reviewsRef.once('value');
            const existingReviews = snapshot.val() || {};

            // Merge existing responses with new reviews
            const updatedReviews = reviews.map(review => ({
                ...review,
                response: existingReviews[review.id]?.response || null,
                flagged: existingReviews[review.id]?.flagged || false
            }));

            // Update Firebase
            await reviewsRef.set(
                updatedReviews.reduce((acc, review) => {
                    acc[review.id] = review;
                    return acc;
                }, {})
            );
        } catch (error) {
            console.error('Error syncing reviews with Firebase:', error);
            throw error;
        }
    },

    // Event listener setup
    addEventListeners() {
        addEventListenerSafely('reviewFilterRating', 'change', () => this.handleFilterChange());
        addEventListenerSafely('reviewFilterDate', 'change', () => this.handleFilterChange());
        addEventListenerSafely('reviewFilterResponded', 'change', () => this.handleFilterChange());
        addEventListenerSafely('reviewSearchInput', 'input', () => this.handleSearch());
    },

    // Modified loadReviews to fetch from Google first
    async loadReviews(filters = {}) {
        try {
            this.state.loading = true;
            
            // Fetch fresh reviews from Google Places API
            const placeId = process.env.GOOGLE_PLACE_ID; // Your business's Place ID
            await this.fetchGoogleReviews(placeId);

            // Load from Firebase (now including the fresh reviews)
            const reviewsRef = firebase.database().ref('googleReviews');
            const snapshot = await reviewsRef.once('value');
            const reviews = snapshot.val() || {};

            this.state.reviews = Object.entries(reviews)
                .map(([id, review]) => ({
                    id,
                    ...review,
                    formattedDate: new Date(review.timestamp).toLocaleDateString()
                }))
                .filter(review => this.applyFilters(review, filters));

            this.renderReviews();
            this.calculateMetrics();
        } catch (error) {
            console.error('Error loading reviews:', error);
            this.handleError(error);
        } finally {
            this.state.loading = false;
        }
    },

    // Render reviews to the DOM
    renderReviews() {
        const tableBody = document.querySelector('#reviewsTable tbody');
        if (!tableBody) return;

        if (this.state.loading) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading reviews...</td></tr>';
            return;
        }

        if (!this.state.reviews.length) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No reviews found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.state.reviews.map(review => `
            <tr>
                <td>${review.formattedDate}</td>
                <td>
                    <div class="d-flex align-items-center">
                        ${this.generateStarRating(review.rating)}
                        <span class="ms-2">${review.rating}</span>
                    </div>
                </td>
                <td>${review.reviewerName}</td>
                <td>${review.text}</td>
                <td>
                    <span class="badge badge-${review.response ? 'success' : 'warning'}">
                        ${review.response ? 'Responded' : 'Pending'}
                    </span>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-primary" onclick="googleReviewsManager.respondToReview('${review.id}')">
                            ${review.response ? 'Edit Response' : 'Respond'}
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="googleReviewsManager.flagReview('${review.id}')">
                            Flag
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    // Generate star rating HTML
    generateStarRating(rating) {
        return Array(5).fill(0).map((_, index) => `
            <i class="fas fa-star ${index < rating ? 'text-warning' : 'text-muted'}"></i>
        `).join('');
    },

    // Handle responding to reviews
    async respondToReview(reviewId) {
        const review = this.state.reviews.find(r => r.id === reviewId);
        if (!review) return;

        const { value: response } = await Swal.fire({
            title: 'Respond to Review',
            html: `
                <div class="mb-3">
                    <p><strong>Review:</strong> ${review.text}</p>
                    <textarea id="responseText" class="form-control" 
                        placeholder="Type your response here...">${review.response || ''}</textarea>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Submit Response',
            preConfirm: () => {
                return document.getElementById('responseText').value;
            }
        });

        if (response) {
            try {
                await firebase.database()
                    .ref(`googleReviews/${reviewId}/response`)
                    .set(response);
                
                await this.loadReviews(this.state.filters);
                Swal.fire('Success', 'Response submitted successfully', 'success');
            } catch (error) {
                console.error('Error submitting response:', error);
                this.handleError(error);
            }
        }
    },

    // Calculate review metrics
    calculateMetrics() {
        const reviews = this.state.reviews;
        const totalReviews = reviews.length;
        
        this.state.metrics = {
            averageRating: totalReviews ? 
                (reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews).toFixed(1) : 0,
            totalReviews,
            responseRate: totalReviews ? 
                ((reviews.filter(review => review.response).length / totalReviews) * 100).toFixed(1) : 0
        };

        this.updateMetricsDisplay();
    },

    // Update metrics display
    updateMetricsDisplay() {
        const { averageRating, totalReviews, responseRate } = this.state.metrics;
        
        document.getElementById('averageRating')?.textContent = averageRating;
        document.getElementById('totalReviews')?.textContent = totalReviews;
        document.getElementById('responseRate')?.textContent = `${responseRate}%`;
    },

    // Error handling
    handleError(error) {
        this.state.error = error.message;
        Swal.fire('Error', error.message, 'error');
    },

    // Filter application
    applyFilters(review, filters) {
        return (!filters.rating || review.rating === parseInt(filters.rating)) &&
               (!filters.responded || (filters.responded === 'true') === !!review.response) &&
               (!filters.dateRange || this.isWithinDateRange(review.timestamp, filters.dateRange));
    },

    // Date range check
    isWithinDateRange(timestamp, range) {
        const date = new Date(timestamp);
        const now = new Date();
        
        switch (range) {
            case 'week':
                return date >= new Date(now - 7 * 24 * 60 * 60 * 1000);
            case 'month':
                return date >= new Date(now.setMonth(now.getMonth() - 1));
            case 'year':
                return date >= new Date(now.setFullYear(now.getFullYear() - 1));
            default:
                return true;
        }
    }
};

// Export for use in other modules
export { googleReviewsManager }; 