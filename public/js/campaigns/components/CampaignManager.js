// components/CampaignManager.js
(function() {
    // Define the component
    const CampaignManager = {
      name: 'CampaignManager',
      data() {
        return {
          campaigns: [],
          loading: false,
          error: null,
          filters: {
            status: null,
            brandName: null,
            dateRange: null
          },
          showModal: false,
          selectedCampaign: null
        };
      },
  
      computed: {
        filteredCampaigns() {
          let filtered = [...this.campaigns];
  
          if (this.filters.status) {
            filtered = filtered.filter(campaign => 
              campaign.status === this.filters.status
            );
          }
  
          if (this.filters.brandName) {
            const searchTerm = this.filters.brandName.toLowerCase();
            filtered = filtered.filter(campaign => 
              campaign.brandName.toLowerCase().includes(searchTerm)
            );
          }
  
          return filtered;
        }
      },
  
      methods: {
        // Add the missing viewCampaign method
        async viewCampaign(campaign) {
          this.selectedCampaign = campaign;
          
          // Use Swal for better performance than Bootstrap modal
          await Swal.fire({
            title: campaign.name || 'Campaign Details',
            html: `
              <div class="campaign-details">
                <p><strong>Brand:</strong> ${campaign.brandName}</p>
                <p><strong>Store:</strong> ${campaign.storeName || 'All Stores'}</p>
                <p><strong>Start Date:</strong> ${campaign.startDate}</p>
                <p><strong>End Date:</strong> ${campaign.endDate}</p>
                <p><strong>Status:</strong> ${campaign.status}</p>
                <p><strong>Minimum Purchase:</strong> R${campaign.minPurchaseAmount || 0}</p>
                ${this.formatRequiredItems(campaign.requiredItems)}
              </div>
            `,
            width: '600px'
          });
        },
  
        formatRequiredItems(items) {
          if (!items || !items.length) return '<p>No required items</p>';
          
          return `
            <div class="required-items mt-3">
              <h6>Required Items:</h6>
              <ul>
                ${items.map(item => `
                  <li>${item.quantity}x ${item.name}</li>
                `).join('')}
              </ul>
            </div>
          `;
        },
  
        // Debounced search handler for better performance
        debounce(func, wait) {
          let timeout;
          return function executedFunction(...args) {
            const later = () => {
              clearTimeout(timeout);
              func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
          };
        },
  
        // Improved fetch with better error handling
        async fetchCampaigns() {
          if (this.loading) return;
          
          this.loading = true;
          try {
            const snapshot = await firebase.database()
              .ref('campaigns')
              .once('value');
            
            const campaignsData = snapshot.val() || {};
            this.campaigns = Object.entries(campaignsData)
              .map(([id, data]) => ({
                id,
                ...data
              }))
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
          } catch (error) {
            console.error('Error fetching campaigns:', error);
            this.error = 'Failed to fetch campaigns. Please try again.';
            throw error;
          } finally {
            this.loading = false;
          }
        },
  
        // Optimized create campaign handler
        async handleCreateCampaign() {
          try {
            const result = await Swal.fire({
              title: 'Create New Campaign',
              html: `
                <input id="campaignName" class="swal2-input" placeholder="Campaign Name">
                <input id="brandName" class="swal2-input" placeholder="Brand Name">
                <input id="minPurchase" class="swal2-input" type="number" placeholder="Minimum Purchase Amount">
                <input id="startDate" class="swal2-input" type="date">
                <input id="endDate" class="swal2-input" type="date">
              `,
              showCancelButton: true,
              confirmButtonText: 'Create',
              preConfirm: () => ({
                name: document.getElementById('campaignName').value,
                brandName: document.getElementById('brandName').value,
                minPurchaseAmount: parseFloat(document.getElementById('minPurchase').value),
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                status: 'active'
              })
            });
  
            if (result.isConfirmed) {
              this.loading = true;
              const campaignRef = firebase.database().ref('campaigns').push();
              await campaignRef.set({
                ...result.value,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
              });
              await this.fetchCampaigns();
              this.showSuccess('Campaign created successfully');
            }
          } catch (error) {
            console.error('Error creating campaign:', error);
            this.showError('Failed to create campaign');
          } finally {
            this.loading = false;
          }
        },
  
        // Improved notifications
        showSuccess(message) {
          Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
          }).fire({
            icon: 'success',
            title: message
          });
        },
  
        showError(message) {
          Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000
          }).fire({
            icon: 'error',
            title: message
          });
        }
      },
  
      mounted() {
        // Initialize with error boundary
        try {
          this.fetchCampaigns();
          // Debounced search
          this.debouncedSearch = this.debounce(
            (value) => this.updateFilters({ brandName: value }), 
            300
          );
        } catch (error) {
          console.error('Error mounting campaign manager:', error);
          this.showError('Failed to initialize campaign management');
        }
      },
  
      beforeUnmount() {
        // Cleanup
        if (this.debouncedSearch) {
          this.debouncedSearch.cancel;
        }
      }
    };
  
    // Make it globally available
    window.CampaignManager = CampaignManager;
  })();