// Shared JavaScript for ZenDesk Multi-Page Application
const API_BASE = 'https://backend-s9yn.render.com/';

// Global Auth Helpers
function getToken() {
    return localStorage.getItem('zd_token');
}

function parseJwt(token) {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0))));
    } catch (e) {
        return null;
    }
}

function getUser() {
    const token = getToken();
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
        logout();
        return null;
    }
    return {
        email: payload.sub,
        role: payload["Role:"],
        userId: payload.userId,
        fullName: payload.fullName
    };
}

function logout() {
    localStorage.removeItem('zd_token');
    window.location.href = 'login.html';
}

// API Fetch Helper
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(url, { ...options, headers });
        if (res.status === 204) return true;

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || `Error status ${res.status}`);
        }
        return data;
    } catch (err) {
        alert(err.message);
        throw err;
    }
}

// Render dynamic navbar based on role
function renderNavbar() {
    const header = document.querySelector('header');
    if (!header) return;

    const user = getUser();
    if (!user) {
        header.innerHTML = `<h1>ZenDesk Support</h1>`;
        return;
    }

    let navLinks = `<a href="tickets.html">Tickets</a>`;
    if (user.role === 'SUPERVISOR') {
        navLinks += `
            <a href="agents.html">Agents</a>
            <a href="assignments.html">Assignments</a>
        `;
    } else if (user.role === 'SUPPORT_AGENT') {
        navLinks += `<a href="agents.html">My Profile</a>`;
    }

    header.innerHTML = `
        <h1>ZenDesk</h1>
        <div class="nav-links">
            ${navLinks}
            <span style="margin-right: 1.5rem; font-size: 0.9rem;">
                Account: <strong>${user.email}</strong> <span class="badge" style="background:#4b5563; color:white; vertical-align:middle;">${user.role}</span>
            </span>
            <button onclick="logout()" class="btn btn-secondary btn-sm">Log Out</button>
        </div>
    `;
}

// Global page initialization
window.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    const isAuthPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('login.html');

    if (!user && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    if (user && isAuthPage) {
        window.location.href = 'tickets.html';
        return;
    }

    renderNavbar();

    // Page router triggers
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('login.html') || window.location.pathname === '/') {
        initAuthPage();
    } else if (window.location.pathname.endsWith('tickets.html')) {
        initTicketsPage();
    } else if (window.location.pathname.endsWith('agents.html')) {
        initAgentsPage();
    } else if (window.location.pathname.endsWith('assignments.html')) {
        initAssignmentsPage();
    } else if (window.location.pathname.endsWith('comments.html')) {
        initCommentsPage();
    }
});

// ==========================================
// 1. AUTHENTICATION PAGES CONTROLLER LOGIC
// ==========================================
function initAuthPage() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Check if query params are present to pre-populate (coming from registration)
    const urlParams = new URLSearchParams(window.location.search);
    const isRegistered = urlParams.get('registered') === 'true';
    const regEmail = urlParams.get('email');
    const regRole = urlParams.get('role');

    if (isRegistered) {
        const alertBox = document.getElementById('registered-alert');
        if (alertBox) {
            alertBox.style.display = 'block';
        }
    }
    if (regEmail && document.getElementById('login-email')) {
        document.getElementById('login-email').value = regEmail;
    }
    if (regRole && document.getElementById('login-role')) {
        document.getElementById('login-role').value = regRole;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const role = document.getElementById('login-role').value;

            try {
                const data = await apiCall('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, role })
                });
                localStorage.setItem('zd_token', data.token);
                window.location.href = 'tickets.html';
            } catch (err) {
                // error handled in apiCall
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const role = document.getElementById('register-role').value;

            try {
                await apiCall('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ fullName, email, password, role })
                });
                window.location.href = `login.html?registered=true&email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`;
            } catch (err) {
                // error handled in apiCall
            }
        });
    }
}

