/**
 * Toast Notification Utility
 * Version: 1.0.0-2025-04-25
 * 
 * Uses SweetAlert2 to display simple toast notifications.
 */

/**
 * Displays a toast notification.
 * 
 * @param {string} message The message to display.
 * @param {string} type The type of toast ('success', 'error', 'warning', 'info', 'question'). Defaults to 'info'.
 * @param {number} duration Duration in milliseconds. Defaults to 3000.
 */
export function showToast(message, type = 'info', duration = 3000) {
    if (typeof Swal === 'undefined') {
        console.error('SweetAlert2 (Swal) is not loaded. Cannot display toast.');
        // Fallback to console log
        console.log(`Toast [${type}]: ${message}`);
        return;
    }

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    Toast.fire({
        icon: type, 
        title: message
    });
}
