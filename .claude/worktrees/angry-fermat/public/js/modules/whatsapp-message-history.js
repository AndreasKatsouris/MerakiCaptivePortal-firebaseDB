/**
 * WhatsApp Message History Module - Enhanced Version
 * Version: 2.0.0-2025-12-15
 * 
 * Displays WhatsApp message history with WhatsApp-style UI
 * Features: Message bubbles, threading, collapsible conversations, date grouping
 */

import { rtdb, ref, onValue, off } from '../config/firebase-config.js';

// Module state
let messageHistory = [];
let filteredMessages = [];
let listeners = [];
let viewMode = 'list'; // 'list' or 'thread'
let activeThreadPhone = null;
let expandedConversations = new Set();

// Constants
const MESSAGE_TRUNCATE_LENGTH = 150;
const CHECKMARK_ICONS = {
    sent: '✓',
    delivered: '✓✓',
    read: '✓✓',
    failed: '✗',
    pending: '○'
};

/**
 * Initialize the message history module
 */
export async function initializeMessageHistory(containerId = 'whatsappMessageHistory') {
    console.log('📱 [Message History] Initializing enhanced version...');

    const container = document.getElementById(containerId);
    if (!container) {
        console.error('📱 [Message History] Container not found:', containerId);
        return;
    }

    // Create UI
    createMessageHistoryUI(container);

    // Load messages from Firebase
    await loadMessages();

    // Setup event listeners
    setupEventListeners();

    console.log('✅ [Message History] Enhanced version initialized successfully');
}

/**
 * Create the enhanced message history UI
 */
function createMessageHistoryUI(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="card-title mb-0">
                    <i class="fas fa-comments me-2"></i>WhatsApp Message History
                </h5>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-primary" id="messageCount">0 messages</span>
                    <div class="btn-group btn-group-sm" role="group" id="viewModeToggle">
                        <button type="button" class="btn btn-outline-secondary active" data-view="list">
                            <i class="fas fa-list"></i> List
                        </button>
                        <button type="button" class="btn btn-outline-secondary" data-view="thread">
                            <i class="fas fa-comments"></i> Thread
                        </button>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <!-- Search Bar -->
                <div class="mb-3">
                    <div class="input-group">
                        <span class="input-group-text">
                            <i class="fas fa-search"></i>
                        </span>
                        <input 
                            type="text" 
                            class="form-control" 
                            id="messageSearchInput" 
                            placeholder="Search by name, phone number, or message content..."
                        >
                        <button class="btn btn-outline-secondary" type="button" id="clearSearch">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Messages Container -->
                <div id="messagesContainer" style="max-height: 600px; overflow-y: auto;">
                    <div class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2 text-muted">Loading messages...</p>
                    </div>
                </div>
                
                <!-- Thread View Container (hidden by default) -->
                <div id="threadContainer" class="d-none">
                    <div class="d-flex align-items-center mb-3 pb-2 border-bottom">
                        <button class="btn btn-sm btn-outline-secondary me-3" id="backToList">
                            <i class="fas fa-arrow-left"></i> Back to List
                        </button>
                        <div id="threadHeader" class="flex-grow-1">
                            <!-- Thread header info -->
                        </div>
                    </div>
                    <div id="threadMessages" style="max-height: 500px; overflow-y: auto;">
                        <!-- Thread messages -->
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load messages from Firebase
 */
async function loadMessages() {
    return new Promise((resolve, reject) => {
        const messagesRef = ref(rtdb, 'whatsapp-message-history');

        const listener = onValue(messagesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();

                // Convert to array and sort by timestamp (newest first)
                messageHistory = Object.entries(data).map(([id, msg]) => ({
                    id,
                    ...msg
                })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                console.log(`📱 [Message History] Loaded ${messageHistory.length} messages`);

                filteredMessages = [...messageHistory];
                renderMessages();
                resolve();
            } else {
                console.log('📱 [Message History] No messages found');
                messageHistory = [];
                filteredMessages = [];
                renderEmptyState();
                resolve();
            }
        }, (error) => {
            console.error('📱 [Message History] Error loading messages:', error);
            renderErrorState(error.message);
            reject(error);
        });

        listeners.push({ ref: messagesRef, listener });
    });
}

