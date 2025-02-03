// Google Reviews Management Module
import { getConfig, REQUIRED_FIELDS } from './googleAPIclient.js';

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
        getConfigconfig: null
    },

    // Initialize the module
    async initialize() {
        try {
            // Get config first
            this.state.config = await getConfig();
            
            // Validate config
            if (!this.state.config.apiKey) {
                throw new Error('Google Places API key not configured');
            }
    
            // Then load the API
            await this.loadGooglePlacesAPI();
            
            // Continue with initialization
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
        // Check if API is already loaded
        if (window.google && window.google.maps) {
            return Promise.resolve();
        }
    
        // Ensure we have config before loading
        if (!this.state.config || !this.state.config.apiKey) {
            throw new Error('Google Places API key not configured');
        }
    
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${this.state.config.apiKey}&libraries=places&loading=async`;
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
            const place = await getPlaceReviews(this.state.config);
            
            // Transform reviews according to the documentation
            const reviews = place.reviews.map(review => ({
                id: review.time.toString(),
                authorName: review.author_name,
                authorUrl: review.author_url,
                language: review.language,
                profilePhotoUrl: review.profile_photo_url,
                rating: review.rating,
                relativeTimeDescription: review.relative_time_description,
                text: review.text,
                time: review.time,
                translated: review.translated || false,
                response: null,
                flagged: false
            }));
    
            // Store place details
            this.state.placeDetails = {
                name: place.name,
                rating: place.rating,
                totalRatings: place.user_ratings_total,
                address: place.formatted_address,
                phoneNumber: place.formatted_phone_number,
                location: place.geometry.location
            };
    
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
        // Place Details Section
        const placeDetailsDiv = document.querySelector('#placeDetails');
        if (placeDetailsDiv && this.state.placeDetails) {
            placeDetailsDiv.innerHTML = `
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h3 class="card-title mb-2">${this.state.placeDetails.name}</h3>
                                <p class="text-muted mb-1">${this.state.placeDetails.address}</p>
                                <p class="mb-0">${this.state.placeDetails.phoneNumber || 'No phone number available'}</p>
                            </div>
                            <div class="text-end">
                                <div class="d-flex align-items-center mb-2">
                                    ${this.generateStarRating(this.state.placeDetails.rating)}
                                    <span class="ms-2 h4 mb-0">${this.state.placeDetails.rating}</span>
                                </div>
                                <p class="text-muted mb-0">${this.state.placeDetails.totalRatings} reviews</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    
        // Reviews Table
        const tableBody = document.querySelector('#reviewsTable tbody');
        if (!tableBody) return;
    
        if (this.state.loading) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center p-5">
                        <div class="spinner-border text-primary mb-2"></div>
                        <div>Loading reviews...</div>
                    </td>
                </tr>`;
            return;
        }
    
        if (!this.state.reviews.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center p-4">
                        <i class="fas fa-comment-slash fa-2x mb-3 text-muted"></i>
                        <div>No reviews found</div>
                    </td>
                </tr>`;
            return;
        }
    
        tableBody.innerHTML = this.state.reviews.map(review => `
            <tr>
                <td class="text-nowrap">${review.formattedDate}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="me-2">
                            <img src="${review.profilePhoto || '/images/default-avatar.png'}" 
                                 alt="${review.reviewerName}" 
                                 class="rounded-circle"
                                 width="32" height="32">
                        </div>
                        <div>
                            <div class="fw-bold">
                                ${review.authorUrl 
                                    ? `<a href="${review.authorUrl}" target="_blank" rel="noopener noreferrer">${review.reviewerName}</a>`
                                    : review.reviewerName}
                            </div>
                            <div class="d-flex align-items-center">
                                ${this.generateStarRating(review.rating)}
                                <small class="ms-2 text-muted">${review.relativeTimeDescription || ''}</small>
                            </div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="review-content">
                        <p class="mb-1">${review.text}</p>
                        ${review.language 
                            ? `<small class="text-muted">Language: ${review.language}</small>`
                            : ''}
                    </div>
                    ${review.response 
                        ? `<div class="review-response mt-2 p-2 bg-light rounded">
                               <small class="text-muted">Response:</small>
                               <p class="mb-0">${review.response}</p>
                           </div>`
                        : ''}
                </td>
                <td class="text-center">
                    <span class="badge rounded-pill bg-${review.response ? 'success' : 'warning'}">
                        ${review.response ? 'Responded' : 'Pending'}
                    </span>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-primary" 
                                title="${review.response ? 'Edit Response' : 'Respond'}"
                                onclick="googleReviewsManager.respondToReview('${review.id}')">
                            <i class="fas ${review.response ? 'fa-edit' : 'fa-reply'}"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" 
                                title="${review.flagged ? 'Flagged' : 'Flag Review'}"
                                onclick="googleReviewsManager.flagReview('${review.id}')"
                                ${review.flagged ? 'disabled' : ''}>
                            <i class="fas fa-flag"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    
        // Initialize tooltips for the newly added buttons
        const tooltipTriggerList = [].slice.call(tableBody.querySelectorAll('[title]'));
        tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
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
        
        // Special handling for configuration errors
        if (error.message.includes('API key')) {
            Swal.fire({
                icon: 'error',
                title: 'Configuration Error',
                text: 'Google Places API is not properly configured. Please contact your administrator.',
                confirmButtonText: 'OK'
            });
            return;
        }
    
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', error.message, 'error');
        }
    },
    // Add specific error handling for Places API
handlePlacesError(status) {
    const errorMessages = {
        ZERO_RESULTS: 'No reviews found for this location.',
        OVER_QUERY_LIMIT: 'API request limit exceeded. Please try again later.',
        REQUEST_DENIED: 'API request was denied. Please check your API key.',
        INVALID_REQUEST: 'Invalid request. Please check your place ID.',
        NOT_FOUND: 'Place not found. Please check your place ID.',
    };

    return errorMessages[status] || 'An error occurred while fetching reviews.';
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


