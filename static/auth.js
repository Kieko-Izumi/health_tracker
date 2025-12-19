// Authentication module for HealthyTrack

let currentUser = null;

// Check if user is logged in on page load
async function checkCurrentUser() {
  try {
    const response = await fetch('/api/current_user');
    if (response.ok) {
      const data = await response.json();
      if (data.user_id) {
        currentUser = data;
        showMainApp();
        return true;
      }
    }
  } catch (error) {
    console.error('Error checking user:', error);
  }
  showAuthModal();
  return false;
}

function showAuthModal() {
  const authModal = document.getElementById('authModal');
  const mainContainer = document.querySelector('main');
  if (authModal) authModal.hidden = false;
  if (mainContainer) mainContainer.style.display = 'none';
}

function showMainApp() {
  const authModal = document.getElementById('authModal');
  const mainContainer = document.querySelector('main');
  if (authModal) authModal.hidden = true;
  if (mainContainer) mainContainer.style.display = 'block';
  
  // Update auth controls
  const authControls = document.getElementById('authControls');
  if (authControls) {
    authControls.innerHTML = `
      <span style="color: #00ff00; margin-right: 15px;">👤 ${currentUser.username}</span>
      <button id="logoutBtn" class="btn ghost" style="padding: 5px 10px; font-size: 0.9em;">Logout</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
  }

  // Load data after auth succeeds
  if (typeof loadDailySummary === 'function') loadDailySummary();
  if (typeof loadEntries === 'function') loadEntries();
}

async function signup() {
  const username = document.getElementById('authUser').value.trim();
  const password = document.getElementById('authPass').value.trim();
  
  if (!username || !password) {
    alert('Please enter username and password');
    return;
  }
  
  if (password.length < 4) {
    alert('Password must be at least 4 characters');
    return;
  }
  
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentUser = { user_id: result.user_id, username: result.username };
      alert('Account created successfully!');
      showMainApp();
      document.getElementById('authForm').reset();
    } else {
      alert('Error: ' + (result.error || 'Signup failed'));
    }
  } catch (error) {
    console.error('Signup error:', error);
    alert('Network error during signup');
  }
}

async function login() {
  const username = document.getElementById('authUser').value.trim();
  const password = document.getElementById('authPass').value.trim();
  
  if (!username || !password) {
    alert('Please enter username and password');
    return;
  }
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentUser = { user_id: result.user_id, username: result.username };
      alert('Login successful!');
      showMainApp();
      document.getElementById('authForm').reset();
    } else {
      alert('Error: ' + (result.error || 'Login failed'));
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Network error during login');
  }
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    document.getElementById('authForm').reset();
    showAuthModal();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Setup auth modal handlers
document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('authForm');
  const authSubmit = document.getElementById('authSubmit');
  const switchMode = document.getElementById('switchMode');
  const authTitle = document.getElementById('authTitle');
  
  let isLoginMode = true;
  
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (isLoginMode) {
        login();
      } else {
        signup();
      }
    });
  }
  
  if (switchMode) {
    switchMode.addEventListener('click', () => {
      isLoginMode = !isLoginMode;
      if (authTitle) authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
      if (authSubmit) authSubmit.textContent = isLoginMode ? 'Login' : 'Sign Up';
      if (switchMode) switchMode.textContent = isLoginMode ? 'Switch to Sign up' : 'Switch to Login';
    });
  }
  
  // Check user on load
  checkCurrentUser();
});
