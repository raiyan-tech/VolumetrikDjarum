/**
 * Volumetrik Admin Console
 * Admin-only dashboard for viewing users and analytics
 */

import {
  initAuthGuard,
  signOutUser,
  isUserAdmin,
  getCurrentUser
} from '../auth.js';

import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Get Firestore instance
import { db } from '../auth.js';

// ============================================================================
// AUTHENTICATION CHECK
// ============================================================================

// Check if user is authenticated AND is an admin
initAuthGuard('/login.html', async (user) => {
  console.log('[Admin] User authenticated:', user.email);

  // Check if user is admin
  const isAdmin = await isUserAdmin(user.email);

  if (!isAdmin) {
    alert('Access Denied: You do not have admin privileges.');
    window.location.href = '/index.html';
    return;
  }

  console.log('[Admin] Admin access granted:', user.email);

  // Update UI with admin email
  const adminEmailEl = document.getElementById('admin-email');
  if (adminEmailEl) {
    adminEmailEl.textContent = user.email;
  }

  // Load dashboard data
  loadDashboardData();
});

// ============================================================================
// SIGN OUT
// ============================================================================

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to sign out?')) {
    try {
      await signOutUser();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('[Admin] Sign-out error:', error);
      alert('Failed to sign out. Please try again.');
    }
  }
});

// ============================================================================
// DASHBOARD DATA
// ============================================================================

let allUsers = [];
let filteredUsers = [];