/**
 * Group messages by phone number
 */
function groupMessagesByPhone(messages) {
    const grouped = {};

    messages.forEach(msg => {
        const phoneNumber = msg.phoneNumber || 'Unknown';
        if (!grouped[phoneNumber]) {
            // Try to extract guest name from phone number or use a default
            let guestName = 'Guest';

            // If there's metadata with a receiving number, that's likely the business
            // So the phoneNumber field is the guest's number
            if (phoneNumber && phoneNumber !== 'Unknown') {
                // Format phone as a fallback: +27123456789 -> +27 12 345 6789
                guestName = phoneNumber;
            }

            grouped[phoneNumber] = {
                phoneNumber,
                guestName: guestName,
                locationName: msg.metadata?.locationName || 'Unknown Location',
                messages: [],
                lastMessage: null,
                unreadCount: 0
            };
        }
        grouped[phoneNumber].messages.push(msg);
    });

    // Set last message and sort
    Object.values(grouped).forEach(group => {
        group.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        group.lastMessage = group.messages[group.messages.length - 1];
    });

    // Sort groups by last message time
    return Object.values(grouped).sort((a, b) =>
        (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)
    );
}

/**
 * Group messages by date
 */
function groupMessagesByDate(messages) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
        'Today': [],
        'Yesterday': [],
        'Last Week': [],
        'Older': []
    };

    messages.forEach(msg => {
        const msgDate = new Date(msg.timestamp);
        const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());

        if (msgDay.getTime() === today.getTime()) {
            groups['Today'].push(msg);
        } else if (msgDay.getTime() === yesterday.getTime()) {
            groups['Yesterday'].push(msg);
        } else if (msgDay >= lastWeek) {
            groups['Last Week'].push(msg);
        } else {
            groups['Older'].push(msg);
        }
    });

    return groups;
}

/**
 * Render messages based on current view mode
 */
function renderMessages() {
    const container = document.getElementById('messagesContainer');
    const threadContainer = document.getElementById('threadContainer');
    const messageCount = document.getElementById('messageCount');

    if (!container) return;

    // Update count
    messageCount.textContent = `${filteredMessages.length} message${filteredMessages.length !== 1 ? 's' : ''}`;

    if (filteredMessages.length === 0) {
        renderEmptyState('No messages match your search');
        return;
    }

    if (viewMode === 'list') {
        container.classList.remove('d-none');
        threadContainer.classList.add('d-none');
        renderListView();
    } else {
        container.classList.add('d-none');
        threadContainer.classList.remove('d-none');
        renderThreadView();
    }
}

/**
 * Render list view with collapsible conversations
 */
