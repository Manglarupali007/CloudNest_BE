// Global variables
let currentUser = null;
let currentFilter = 'all';
let currentSort = 'newest';
let currentFiles = [];
let shareFileId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // Enter key for search
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchFiles();
    });
}

// ========== AUTHENTICATION ==========
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        showModal('loginModal');
        return;
    }
    
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUI();
            loadFiles();
            loadStats();
            closeModal('loginModal');
        } else {
            localStorage.removeItem('token');
            showModal('loginModal');
        }
    } catch (err) {
        console.error(err);
        showModal('loginModal');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            updateUI();
            loadFiles();
            loadStats();
            closeModal('loginModal');
            showToast('Welcome back, ' + currentUser.name + '!', 'success');
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Login failed', 'error');
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    showModal('loginModal');
    showToast('Logged out successfully', 'success');
}

// ========== FILE MANAGEMENT ==========
async function uploadFile(input) {
    if (!currentUser) {
        showModal('loginModal');
        return;
    }
    
    const file = input.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('token');
    
    try {
        showToast('Uploading...', 'info');
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('File uploaded successfully!', 'success');
            loadFiles();
            loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Upload failed', 'error');
    }
    
    input.value = '';
}

async function loadFiles() {
    if (!currentUser) return;
    
    const token = localStorage.getItem('token');
    const searchTerm = document.getElementById('searchInput')?.value || '';
    let url = `/api/files/my-files?search=${searchTerm}`;
    
    if (currentFilter !== 'all') {
        url += `&type=${currentFilter}`;
    }
    
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            currentFiles = data.files;
            sortAndDisplayFiles();
        }
    } catch (err) {
        console.error(err);
    }
}

function sortAndDisplayFiles() {
    let files = [...currentFiles];
    
    switch(currentSort) {
        case 'newest':
            files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            files.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'name':
            files.sort((a, b) => a.originalName.localeCompare(b.originalName));
            break;
        case 'size':
            files.sort((a, b) => b.size - a.size);
            break;
    }
    
    displayFiles(files);
}

function displayFiles(files) {
    const grid = document.getElementById('fileGrid');
    
    if (!files || files.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-upload-alt"></i>
                <h3>No files found</h3>
                <p>Upload your first file or try a different search</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = files.map(file => {
        const fileId = String(file.id || file._id);
        return `
        <div class="file-card" data-file-id="${fileId}">
            <div class="file-actions">
                <button class="file-action-btn favourite-btn ${file.isFavourite ? 'active' : ''}" onclick="toggleFavourite('${fileId}')">
                    <i class="fas ${file.isFavourite ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
                </button>
                <button class="file-action-btn" onclick="openShareModal('${fileId}')">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="file-action-btn" onclick="deleteFile('${fileId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="file-icon ${getFileIconClass(file.mimeType)}">
                <i class="${getFileIcon(file.mimeType)}"></i>
            </div>
            <div class="file-name">${escapeHtml(file.originalName)}</div>
            <div class="file-meta">
                ${formatFileSize(file.size)} • ${formatDate(file.createdAt)}
                ${file.downloads > 0 ? ` • ${file.downloads} downloads` : ''}
            </div>
        </div>
    `).join('');
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('File deleted', 'success');
            loadFiles();
            loadStats();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Delete failed', 'error');
    }
}

async function toggleFavourite(fileId) {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch(`/api/files/${fileId}/favourite`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            loadFiles();
        }
    } catch (err) {
        showToast('Failed to update favourite', 'error');
    }
}

async function openShareModal(fileId) {
    shareFileId = fileId;
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch(`/api/files/${fileId}/share`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('shareLink').value = data.shareLink;
            showModal('shareModal');
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Failed to generate share link', 'error');
    }
}

function copyShareLink() {
    const linkInput = document.getElementById('shareLink');
    linkInput.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard!', 'success');
}