// ==========================================
// 2. TICKETS LIFECYCLE CONTROLLER LOGIC
// ==========================================
async function initTicketsPage() {
    const user = getUser();
    const customerCreateCard = document.getElementById('customer-create-card');
    const ticketForm = document.getElementById('ticket-form');
    const tableBody = document.getElementById('tickets-table-body');
    const statusFilter = document.getElementById('tickets-status-filter');

    // Show ticket submission form only if the logged-in user is a CUSTOMER
    if (user.role === 'CUSTOMER') {
        if (customerCreateCard) customerCreateCard.classList.remove('hidden');
    }

    if (user.role === 'SUPPORT_AGENT' || user.role === 'SUPERVISOR') {
        if (statusFilter) {
            const slaOption = document.createElement('option');
            slaOption.value = 'SLA_RISK';
            slaOption.textContent = 'SLA Risk';
            statusFilter.appendChild(slaOption);
        }
        const statsPanel = document.getElementById('tickets-stats-panel');
        if (statsPanel) {
            statsPanel.classList.remove('hidden');
            loadTicketStats();
        }
    }

    async function loadTicketStats() {
        const statsPanel = document.getElementById('tickets-stats-panel');
        if (!statsPanel) return;
        try {
            const stats = await apiCall('/api/tickets/stats');
            const keys = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'CLOSED'];
            const labels = {
                'OPEN': 'Open',
                'IN_PROGRESS': 'In Progress',
                'RESOLVED': 'Resolved',
                'ESCALATED': 'Escalated',
                'CLOSED': 'Closed'
            };
            const colors = {
                'OPEN': '#4f46e5',
                'IN_PROGRESS': '#d97706',
                'RESOLVED': '#047857',
                'ESCALATED': '#e11d48',
                'CLOSED': '#475569'
            };

            statsPanel.innerHTML = keys.map(key => `
                <div style="flex: 1; min-width: 120px; text-align: center; padding: 0.75rem; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid rgba(226, 232, 240, 0.8);">
                    <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 0.25rem;">${labels[key]}</div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: ${colors[key]};">${stats[key] || 0}</div>
                </div>
            `).join('');
        } catch (err) {
            statsPanel.innerHTML = '<p style="color:#ef4444; font-size: 0.9rem;">Failed to load statistics.</p>';
        }
    }

    // Ticket submission handler
    if (ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('ticket-title').value;
            const category = document.getElementById('ticket-category').value;
            const priority = document.getElementById('ticket-priority').value;
            const description = document.getElementById('ticket-description').value;

            try {
                await apiCall('/api/tickets', {
                    method: 'POST',
                    body: JSON.stringify({ title, category, priority, description })
                });
                alert('Ticket created successfully!');
                ticketForm.reset();
                loadTickets();
            } catch (err) {
                // error handled in apiCall
            }
        });
    }

    // Status Filter Change Trigger
    if (statusFilter) {
        statusFilter.addEventListener('change', loadTickets);
    }

    // Fetch and render tickets
    async function loadTickets() {
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="7">Loading tickets...</td></tr>';

        try {
            const selectedStatus = statusFilter ? statusFilter.value : 'ALL';
            let tickets;
            if (selectedStatus === 'SLA_RISK') {
                tickets = await apiCall('/api/tickets/sla-risk');
            } else {
                tickets = await apiCall('/api/tickets');
            }

            const filtered = selectedStatus === 'SLA_RISK' ? tickets : tickets.filter(t => selectedStatus === 'ALL' || t.status === selectedStatus);

            if (filtered.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="7">No tickets found.</td></tr>';
                return;
            }

            tableBody.innerHTML = filtered.map(t => {
                const actionButtons = `
                    <a href="comments.html?ticketId=${t.ticketId}" class="btn btn-secondary btn-sm">Comments (${t.commentCount})</a>
                    ${user.role !== 'CUSTOMER' ? `
                        <select onchange="updateTicketStatus(${t.ticketId}, this.value)" class="form-input btn-sm" style="display:inline-block; width:130px; margin-left: 0.5rem;">
                            <option value="" disabled selected>Change Status</option>
                            ${getTransitions(t.status).map(status => `<option value="${status}">${status.replace('_', ' ')}</option>`).join('')}
                        </select>
                    ` : ''}
                `;

                return `
                    <tr>
                        <td><strong>#${t.ticketId}</strong></td>
                        <td>${escapeHtml(t.title)}</td>
                        <td>${escapeHtml(t.category || 'General')}</td>
                        <td><span class="badge badge-${t.status.toLowerCase().replace('_', '-')}">${t.status.replace('_', ' ')}</span></td>
                        <td><span class="badge-priority badge-${t.priority.toLowerCase()}">${t.priority}</span></td>
                        <td>${escapeHtml(t.assignedAgentName || 'Unassigned')}</td>
                        <td>${actionButtons}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tableBody.innerHTML = '<tr><td colspan="7">Failed to load tickets directory.</td></tr>';
        }
    }

    // Global scope trigger helper for status updates
    window.updateTicketStatus = async (ticketId, newStatus) => {
        try {
            await apiCall(`/api/tickets/${ticketId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });
            alert('Ticket status updated!');
            loadTickets();
            if (user.role === 'SUPPORT_AGENT' || user.role === 'SUPERVISOR') {
                loadTicketStats();
            }
        } catch (err) {
            // error handled in apiCall
        }
    };

    loadTickets();
}