function renderListView() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const groupedMessages = groupMessagesByPhone(filteredMessages);

    container.innerHTML = groupedMessages.map(group => {
        const isExpanded = expandedConversations.has(group.phoneNumber);

        return `
            <div class="card mb-3 conversation-card">
                <div class="card-header bg-light conversation-header" 
                     style="cursor: pointer;"
                     onclick="toggleConversation('${escapeHtml(group.phoneNumber)}')">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-0">
                                <i class="fas fa-user-circle me-2 text-success"></i>
                                ${escapeHtml(group.guestName)}
                            </h6>
                            <small class="text-muted d-flex align-items-center mt-1">
                                <i class="fab fa-whatsapp me-1"></i>
                                ${escapeHtml(group.phoneNumber)}
                                <span class="ms-2 text-muted">• ${escapeHtml(group.locationName)}</span>
                            </small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-secondary mb-1">
                                ${group.messages.length} message${group.messages.length !== 1 ? 's' : ''}
                            </span>
                            <br>
                            <small class="text-muted">
                                ${formatTimestamp(group.lastMessage?.timestamp)}
                            </small>
                            <br>
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'} text-muted mt-1"></i>
                        </div>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="card-body p-3" id="conversation-${escapeHtml(group.phoneNumber).replace(/\+/g, '')}">
                        ${renderConversationMessages(group.messages, group.phoneNumber)}
                    </div>
                ` : `
                    <div class="card-footer bg-white border-top-0 pt-0 pb-2">
                        <div class="message-preview">
                            ${renderMessagePreview(group.lastMessage)}
                        </div>
                    </div>
                `}
            </div>
        `;
    }).join('');
}

/**
 * Render message preview for collapsed conversations
 */
function renderMessagePreview(msg) {
    if (!msg) return '';

    const content = msg.content || 'No content';
    const isInbound = msg.direction === 'inbound';
    const icon = isInbound ? '<i class="fas fa-arrow-down text-success me-1"></i>' :
        '<i class="fas fa-arrow-up text-primary me-1"></i>';
    const truncated = truncateMessage(content, 80);

    return `
        <div class="d-flex align-items-start">
            ${icon}
            <span class="text-muted small">${escapeHtml(truncated)}</span>
        </div>
    `;
}

/**
 * Render conversation messages with date grouping
 */
function renderConversationMessages(messages, phoneNumber) {
    const dateGroups = groupMessagesByDate(messages);

    let html = '';

    for (const [dateLabel, msgs] of Object.entries(dateGroups)) {
        if (msgs.length === 0) continue;

        html += `
            <div class="date-divider my-3">
                <span class="date-label">${dateLabel}</span>
            </div>
        `;

        msgs.forEach(msg => {
            html += renderMessageBubble(msg);
        });
    }

    return html || '<p class="text-muted text-center py-3">No messages in this conversation</p>';
}

/**
 * Render individual message as WhatsApp-style bubble
 */
function renderMessageBubble(msg) {
    const isInbound = msg.direction === 'inbound';
    const bubbleClass = isInbound ? 'message-bubble-received' : 'message-bubble-sent';
    const alignClass = isInbound ? '' : 'justify-content-end';

    const content = msg.content || '';
    const displayContent = content ? escapeHtml(content) :
        '<em class="text-muted">[No content - may be a template or media message]</em>';

    const isTruncated = content.length > MESSAGE_TRUNCATE_LENGTH;
    const messageId = `msg-${msg.id || Math.random()}`;

    const statusIcon = getStatusCheckmark(msg.status, isInbound);
    const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return `
        <div class="d-flex ${alignClass} mb-2 message-row">
            <div class="${bubbleClass}">
                <div class="message-text" id="${messageId}">
                    ${isTruncated ?
            `<span class="message-truncated">${escapeHtml(content.substring(0, MESSAGE_TRUNCATE_LENGTH))}...</span>
                         <a href="#" class="read-more-link" onclick="toggleMessageExpand('${messageId}', event)">Read more</a>
                         <span class="message-full d-none">${displayContent}</span>`
            : displayContent}
                </div>
                <div class="message-meta">
                    <span class="message-time">${timestamp}</span>
                    ${!isInbound ? `<span class="message-status ${msg.status === 'read' ? 'status-read' : ''}">${statusIcon}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render thread view
 */
function renderThreadView() {
    const threadContainer = document.getElementById('threadMessages');
    const threadHeader = document.getElementById('threadHeader');

    if (!activeThreadPhone || !threadContainer) return;

    const conversation = groupMessagesByPhone(filteredMessages).find(
        g => g.phoneNumber === activeThreadPhone
    );

    if (!conversation) {
        viewMode = 'list';
        renderMessages();
        return;
    }

    // Render header
    threadHeader.innerHTML = `
        <h6 class="mb-0">
            <i class="fas fa-user-circle me-2 text-success"></i>
            ${escapeHtml(conversation.guestName)}
        </h6>
        <small class="text-muted">
            <i class="fab fa-whatsapp me-1"></i>${escapeHtml(conversation.phoneNumber)}
            <span class="ms-3">${conversation.messages.length} messages</span>
        </small>
    `;

    // Render messages
    threadContainer.innerHTML = renderConversationMessages(conversation.messages, activeThreadPhone);

    // Scroll to bottom
    setTimeout(() => {
        threadContainer.scrollTop = threadContainer.scrollHeight;
    }, 100);
}

/**
 * Get WhatsApp-style status checkmark
 */
function getStatusCheckmark(status, isInbound) {
    if (isInbound) return '';

    const icon = CHECKMARK_ICONS[status] || CHECKMARK_ICONS.pending;
    return icon;
}

/**
 * Truncate message text
 */
function truncateMessage(text, maxLength = MESSAGE_TRUNCATE_LENGTH) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Toggle message expansion
 */
window.toggleMessageExpand = function (messageId, event) {
    event.preventDefault();
    const container = document.getElementById(messageId);
    if (!container) return;

    const truncated = container.querySelector('.message-truncated');
    const full = container.querySelector('.message-full');
    const link = container.querySelector('.read-more-link');

    if (truncated && full && link) {
        const isExpanded = !full.classList.contains('d-none');

        if (isExpanded) {
            truncated.classList.remove('d-none');
            full.classList.add('d-none');
            link.textContent = 'Read more';
        } else {
            truncated.classList.add('d-none');
            full.classList.remove('d-none');
            link.textContent = 'Read less';
        }
    }
};

/**
 * Toggle conversation expansion
 */
window.toggleConversation = function (phoneNumber) {
    if (expandedConversations.has(phoneNumber)) {
        expandedConversations.delete(phoneNumber);
    } else {
        expandedConversations.add(phoneNumber);
    }
    renderMessages();
};

/**
 * Switch to thread view for a specific phone number
 */
window.openThread = function (phoneNumber) {
    activeThreadPhone = phoneNumber;
    viewMode = 'thread';
    renderMessages();
};

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const searchInput = document.getElementById('messageSearchInput');
    const clearButton = document.getElementById('clearSearch');
    const viewToggle = document.getElementById('viewModeToggle');
    const backToList = document.getElementById('backToList');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterMessages(e.target.value);
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                filterMessages('');
            }
        });
    }

    if (viewToggle) {
        viewToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-view]');
            if (!btn) return;

            const newView = btn.dataset.view;
            if (newView === viewMode) return;

            // Update button states
            viewToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            viewMode = newView;
            renderMessages();
        });
    }

    if (backToList) {
        backToList.addEventListener('click', () => {
            viewMode = 'list';
            activeThreadPhone = null;
            renderMessages();
        });
    }
}

/**
 * Filter messages by search term
 */
function filterMessages(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
        filteredMessages = [...messageHistory];
    } else {
        filteredMessages = messageHistory.filter(msg => {
            // Search in phone number
            if (msg.phoneNumber?.toLowerCase().includes(term)) return true;

            // Search in guest/location name
            if (msg.metadata?.locationName?.toLowerCase().includes(term)) return true;

            // Search in message content
            if (msg.content?.toLowerCase().includes(term)) return true;

            return false;
        });
    }

    renderMessages();
}

/**
 * Format timestamp with relative dates
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown time';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Show relative time for recent messages
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    // Show full date for older messages
    return date.toLocaleString('en-ZA', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Render empty state
 */
function renderEmptyState(message = 'No messages found') {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-comments fa-3x text-muted mb-3"></i>
            <h5 class="text-muted">${escapeHtml(message)}</h5>
            <p class="text-muted">WhatsApp messages will appear here once they are sent or received.</p>
            ${message !== 'No messages found' ? `
                <button class="btn btn-outline-primary btn-sm mt-3" onclick="document.getElementById('clearSearch').click()">
                    <i class="fas fa-times me-1"></i>Clear Search
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * Render error state
 */
function renderErrorState(errorMessage) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="alert alert-danger" role="alert">
            <h5 class="alert-heading">
                <i class="fas fa-exclamation-triangle me-2"></i>Error Loading Messages
            </h5>
            <p class="mb-0">${escapeHtml(errorMessage)}</p>
            <hr>
            <p class="mb-0 small">
                <button class="btn btn-sm btn-outline-danger" onclick="location.reload()">
                    <i class="fas fa-redo me-1"></i>Reload Page
                </button>
            </p>
        </div>
    `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Cleanup function
 */
export function cleanup() {
    console.log('📱 [Message History] Cleaning up...');

    // Remove Firebase listeners
    listeners.forEach(({ ref: dbRef, listener }) => {
        off(dbRef, 'value', listener);
    });
    listeners = [];

    // Clear data
    messageHistory = [];
    filteredMessages = [];
    expandedConversations.clear();
    activeThreadPhone = null;
}

// Export for global access
window.WhatsAppMessageHistory = {
    initialize: initializeMessageHistory,
    cleanup
};