// ========== STATISTICS ==========
async function loadStats() {
    if (!currentUser) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch('/api/analytics/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            const stats = data.stats;
            document.getElementById('totalFiles').innerText = stats.totalFiles;
            document.getElementById('totalDownloads').innerText = stats.totalDownloads || 0;
            document.getElementById('sharedFiles').innerText = stats.sharedFiles || 0;
            
            const percentage = (stats.storageUsed / stats.storageLimit) * 100;
            document.getElementById('storageProgress').style.width = percentage + '%';
            document.getElementById('storageText').innerHTML = `${formatFileSize(stats.storageUsed)} / ${formatFileSize(stats.storageLimit)}`;
        }
    } catch (err) {
        console.error(err);
    }
}

// ========== UI HELPERS ==========
function updateUI() {
    if (currentUser) {
        const userMenu = document.getElementById('userMenu');
        userMenu.innerHTML = `
            <div class="user-avatar" onclick="toggleUserMenu()">
                <i class="fas fa-user"></i>
            </div>
            <div class="dropdown-menu" id="userDropdown" style="display: none;">
                <a href="#" onclick="showProfile()">Profile</a>
                <a href="#" onclick="logout()">Logout</a>
            </div>
        `;
    }
}

function filterFiles(type) {
    currentFilter = type;
    
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.innerText.toLowerCase().includes(type) || 
            (type === 'all' && tab.innerText === 'All Files')) {
            tab.classList.add('active');
        }
    });
    
    loadFiles();
}

function sortFiles() {
    currentSort = document.getElementById('sortSelect').value;
    sortAndDisplayFiles();
}

function searchFiles() {
    loadFiles();
}

function showSection(section) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.target.closest('.nav-link').classList.add('active');
    
    if (section === 'favourites') {
        loadFavourites();
    } else if (section === 'recent') {
        loadRecent();
    } else {
        currentFilter = 'all';
        loadFiles();
    }
}

async function showAnalytics() {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch('/api/analytics/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            const stats = data.stats;
            const modalContent = `
                <div class="modal-header">
                    <h3>Storage Analytics</h3>
                    <button class="modal-close" onclick="closeModal('analyticsModal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${stats.totalFiles}</div>
                            <div class="stat-label">Total Files</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${formatFileSize(stats.storageUsed)}</div>
                            <div class="stat-label">Storage Used</div>
                        </div>
                    </div>
                    <h4>File Distribution</h4>
                    ${stats.fileTypes?.map(type => `
                        <p>${type._id}: ${type.count} files (${formatFileSize(type.size)})</p>
                    `).join('') || '<p>No data available</p>'}
                </div>
            `;
            
            showDynamicModal('Analytics', modalContent);
        }
    } catch (err) {
        showToast('Failed to load analytics', 'error');
    }
}

// ========== MODAL FUNCTIONS ==========
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showDynamicModal(title, content) {
    const modalHtml = `
        <div class="modal" id="dynamicModal">
            <div class="modal-content">
                ${content}
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('dynamicModal').style.display = 'flex';
    
    document.getElementById('dynamicModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('dynamicModal')) {
            document.getElementById('dynamicModal').remove();
        }
    });
}

// ========== TOAST NOTIFICATION ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ========== UTILITY FUNCTIONS ==========
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
}

function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'fas fa-image';
    if (mimeType === 'application/pdf') return 'fas fa-file-pdf';
    if (mimeType.includes('word')) return 'fas fa-file-word';
    if (mimeType.includes('excel')) return 'fas fa-file-excel';
    if (mimeType.startsWith('video/')) return 'fas fa-video';
    if (mimeType.startsWith('audio/')) return 'fas fa-music';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'fas fa-file-archive';
    return 'fas fa-file-alt';
}

function getFileIconClass(mimeType) {
    if (mimeType.startsWith('image/')) return 'file-type-image';
    if (mimeType === 'application/pdf') return 'file-type-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'file-type-doc';
    if (mimeType.startsWith('video/')) return 'file-type-video';
    if (mimeType.startsWith('audio/')) return 'file-type-audio';
    if (mimeType.includes('zip')) return 'file-type-zip';
    return 'file-type-other';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Toggle functions
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function showProfile() {
    showToast('Profile feature coming soon!', 'info');
}

function showTools() {
    showToast('AI Search & Tools coming soon!', 'info');
}

function showSettings() {
    showToast('Settings feature coming soon!', 'info');
}

function showRegister() {
    closeModal('loginModal');
    showToast('Registration feature coming soon!', 'info');
}