// Transitions mapping logic
function getTransitions(status) {
    const rules = {
        'OPEN': ['IN_PROGRESS', 'CLOSED', 'ESCALATED'],
        'IN_PROGRESS': ['RESOLVED', 'ESCALATED', 'OPEN'],
        'ESCALATED': ['IN_PROGRESS', 'CLOSED'],
        'RESOLVED': ['CLOSED', 'OPEN'],
        'CLOSED': []
    };
    return rules[status] || [];
}

// ==========================================
// 3. AGENT PROFILE & WORKLOAD CONTROLLER
// ==========================================
async function initAgentsPage() {
    const user = getUser();
    const supervisorCard = document.getElementById('supervisor-agents-card');
    const agentCard = document.getElementById('agent-profile-card');

    if (user.role === 'SUPERVISOR') {
        if (supervisorCard) supervisorCard.classList.remove('hidden');
        loadSupervisorAgentsList();
    } else if (user.role === 'SUPPORT_AGENT') {
        if (agentCard) agentCard.classList.remove('hidden');
        loadAgentProfileForm();
    }

    async function loadSupervisorAgentsList() {
        const tableBody = document.getElementById('agents-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="6">Loading agent profiles...</td></tr>';

        try {
            const agents = await apiCall('/agents/workload');
            tableBody.innerHTML = agents.map(a => `
                <tr>
                    <td><strong>#${a.agentId}</strong></td>
                    <td>${escapeHtml(a.fullName || a.email)}</td>
                    <td>${escapeHtml(a.email)}</td>
                    <td>${escapeHtml(a.department || 'Support')}</td>
                    <td><strong>${a.currentLoad} / ${a.maxCapacity}</strong> (${a.loadPercentage}%)</td>
                    <td>
                        <button onclick="toggleAgentAvailability(${a.agentId})" class="btn btn-secondary btn-sm">
                            ${a.isAvailable ? 'Toggle Offline' : 'Toggle Online'}
                        </button>
                        <button onclick="editAgentCapacity(${a.agentId}, ${a.maxCapacity}, '${escapeHtml(a.department)}', '${escapeHtml(a.specialization)}', ${a.isAvailable})" class="btn btn-primary btn-sm">
                            Edit
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tableBody.innerHTML = '<tr><td colspan="6">Failed to load agent workloads.</td></tr>';
        }
    }

    window.toggleAgentAvailability = async (agentId) => {
        try {
            await apiCall(`/agents/${agentId}/toggle-availability`, { method: 'PUT' });
            alert('Agent status toggled.');
            loadSupervisorAgentsList();
        } catch (err) {
            // error handled in apiCall
        }
    };

    window.editAgentCapacity = (agentId, currentMax, currentDept, currentSpec, currentAvail) => {
        document.getElementById('edit-agent-id').value = agentId;
        document.getElementById('edit-agent-avail').value = currentAvail;
        document.getElementById('edit-agent-dept').value = currentDept || '';
        document.getElementById('edit-agent-spec').value = currentSpec || '';
        document.getElementById('edit-agent-capacity').value = currentMax;

        const modal = document.getElementById('edit-agent-modal');
        if (modal) {
            modal.classList.add('active');
        }
    };

    window.closeEditModal = () => {
        const modal = document.getElementById('edit-agent-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    };

    const editForm = document.getElementById('edit-agent-form');
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const agentId = document.getElementById('edit-agent-id').value;
            const currentAvail = document.getElementById('edit-agent-avail').value;
            const dept = document.getElementById('edit-agent-dept').value;
            const spec = document.getElementById('edit-agent-spec').value;
            const max = document.getElementById('edit-agent-capacity').value;

            try {
                const query = `id=${agentId}&maxCapacity=${max}&isAvailable=${currentAvail}&department=${encodeURIComponent(dept)}&specialization=${encodeURIComponent(spec)}`;
                await apiCall(`/agents/update?${query}`, { method: 'PUT' });
                alert('Agent capacity constraints updated.');
                closeEditModal();
                loadSupervisorAgentsList();
            } catch (err) {
                // error handled in apiCall
            }
        };
    }

    async function loadAgentProfileForm() {
        const detailsContainer = document.getElementById('agent-profile-details');
        if (!detailsContainer) return;

        try {
            const profile = await apiCall('/agents/me');

            if (!profile) {
                const msg = document.getElementById('agent-profile-status-message');
                if (msg) msg.textContent = 'No database profile record found for this agent user.';
                return;
            }

            document.getElementById('display-agent-dept').textContent = profile.department || 'General Support';
            document.getElementById('display-agent-spec').textContent = profile.specialization || 'Technical Support';
            document.getElementById('display-agent-capacity').textContent = `${profile.maxCapacity} Tickets Max`;
            document.getElementById('display-agent-load').textContent = `${profile.currentLoad} / ${profile.maxCapacity}`;

            const statusSpan = document.getElementById('display-agent-status');
            if (statusSpan) {
                if (profile.isAvailable) {
                    statusSpan.innerHTML = '<span class="badge badge-resolved">Online / Available</span>';
                } else {
                    statusSpan.innerHTML = '<span class="badge badge-closed">Offline / Busy</span>';
                }
            }
        } catch (err) {
            // error handled
        }
    }
}

// ==========================================
// 4. ROUTING ASSIGNMENTS CONTROLLER LOGIC
// ==========================================
async function initAssignmentsPage() {
    const user = getUser();
    if (user.role !== 'SUPERVISOR') {
        window.location.href = 'tickets.html';
        return;
    }

    const assignForm = document.getElementById('assign-form');
    const autoForm = document.getElementById('auto-assign-form');
    const unassignForm = document.getElementById('unassign-form');

    if (assignForm) {
        assignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ticketId = document.getElementById('assign-ticket-id').value;
            const agentId = document.getElementById('assign-agent-id').value;

            try {
                await apiCall('/api/assignments', {
                    method: 'POST',
                    body: JSON.stringify({ ticketId, agentId })
                });
                alert('Ticket assigned manually successfully.');
                assignForm.reset();
            } catch (err) {
                // error handled in apiCall
            }
        });
    }

    if (autoForm) {
        autoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ticketId = document.getElementById('auto-ticket-id').value;

            try {
                await apiCall(`/api/assignments/auto-assign/${ticketId}`, {
                    method: 'POST'
                });
                alert('Ticket routed and auto-assigned to the least loaded agent.');
                autoForm.reset();
            } catch (err) {
                // error handled
            }
        });
    }

    if (unassignForm) {
        unassignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ticketId = document.getElementById('unassign-ticket-id').value;

            try {
                await apiCall(`/api/assignments/${ticketId}`, {
                    method: 'DELETE'
                });
                alert('Agent unassigned and ticket reset to Open.');
                unassignForm.reset();
            } catch (err) {
                // error handled
            }
        });
    }
}

// ==========================================
// 5. COMMENTS HISTORY CONTROLLER LOGIC
// ==========================================
async function initCommentsPage() {
    const user = getUser();
    const urlParams = new URLSearchParams(window.location.search);
    const ticketId = urlParams.get('ticketId');

    if (!ticketId) {
        window.location.href = 'tickets.html';
        return;
    }

    const ticketHeader = document.getElementById('comments-ticket-header');
    const commentsList = document.getElementById('comments-list-box');
    const addCommentForm = document.getElementById('add-comment-form');
    const internalCheckbox = document.getElementById('comment-internal-wrapper');

    // Show internal comment selection toggles only for support staff (agents/supervisors)
    if (user.role === 'SUPPORT_AGENT' || user.role === 'SUPERVISOR') {
        if (internalCheckbox) internalCheckbox.classList.remove('hidden');
    }

    async function loadTicketHeader() {
        if (!ticketHeader) return;
        try {
            const ticket = await apiCall(`/api/tickets/${ticketId}`);
            ticketHeader.innerHTML = `
                <h2>Ticket #${ticket.ticketId}: ${escapeHtml(ticket.title)}</h2>
                <p>Status: <span class="badge badge-${ticket.status.toLowerCase().replace('_', '-')}">${ticket.status}</span> | Priority: <span class="badge-priority badge-${ticket.priority.toLowerCase()}">${ticket.priority}</span></p>
                <div style="background:#f3f4f6; padding: 1rem; border-radius: 4px; border:1px solid #e5e7eb;">
                    <strong>Customer Description:</strong><br>${escapeHtml(ticket.description)}
                </div>
            `;
        } catch (err) {
            ticketHeader.innerHTML = '<h2>Failed to load ticket details.</h2>';
        }
    }

    async function loadComments() {
        if (!commentsList) return;
        commentsList.innerHTML = 'Loading comments...';

        try {
            const comments = await apiCall(`/api/tickets/${ticketId}/comments`);
            if (comments.length === 0) {
                commentsList.innerHTML = '<p style="color:#6b7280;">No conversation logs posted yet.</p>';
                return;
            }

            commentsList.innerHTML = comments.map(c => {
                const canDelete = user.role === 'SUPERVISOR' || c.authorName === user.fullName;
                const deleteBtn = canDelete ? `
                    <button onclick="deleteComment(${c.id})" class="btn btn-secondary btn-sm" style="background:transparent; border:none; color:#ef4444; padding:0; cursor:pointer; font-weight:600; margin-left:1rem;">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                ` : '';
                return `
                    <div class="comment-box ${c.isInternal ? 'internal' : ''}">
                        <div class="comment-meta">
                            <span>
                                <span class="comment-author">${escapeHtml(c.authorName)}</span> 
                                (${c.authorRole})
                                ${c.isInternal ? '<strong style="color:#d97706; margin-left:0.5rem;">[INTERNAL NOTE]</strong>' : ''}
                            </span>
                            <span>
                                ${formatDate(c.createdAt)}
                                ${deleteBtn}
                            </span>
                        </div>
                        <div class="comment-body">${escapeHtml(c.content)}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            commentsList.innerHTML = 'Failed to load comments.';
        }
    }

    window.deleteComment = async (commentId) => {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        try {
            await apiCall(`/api/tickets/comments/${commentId}`, {
                method: 'DELETE'
            });
            alert('Comment deleted successfully!');
            loadComments();
        } catch (err) {
            // error handled
        }
    };

    if (addCommentForm) {
        addCommentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('comment-text');
            const isInternalInput = document.getElementById('comment-is-internal');
            const isInternal = isInternalInput ? isInternalInput.checked : false;

            try {
                await apiCall(`/api/tickets/${ticketId}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({ content: text.value, isInternal })
                });
                text.value = '';
                if (isInternalInput) isInternalInput.checked = false;
                loadComments();
            } catch (err) {
                // error handled
            }
        });
    }

    loadTicketHeader();
    loadComments();
}

// Helper Formatters
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
