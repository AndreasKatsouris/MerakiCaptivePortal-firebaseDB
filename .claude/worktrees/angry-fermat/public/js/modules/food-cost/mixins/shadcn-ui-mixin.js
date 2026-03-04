/**
 * Food Cost Module - shadcn/ui-inspired UI Mixin
 * 
 * This mixin provides modern shadcn/ui-inspired styling for the Food Cost module
 * while maintaining the modular architecture
 */

// Define the shadcn UI mixin
export const ShadcnUIMixin = {
  data() {
    return {
      shadcnStylesLoaded: false
    };
  },
  
  mounted() {
    this.initializeShadcnUI();
  },
  
  methods: {
    /**
     * Initialize the shadcn/ui styling
     */
    initializeShadcnUI() {
      // Add the stylesheet
      if (!document.getElementById('shadcn-ui-styles')) {
        this.loadStylesheet();
      }
      
      // Apply the styles
      this.$nextTick(() => {
        this.applyShadcnStyles();
        
        // Set up an observer to handle dynamically added elements
        this.setupMutationObserver();
        
        // Set flag
        this.shadcnStylesLoaded = true;
        
        console.log('shadcn/ui-inspired styles applied to Food Cost module');
      });
    },
    
    /**
     * Load the shadcn/ui stylesheet
     */
    loadStylesheet() {
      const linkElement = document.createElement('link');
      linkElement.id = 'shadcn-ui-styles';
      linkElement.rel = 'stylesheet';
      linkElement.href = '/css/shadcn-inspired.css';
      document.head.appendChild(linkElement);
      
      // Create the shadcn/ui styles
      this.createStyles();
    },
    
    /**
     * Create the shadcn/ui CSS styles
     */
    createStyles() {
      // Only create styles if they don't already exist
      if (document.getElementById('shadcn-ui-inline-styles')) {
        return;
      }
      
      const styleElement = document.createElement('style');
      styleElement.id = 'shadcn-ui-inline-styles';
      
      // Define CSS variables and styles
      styleElement.textContent = `
        :root {
          --shadcn-background: #fff;
          --shadcn-foreground: #020817;
          --shadcn-card: #fff;
          --shadcn-card-foreground: #020817;
          --shadcn-primary: #0f172a;
          --shadcn-primary-foreground: #fff;
          --shadcn-secondary: #f1f5f9;
          --shadcn-secondary-foreground: #0f172a;
          --shadcn-destructive: #ef4444;
          --shadcn-destructive-foreground: #fff;
          --shadcn-muted: #f1f5f9;
          --shadcn-muted-foreground: #64748b;
          --shadcn-accent: #f1f5f9;
          --shadcn-accent-foreground: #0f172a;
          --shadcn-border: #e2e8f0;
          --shadcn-input: #e2e8f0;
          --shadcn-ring: #0ea5e9;
          --shadcn-radius: 0.5rem;
        
          --primary-color: #0f172a;
          --primary-hover: #1e293b;
          --secondary-color: #f1f5f9;
          --secondary-hover: #e2e8f0;
          --info-color: #0ea5e9;
          --info-hover: #0284c7;
          --success-color: #10b981;
          --success-hover: #059669;
          --warning-color: #f59e0b;
          --warning-hover: #d97706;
          --danger-color: #ef4444;
          --danger-hover: #dc2626;
        }
        
        /* Modern Button Base */
        .shadcn-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--shadcn-radius);
          font-weight: 500;
          font-size: 0.875rem;
          line-height: 1.25rem;
          padding: 0.5rem 1rem;
          transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          cursor: pointer;
          border: 1px solid transparent;
        }
        
        .shadcn-btn:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--shadcn-background), 0 0 0 4px var(--shadcn-ring);
        }
        
        .shadcn-btn:disabled {
          opacity: 0.5;
          pointer-events: none;
        }
        
        .shadcn-btn i {
          margin-right: 0.5rem;
        }
        
        /* Button Variants */
        .shadcn-btn-primary {
          background-color: var(--primary-color);
          color: white;
        }
        
        .shadcn-btn-primary:hover {
          background-color: var(--primary-hover);
        }
        
        .shadcn-btn-secondary {
          background-color: var(--secondary-color);
          color: var(--shadcn-secondary-foreground);
        }
        
        .shadcn-btn-secondary:hover {
          background-color: var(--secondary-hover);
        }
        
        .shadcn-btn-success {
          background-color: var(--success-color);
          color: white;
        }
        
        .shadcn-btn-success:hover {
          background-color: var(--success-hover);
        }
        
        .shadcn-btn-info {
          background-color: var(--info-color);
          color: white;
        }
        
        .shadcn-btn-info:hover {
          background-color: var(--info-hover);
        }
        
        .shadcn-btn-warning {
          background-color: var(--warning-color);
          color: white;
        }
        
        .shadcn-btn-warning:hover {
          background-color: var(--warning-hover);
        }
        
        .shadcn-btn-danger {
          background-color: var(--danger-color);
          color: white;
        }
        
        .shadcn-btn-danger:hover {
          background-color: var(--danger-hover);
        }
        
        /* Modern Card Styling */
        .shadcn-card {
          border-radius: var(--shadcn-radius);
          background-color: var(--shadcn-card);
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          border: 1px solid var(--shadcn-border);
        }
        
        .shadcn-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--shadcn-border);
        }
        
        .shadcn-card-body {
          padding: 1.5rem;
        }
        
        /* Input Styling */
        .shadcn-input {
          display: flex;
          height: 2.5rem;
          width: 100%;
          border-radius: var(--shadcn-radius);
          border: 1px solid var(--shadcn-input);
          background-color: var(--shadcn-background);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
          transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .shadcn-input:focus {
          outline: none;
          border-color: var(--shadcn-ring);
          box-shadow: 0 0 0 1px var(--shadcn-ring);
        }
      `;
      
      document.head.appendChild(styleElement);
    },
    
    /**
     * Apply shadcn/ui styles to elements
     */
    applyShadcnStyles() {
      // Get target container - could be the app's root element or a specific container
      const container = this.$el || document;
      
      // Add classes to buttons
      container.querySelectorAll('.btn').forEach(button => {
        // Skip if already styled
        if (button.classList.contains('shadcn-btn')) {
          return;
        }
        
        button.classList.add('shadcn-btn');
        
        // Apply specific button styles based on existing classes
        if (button.classList.contains('btn-primary')) {
          button.classList.add('shadcn-btn-primary');
        } else if (button.classList.contains('btn-secondary')) {
          button.classList.add('shadcn-btn-secondary');
        } else if (button.classList.contains('btn-success')) {
          button.classList.add('shadcn-btn-success');
        } else if (button.classList.contains('btn-info')) {
          button.classList.add('shadcn-btn-info');
        } else if (button.classList.contains('btn-warning')) {
          button.classList.add('shadcn-btn-warning');
        } else if (button.classList.contains('btn-danger')) {
          button.classList.add('shadcn-btn-danger');
        }
      });
      
      // Style cards
      container.querySelectorAll('.card').forEach(card => {
        if (!card.classList.contains('shadcn-card')) {
          card.classList.add('shadcn-card');
          
          // Style card header
          const header = card.querySelector('.card-header');
          if (header && !header.classList.contains('shadcn-card-header')) {
            header.classList.add('shadcn-card-header');
          }
          
          // Style card body
          const body = card.querySelector('.card-body');
          if (body && !body.classList.contains('shadcn-card-body')) {
            body.classList.add('shadcn-card-body');
          }
        }
      });
      
      // Style inputs
      container.querySelectorAll('.form-control').forEach(input => {
        if (!input.classList.contains('shadcn-input')) {
          input.classList.add('shadcn-input');
        }
      });
    },
    
    /**
     * Set up a mutation observer to apply styles to dynamically added elements
     */
    setupMutationObserver() {
      // Check if MutationObserver is available
      if (typeof MutationObserver === 'undefined') {
        console.warn('MutationObserver not available, falling back to interval checks');
        
        // Fallback to interval-based checks
        setInterval(() => {
          this.applyShadcnStyles();
        }, 2000);
        
        return;
      }
      
      // Create a new observer
      const observer = new MutationObserver(mutations => {
        // Check if we need to apply styles
        let needsUpdate = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            needsUpdate = true;
            break;
          }
        }
        
        if (needsUpdate) {
          this.applyShadcnStyles();
        }
      });
      
      // Start observing
      observer.observe(this.$el || document.body, {
        childList: true,
        subtree: true
      });
      
      // Store observer reference for cleanup
      this._shadcnObserver = observer;
    }
  },
  
  beforeUnmount() {
    // Clean up the observer if it exists
    if (this._shadcnObserver) {
      this._shadcnObserver.disconnect();
      this._shadcnObserver = null;
    }
  }
};
