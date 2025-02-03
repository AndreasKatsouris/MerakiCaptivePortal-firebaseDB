import config from './googleAPIclient.js';

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
        },
        config: null
    },

    // Initialize the module
    async initialize() {
        try {
            this.state.config = config;
            await this.loadGooglePlacesAPI();
            this.addEventListeners();
            await this.loadReviews();
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
            script.src = `https://maps.googleapis.com/maps/api/js?key=${this.state.config.apiKey}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Google Places API'));
            document.head.appendChild(script);
        });
    },

    // Fetch reviews from Google Places API
    async fetchGoogleReviews() {
        try {
            const service = new google.maps.places.PlacesService(document.createElement('div'));
            
            const place = await new Promise((resolve, reject) => {
                service.getDetails({
                    placeId: this.state.config.placeId,  // Use placeId from config
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
        const elements = {
            'reviewFilterRating': () => this.handleFilterChange(),
            'reviewFilterDate': () => this.handleFilterChange(),
            'reviewFilterResponded': () => this.handleFilterChange(),
            'reviewSearchInput': () => this.handleSearch()
        };

        Object.entries(elements).forEach(([id, handler]) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', handler);
            }
        });
    },

    // Load reviews
    async loadReviews(filters = {}) {
        try {
            this.state.loading = true;
            const reviewsRef = firebase.database().ref('googleReviews');
            const snapshot = await reviewsRef.once('value');
            const reviews = snapshot.val() || {};

            this.state.reviews = Object.values(reviews)
                .map(review => ({
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

    // Calculate metrics
    calculateMetrics() {
        const reviews = this.state.reviews;
        const totalReviews = reviews.length;
        
        if (totalReviews === 0) {
            this.state.metrics = {
                averageRating: 0,
                totalReviews: 0,
                responseRate: 0
            };
        } else {
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            const respondedReviews = reviews.filter(review => review.response).length;
            
            this.state.metrics = {
                averageRating: (totalRating / totalReviews).toFixed(1),
                totalReviews,
                responseRate: ((respondedReviews / totalReviews) * 100).toFixed(1)
            };
        }

        this.updateMetricsDisplay();
    },

    // Update metrics display
    updateMetricsDisplay() {
        const { averageRating, totalReviews, responseRate } = this.state.metrics;
        
        const elements = {
            'averageRating': averageRating,
            'totalReviews': totalReviews,
            'responseRate': `${responseRate}%`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    },

    // Error handling
    handleError(error) {
        this.state.error = error.message;
        console.error('Google Reviews Error:', error);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', error.message, 'error');
        }
    },

    // Apply filters to reviews
    applyFilters(review, filters) {
        if (filters.rating && review.rating !== parseInt(filters.rating)) {
            return false;
        }

        if (filters.responded !== null) {
            const hasResponse = Boolean(review.response);
            if (filters.responded === 'true' !== hasResponse) {
                return false;
            }
        }

        if (filters.dateRange) {
            const reviewDate = new Date(review.timestamp);
            const now = new Date();
            
            let compareDate = new Date(now);
            switch (filters.dateRange) {
                case 'week':
                    compareDate.setDate(compareDate.getDate() - 7);
                    break;
                case 'month':
                    compareDate.setMonth(compareDate.getMonth() - 1);
                    break;
                case 'year':
                    compareDate.setFullYear(compareDate.getFullYear() - 1);
                    break;
                default:
                    return true;
            }
            
            if (reviewDate < compareDate) {
                return false;
            }
        }

        return true;
    },

    // Handle search
    handleSearch() {
        // Implementation of handleSearch method
    },

    // Handle filter change
    handleFilterChange() {
        // Implementation of handleFilterChange method
    },

    // Handle flagging a review
    async flagReview(reviewId) {
        // Implementation of flagReview method
    }
};

// Export for use in other modules
export { googleReviewsManager }; 


