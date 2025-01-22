// guest-management.js
import GuestManagement from './components/GuestManagement.vue';

let app = null;

export function initializeGuestManagement() {
    // Guest menu click handler
    const guestManagementMenu = document.getElementById('guestManagementMenu');
    if (guestManagementMenu) {
        guestManagementMenu.addEventListener('click', function(e) {
            e.preventDefault();
            showGuestManagement();
        });
    }
}

function showGuestManagement() {
    // Hide other sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show guest management section
    const guestSection = document.getElementById('guestManagementContent');
    if (guestSection) {
        guestSection.style.display = 'block';
    }

    // Initialize Vue app if not already done
    if (!app) {
        app = Vue.createApp(GuestManagement).mount('#guestManagementRoot');
    }
}