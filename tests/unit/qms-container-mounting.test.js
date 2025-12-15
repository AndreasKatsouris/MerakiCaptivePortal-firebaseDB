/**
 * QMS Container Mounting and Vue Initialization Unit Tests
 * 
 * Tests the critical container selection logic and Vue mounting behavior
 * identified by ARCH and FRONT agents as high-risk failure points.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Vue and other dependencies
const mockVueApp = {
  mount: jest.fn(),
  unmount: jest.fn(),
  use: jest.fn()
};

const mockVue = {
  createApp: jest.fn().mockReturnValue(mockVueApp)
};

global.Vue = mockVue;
global.bootstrap = {
  Modal: jest.fn()
};

// Mock SweetAlert2
global.Swal = {
  fire: jest.fn().mockResolvedValue({ isConfirmed: false })
};

// Mock Firebase modules
jest.mock('../../public/js/config/firebase-config.js', () => ({
  auth: { currentUser: null, onAuthStateChanged: jest.fn() },
  rtdb: {},
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  push: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
  serverTimestamp: jest.fn()
}));

// Mock access control
jest.mock('../../public/js/modules/access-control/services/access-control-service.js', () => ({
  default: {
    getCurrentSubscription: jest.fn().mockResolvedValue({ tierId: 'professional' }),
    canUseFeature: jest.fn().mockResolvedValue(true),
    getLimit: jest.fn().mockResolvedValue(100)
  }
}));

// Import the module under test
let initializeQueueManagement, cleanupQueueManagement;

// Helper function to create DOM structures
function createDOMStructure(variant) {
  document.body.innerHTML = '';
  
  switch (variant) {
    case 'admin-dashboard':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div id="queueManagementVueContent"></div>
        </div>
      `;
      break;
      
    case 'admin-dashboard-with-tabs':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <ul class="nav nav-tabs" id="adminQmsTabsNav">
            <li class="nav-item">
              <button class="nav-link active" id="admin-queue-tab">Queue</button>
            </li>
            <li class="nav-item">
              <button class="nav-link" id="admin-booking-tab">Booking</button>
            </li>
          </ul>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="admin-queue-pane">
              <div id="queueManagementVueContent"></div>
            </div>
            <div class="tab-pane fade" id="admin-booking-pane">
              <div id="adminBookingManagementContent"></div>
            </div>
          </div>
        </div>
      `;
      break;
      
    case 'user-dashboard':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div class="container-fluid">
            <div id="queueManagementVueContent"></div>
          </div>
        </div>
      `;
      break;
      
    case 'minimal-container':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section"></div>
      `;
      break;
      
    case 'no-container':
      // Leave body empty
      break;
      
    case 'partial-structure':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div class="container-fluid"></div>
        </div>
      `;
      break;
      
    case 'multiple-containers':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div id="queueManagementVueContent"></div>
          <div id="queueManagementContent2"></div>
          <div class="container-fluid"></div>
        </div>
      `;
      break;
  }
}

describe('QMS Container Selection Logic', () => {
  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Import fresh module for each test
    const module = await import('../../public/js/queue-management.js');
    initializeQueueManagement = module.initializeQueueManagement;
    cleanupQueueManagement = module.cleanupQueueManagement;
    
    // Reset global states
    window.queueManagementApp = null;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  describe('Container Priority Logic', () => {
    test('Should prioritize queueManagementVueContent in admin dashboard', async () => {
      createDOMStructure('admin-dashboard');
      
      await initializeQueueManagement();
      
      const vueApp = document.querySelector('#queue-management-app');
      const expectedParent = document.querySelector('#queueManagementVueContent');
      
      expect(vueApp).toBeTruthy();
      expect(vueApp.parentElement).toBe(expectedParent);
      expect(mockVue.createApp).toHaveBeenCalledTimes(1);
      expect(mockVueApp.mount).toHaveBeenCalledWith('#queue-management-app');
    });

    test('Should fall back to container-fluid when queueManagementVueContent missing', async () => {
      createDOMStructure('partial-structure');
      
      await initializeQueueManagement();
      
      const vueApp = document.querySelector('#queue-management-app');
      const fluidContainer = document.querySelector('.container-fluid');
      
      expect(vueApp).toBeTruthy();
      expect(fluidContainer.contains(vueApp)).toBe(true);
    });

    test('Should fall back to main container when all preferred containers missing', async () => {
      createDOMStructure('minimal-container');
      
      await initializeQueueManagement();
      
      const vueApp = document.querySelector('#queue-management-app');
      const mainContainer = document.querySelector('#queueManagementContent');
      
      expect(vueApp).toBeTruthy();
      expect(mainContainer.contains(vueApp)).toBe(true);
    });

    test('Should handle multiple containers correctly', async () => {
      createDOMStructure('multiple-containers');
      
      await initializeQueueManagement();
      
      const vueApps = document.querySelectorAll('#queue-management-app');
      const expectedParent = document.querySelector('#queueManagementVueContent');
      
      // Should create only one Vue app in the priority container
      expect(vueApps.length).toBe(1);
      expect(vueApps[0].parentElement).toBe(expectedParent);
    });
  });

  describe('Error Handling for Missing Containers', () => {
    test('Should fail gracefully when no container exists', async () => {
      createDOMStructure('no-container');
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const result = await initializeQueueManagement();
      
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Container not found')
      );
      expect(mockVue.createApp).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('Should handle DOM structure creation failure', async () => {
      createDOMStructure('minimal-container');
      
      // Mock DOM manipulation to throw error
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn().mockImplementation(() => {
        throw new Error('DOM manipulation failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await initializeQueueManagement();
      
      // Should handle error gracefully
      expect(consoleSpy).toHaveBeenCalled();
      
      // Restore
      document.createElement = originalCreateElement;
      consoleSpy.mockRestore();
    });
  });

  describe('Vue Mounting Error Handling', () => {
    test('Should handle Vue createApp failure', async () => {
      createDOMStructure('admin-dashboard');
      
      mockVue.createApp.mockImplementation(() => {
        throw new Error('Vue initialization failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await initializeQueueManagement();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vue initialization failed')
      );
      
      consoleSpy.mockRestore();
    });

    test('Should handle Vue mount failure', async () => {
      createDOMStructure('admin-dashboard');
      
      mockVueApp.mount.mockImplementation(() => {
        throw new Error('Mount failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await initializeQueueManagement();
      
      expect(mockVue.createApp).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mount failed')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Race Condition Prevention', () => {
    test('Should handle concurrent initialization attempts', async () => {
      createDOMStructure('admin-dashboard');
      
      // Start multiple initialization attempts simultaneously
      const promises = [
        initializeQueueManagement(),
        initializeQueueManagement(),
        initializeQueueManagement()
      ];
      
      await Promise.allSettled(promises);
      
      // Should only create one Vue app
      const vueApps = document.querySelectorAll('#queue-management-app');
      expect(vueApps.length).toBeLessThanOrEqual(1);
      
      // Vue.createApp should be called at most once
      expect(mockVue.createApp).toHaveBeenCalledTimes(1);
    });

    test('Should handle rapid cleanup and recreation', async () => {
      createDOMStructure('admin-dashboard');
      
      // Initialize, cleanup, and reinitialize rapidly
      await initializeQueueManagement();
      cleanupQueueManagement();
      await initializeQueueManagement();
      
      const vueApps = document.querySelectorAll('#queue-management-app');
      expect(vueApps.length).toBe(1);
      
      // Should handle cleanup and recreation properly
      expect(mockVueApp.unmount).toHaveBeenCalled();
      expect(mockVue.createApp).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Management', () => {
    test('Should properly cleanup Vue app on unmount', async () => {
      createDOMStructure('admin-dashboard');
      
      await initializeQueueManagement();
      
      expect(document.querySelector('#queue-management-app')).toBeTruthy();
      
      cleanupQueueManagement();
      
      expect(mockVueApp.unmount).toHaveBeenCalled();
      expect(document.querySelector('#queue-management-app')).toBeFalsy();
    });

    test('Should handle cleanup when no app exists', () => {
      createDOMStructure('admin-dashboard');
      
      // Attempt cleanup without initialization
      expect(() => cleanupQueueManagement()).not.toThrow();
      
      expect(mockVueApp.unmount).not.toHaveBeenCalled();
    });

    test('Should prevent memory leaks from multiple cleanup calls', async () => {
      createDOMStructure('admin-dashboard');
      
      await initializeQueueManagement();
      
      // Multiple cleanup calls
      cleanupQueueManagement();
      cleanupQueueManagement();
      cleanupQueueManagement();
      
      // Should only unmount once
      expect(mockVueApp.unmount).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Tab Structure Creation Logic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module = await import('../../public/js/queue-management.js');
    initializeQueueManagement = module.initializeQueueManagement;
    cleanupQueueManagement = module.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  test('Should create admin dashboard tab structure when needed', async () => {
    createDOMStructure('minimal-container');
    
    // Mock admin dashboard context
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/admin-dashboard.html'
      }
    });
    
    await initializeQueueManagement();
    
    // Should create tab navigation structure
    expect(document.querySelector('#adminQmsTabsNav')).toBeTruthy();
    expect(document.querySelector('#admin-queue-tab')).toBeTruthy();
    expect(document.querySelector('#admin-booking-tab')).toBeTruthy();
    expect(document.querySelector('#admin-queue-pane')).toBeTruthy();
    expect(document.querySelector('#admin-booking-pane')).toBeTruthy();
  });

  test('Should create user dashboard tab structure when needed', async () => {
    createDOMStructure('minimal-container');
    
    // Mock user dashboard context
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/queue-management.html'
      }
    });
    
    await initializeQueueManagement();
    
    // Should create user tab navigation structure
    expect(document.querySelector('#qmsTabsNav')).toBeTruthy();
    expect(document.querySelector('#queue-tab')).toBeTruthy();
    expect(document.querySelector('#booking-tab')).toBeTruthy();
    expect(document.querySelector('#queue-pane')).toBeTruthy();
    expect(document.querySelector('#booking-pane')).toBeTruthy();
  });

  test('Should not duplicate existing tab structures', async () => {
    createDOMStructure('admin-dashboard-with-tabs');
    
    const initialTabCount = document.querySelectorAll('.nav-tabs').length;
    
    await initializeQueueManagement();
    
    const finalTabCount = document.querySelectorAll('.nav-tabs').length;
    
    // Should not create additional tab structures
    expect(finalTabCount).toBe(initialTabCount);
  });

  test('Should handle tab structure creation failure', async () => {
    createDOMStructure('minimal-container');
    
    // Mock innerHTML setter to throw error
    const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
      set: jest.fn().mockImplementation(() => {
        throw new Error('Tab creation failed');
      }),
      get: originalInnerHTML.get
    });
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    await initializeQueueManagement();
    
    // Should handle error gracefully
    expect(consoleSpy).toHaveBeenCalled();
    
    // Restore
    Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
    consoleSpy.mockRestore();
  });
});

describe('Context Detection Logic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module = await import('../../public/js/queue-management.js');
    initializeQueueManagement = module.initializeQueueManagement;
    cleanupQueueManagement = module.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  const contextTestCases = [
    {
      name: 'Admin dashboard by pathname',
      setup: () => {
        Object.defineProperty(window, 'location', {
          value: { pathname: '/admin-dashboard.html' }
        });
        createDOMStructure('admin-dashboard');
      },
      expected: 'admin'
    },
    {
      name: 'Admin dashboard by container ID',
      setup: () => {
        Object.defineProperty(window, 'location', {
          value: { pathname: '/some-page.html' }
        });
        createDOMStructure('admin-dashboard');
        document.querySelector('#queueManagementContent').id = 'queueManagementContent';
      },
      expected: 'admin'
    },
    {
      name: 'User dashboard by pathname',
      setup: () => {
        Object.defineProperty(window, 'location', {
          value: { pathname: '/queue-management.html' }
        });
        createDOMStructure('user-dashboard');
      },
      expected: 'user'
    }
  ];

  contextTestCases.forEach(({ name, setup, expected }) => {
    test(`Should detect ${expected} context: ${name}`, async () => {
      setup();
      
      await initializeQueueManagement();
      
      if (expected === 'admin') {
        // Should initialize admin booking support
        expect(document.querySelector('#adminQmsTabsNav') || 
               document.querySelector('#admin-booking-tab')).toBeTruthy();
      } else {
        // Should initialize user booking support  
        expect(document.querySelector('#qmsTabsNav') ||
               document.querySelector('#booking-tab')).toBeTruthy();
      }
    });
  });
});

describe('Performance and Timing', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module = await import('../../public/js/queue-management.js');
    initializeQueueManagement = module.initializeQueueManagement;
    cleanupQueueManagement = module.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  test('Should complete initialization within reasonable time', async () => {
    createDOMStructure('admin-dashboard');
    
    const startTime = Date.now();
    await initializeQueueManagement();
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    
    // Should initialize quickly (less than 100ms in test environment)
    expect(duration).toBeLessThan(100);
  });

  test('Should handle slow DOM operations', async () => {
    createDOMStructure('admin-dashboard');
    
    // Mock slow DOM operation
    const originalAppendChild = Element.prototype.appendChild;
    Element.prototype.appendChild = jest.fn().mockImplementation(function(child) {
      return new Promise(resolve => {
        setTimeout(() => {
          const result = originalAppendChild.call(this, child);
          resolve(result);
        }, 50);
      });
    });
    
    const startTime = Date.now();
    await initializeQueueManagement();
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    
    // Should still complete but take longer
    expect(duration).toBeGreaterThan(40);
    expect(mockVue.createApp).toHaveBeenCalled();
    
    // Restore
    Element.prototype.appendChild = originalAppendChild;
  });
});