async function loadDashboardData() {
  try {
    showLoading(true);
    hideError();

    // Fetch all users
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    allUsers = [];
    querySnapshot.forEach((doc) => {
      allUsers.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log('[Admin] Loaded', allUsers.length, 'users');

    // Calculate statistics
    calculateStats();

    // Display users
    filteredUsers = [...allUsers];
    displayUsers(filteredUsers);

    showLoading(false);
  } catch (error) {
    console.error('[Admin] Failed to load dashboard data:', error);
    showError('Failed to load dashboard data. Please check your Firebase configuration and security rules.');
    showLoading(false);
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

function calculateStats() {
  const now = Date.now();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
  const twoMonthsAgo = now - (60 * 24 * 60 * 60 * 1000);

  // Total users
  const totalUsers = allUsers.length;

  // New this month
  const newThisMonth = allUsers.filter(user => {
    const createdAt = user.createdAt?.toMillis ? user.createdAt.toMillis() : 0;
    return createdAt >= oneMonthAgo;
  }).length;

  // New last month (for comparison)
  const newLastMonth = allUsers.filter(user => {
    const createdAt = user.createdAt?.toMillis ? user.createdAt.toMillis() : 0;
    return createdAt >= twoMonthsAgo && createdAt < oneMonthAgo;
  }).length;

  // Calculate month-over-month change
  const monthChange = newLastMonth > 0
    ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
    : 100;

  // Active this week (users who logged in within last 7 days)
  const activeThisWeek = allUsers.filter(user => {
    const lastLogin = user.lastLogin?.toMillis ? user.lastLogin.toMillis() : 0;
    return lastLogin >= oneWeekAgo;
  }).length;

  // Total logins
  const totalLogins = allUsers.reduce((sum, user) => sum + (user.totalLogins || 0), 0);

  // Update UI
  document.getElementById('total-users').textContent = totalUsers.toLocaleString();
  document.getElementById('new-this-month').textContent = newThisMonth.toLocaleString();
  document.getElementById('active-this-week').textContent = activeThisWeek.toLocaleString();
  document.getElementById('total-logins').textContent = totalLogins.toLocaleString();

  // Update month change
  const monthChangeEl = document.getElementById('month-change');
  if (monthChange > 0) {
    monthChangeEl.textContent = `+${monthChange}%`;
    monthChangeEl.parentElement.classList.add('positive');
    monthChangeEl.parentElement.classList.remove('neutral');
  } else if (monthChange < 0) {
    monthChangeEl.textContent = `${monthChange}%`;
    monthChangeEl.parentElement.classList.remove('positive');
    monthChangeEl.parentElement.classList.add('neutral');
  } else {
    monthChangeEl.textContent = '0%';
    monthChangeEl.parentElement.classList.remove('positive');
    monthChangeEl.parentElement.classList.add('neutral');
  }
}

// ============================================================================
// DISPLAY USERS
// ============================================================================

function displayUsers(users) {
  const tbody = document.getElementById('users-tbody');
  const emptyState = document.getElementById('empty-state');

  if (users.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  tbody.innerHTML = users.map(user => {
    const avatar = user.photoURL
      ? `<img src="${user.photoURL}" alt="${user.displayName}">`
      : (user.displayName ? user.displayName[0].toUpperCase() : '👤');

    const joinedDate = user.createdAt?.toDate
      ? formatDate(user.createdAt.toDate())
      : 'Unknown';

    const lastLogin = user.lastLogin?.toDate
      ? formatDate(user.lastLogin.toDate())
      : 'Never';

    const totalLogins = user.totalLogins || 0;
    const videosWatched = user.videosWatched?.length || 0;

    return `
      <tr data-user-id="${user.id}">
        <td>
          <div class="user-cell">
            <div class="user-avatar">${avatar}</div>
            <div class="user-info">
              <div class="user-name">${user.displayName || 'Unknown User'}</div>
              <div class="user-email">${user.email || 'No email'}</div>
            </div>
          </div>
        </td>
        <td>${joinedDate}</td>
        <td>${lastLogin}</td>
        <td>${totalLogins}</td>
        <td>${videosWatched}</td>
      </tr>
    `;
  }).join('');

  // Add click listeners to rows
  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => {
      const userId = row.dataset.userId;
      showUserDetails(userId);
    });
  });
}

// ============================================================================
// SEARCH
// ============================================================================

document.getElementById('search-bar').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();

  if (searchTerm === '') {
    filteredUsers = [...allUsers];
  } else {
    filteredUsers = allUsers.filter(user => {
      const name = (user.displayName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      return name.includes(searchTerm) || email.includes(searchTerm);
    });
  }

  displayUsers(filteredUsers);
});

// ============================================================================
// EXPORT TO CSV
// ============================================================================

document.getElementById('export-btn').addEventListener('click', () => {
  try {
    // Create CSV content
    const csvRows = [];

    // Header
    csvRows.push(['Name', 'Email', 'Joined', 'Last Login', 'Total Logins', 'Videos Watched'].join(','));

    // Data
    allUsers.forEach(user => {
      const name = (user.displayName || 'Unknown').replace(/,/g, ' ');
      const email = user.email || 'No email';
      const joined = user.createdAt?.toDate ? user.createdAt.toDate().toISOString().split('T')[0] : 'Unknown';
      const lastLogin = user.lastLogin?.toDate ? user.lastLogin.toDate().toISOString().split('T')[0] : 'Never';
      const totalLogins = user.totalLogins || 0;
      const videosWatched = user.videosWatched?.length || 0;

      csvRows.push([name, email, joined, lastLogin, totalLogins, videosWatched].join(','));
    });

    const csvContent = csvRows.join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `volumetrik-users-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('[Admin] Exported', allUsers.length, 'users to CSV');
  } catch (error) {
    console.error('[Admin] Failed to export CSV:', error);
    alert('Failed to export CSV. Please try again.');
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

function showUserDetails(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  // Format user details
  const joinedDate = user.createdAt?.toDate
    ? user.createdAt.toDate().toLocaleString()
    : 'Unknown';

  const lastLoginDate = user.lastLogin?.toDate
    ? user.lastLogin.toDate().toLocaleString()
    : 'Never';

  const videosWatched = user.videosWatched?.join(', ') || 'None';

  const details = `
User Details:

Name: ${user.displayName || 'Unknown'}
Email: ${user.email || 'No email'}
User ID: ${user.uid}

Joined: ${joinedDate}
Last Login: ${lastLoginDate}
Total Logins: ${user.totalLogins || 0}

Videos Watched: ${videosWatched}

Preferences:
  Volume: ${user.preferences?.volume || 1.0}
  Quality: ${user.preferences?.quality || 'auto'}
  `;

  alert(details);
}

function showLoading(show) {
  const loadingEl = document.getElementById('loading-state');
  if (loadingEl) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
  }
}

function hideError() {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.classList.remove('show');
  }
}
