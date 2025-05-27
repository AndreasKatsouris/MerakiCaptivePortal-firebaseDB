/**
 * shadcn/ui Inspired Styles for Food Cost Module
 * This script applies modern shadcn/ui style to existing Bootstrap components
 */

// Add stylesheet link to document
function addStylesheet() {
  const linkElement = document.createElement('link');
  linkElement.rel = 'stylesheet';
  linkElement.href = '../../css/shadcn-inspired.css';
  document.head.appendChild(linkElement);
}

// Apply shadcn classes to elements
function applyShadcnStyles() {
  // Style cards
  document.querySelectorAll('.card').forEach(card => {
    card.classList.add('shadcn-card');
    
    // Card headers
    const cardHeader = card.querySelector('.card-header');
    if (cardHeader) {
      cardHeader.classList.add('shadcn-card-header');
    }
    
    // Card bodies
    const cardBody = card.querySelector('.card-body');
    if (cardBody) {
      cardBody.classList.add('shadcn-card-body');
    }
  });

  // Style buttons
  document.querySelectorAll('.btn').forEach(button => {
    button.classList.add('shadcn-btn');
    
    // Apply shadcn variants based on Bootstrap classes
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
    } else if (button.classList.contains('btn-outline-primary')) {
      button.classList.add('shadcn-btn-outline-primary');
    } else if (button.classList.contains('btn-outline-secondary')) {
      button.classList.add('shadcn-btn-outline');
    }
    
    // Button sizes
    if (button.classList.contains('btn-sm')) {
      button.classList.add('shadcn-btn-sm');
    } else if (button.classList.contains('btn-lg')) {
      button.classList.add('shadcn-btn-lg');
    }
  });

  // Style button groups
  document.querySelectorAll('.btn-group').forEach(group => {
    group.classList.add('shadcn-btn-group');
  });

  // Style form controls
  document.querySelectorAll('.form-control').forEach(input => {
    input.classList.add('shadcn-input');
  });

  // Style input groups
  document.querySelectorAll('.input-group').forEach(group => {
    group.classList.add('shadcn-input-group');
    
    const prepend = group.querySelector('.input-group-prepend');
    if (prepend) {
      const text = prepend.querySelector('.input-group-text');
      if (text) {
        text.classList.add('shadcn-input-group-text');
      }
    }
  });

  // Style filter buttons
  document.querySelectorAll('.dropdown-toggle.w-100.border').forEach(button => {
    button.classList.add('shadcn-filter-btn');
  });

  // Style alerts
  document.querySelectorAll('.alert').forEach(alert => {
    alert.classList.add('shadcn-alert');
    
    if (alert.classList.contains('alert-info')) {
      alert.classList.add('shadcn-alert-info');
    }
  });

  // Style filter popovers
  document.querySelectorAll('.filter-popup-overlay').forEach(popover => {
    popover.classList.add('shadcn-popover');
    
    const content = popover.querySelector('.filter-popup');
    if (content) {
      content.classList.add('shadcn-popover-content');
    }
    
    const header = popover.querySelector('.filter-popup h4');
    if (header) {
      header.classList.add('shadcn-popover-header');
    }
    
    const closeBtn = popover.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.classList.add('shadcn-popover-close');
    }
  });

  // Style checkboxes
  document.querySelectorAll('.form-check-input[type="checkbox"]').forEach(checkbox => {
    checkbox.classList.add('shadcn-checkbox');
  });

  // Style tables
  document.querySelectorAll('.table').forEach(table => {
    table.classList.add('shadcn-table');
  });

  // Style table containers
  document.querySelectorAll('.table-responsive').forEach(container => {
    container.classList.add('shadcn-responsive-table');
  });
}

// Initialize the styles
function initShadcnStyles() {
  addStylesheet();
  
  // Apply styles immediately if DOM is already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    applyShadcnStyles();
  } else {
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', applyShadcnStyles);
  }
  
  // Reapply styles when Vue updates the DOM
  // This helps ensure dynamically added elements get styled
  setInterval(applyShadcnStyles, 1000);
}

// Export the initializer
export { initShadcnStyles };
