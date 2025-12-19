// App.js - Frontend logic for HealthyTrack

document.addEventListener('DOMContentLoaded', () => {
  const addForm = document.getElementById('addForm');
  const foodName = document.getElementById('foodName');
  const calories = document.getElementById('calories');
  const protein = document.getElementById('protein');
  const carbs = document.getElementById('carbs');
  const fat = document.getElementById('fat');
  const clearDayBtn = document.getElementById('clearDayBtn');
  const entriesDiv = document.getElementById('entries');

  // Update form input name attributes to match IDs
  foodName.setAttribute('name', 'foodName');
  calories.setAttribute('name', 'calories');
  protein.setAttribute('name', 'protein');
  carbs.setAttribute('name', 'carbs');
  fat.setAttribute('name', 'fat');

  // Handle form submission
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const mealData = {
      name: foodName.value,
      calories: parseFloat(calories.value) || 0,
      protein: parseFloat(protein.value) || 0,
      carbs: parseFloat(carbs.value) || 0,
      fat: parseFloat(fat.value) || 0,
      quantity: '',
      source: 'typed',
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    try {
      const response = await fetch('/api/log_food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mealData)
      });

      // If not logged in, prompt the user to authenticate
      if (response.status === 401) {
        alert('Please log in to save entries.');
        if (typeof showAuthModal === 'function') showAuthModal();
        return;
      }

      const result = await response.json();

      if (result.saved) {
        console.log('Meal logged successfully:', result.record);
        addForm.reset();
        loadDailySummary();
        loadEntries();
      } else {
        console.error('Error saving meal:', result.error);
        alert('Error: ' + (result.error || 'Failed to save meal'));
      }
    } catch (error) {
      console.error('Network error:', error);
      alert('Network error: ' + error.message);
    }
  });

  // Clear day button
  clearDayBtn.addEventListener('click', () => {
    if (confirm('Clear all entries for today?')) {
      // This would need a backend endpoint to clear all meals for the day
      console.log('Clear day clicked');
    }
  });

  // Load and display daily summary
  async function loadDailySummary() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/daily_summary?date=${today}`);
      
      // Handle auth errors gracefully
      if (!response.ok) {
        console.warn('Cannot load summary (auth required)');
        return;
      }

      const result = await response.json();
      const summary = result.summary || { calories: 0, protein: 0, carbs: 0, fat: 0 };

      document.getElementById('sumCal').textContent = Math.round(summary.calories || 0);
      document.getElementById('sumPro').textContent = Math.round(summary.protein || 0);
      document.getElementById('sumCarb').textContent = Math.round(summary.carbs || 0);
      document.getElementById('sumFat').textContent = Math.round(summary.fat || 0);

      // Update progress bars
      const goal = parseFloat(document.getElementById('goalInput').value) || 2000;
      const calPercent = Math.min((summary.calories || 0 / goal) * 100, 100);
      document.getElementById('barCal').style.width = calPercent + '%';
      document.getElementById('barPro').style.width = Math.min(((summary.protein || 0) / 150) * 100, 100) + '%';
      document.getElementById('barCarb').style.width = Math.min(((summary.carbs || 0) / 250) * 100, 100) + '%';
      document.getElementById('barFat').style.width = Math.min(((summary.fat || 0) / 80) * 100, 100) + '%';
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  }

  // Load and display today's entries
  async function loadEntries() {
    try {
      const today = new Date().toISOString().split('T')[0];
      // fetch individual entries for the given date
      const response = await fetch(`/api/get_entries?date=${today}`);
      if (!response.ok) throw new Error('Failed to fetch entries');
      const result = await response.json();
      const list = result.entries || [];

      entriesDiv.innerHTML = '';
      if (!list.length) {
        entriesDiv.innerHTML = '<p class="muted small">No entries yet.</p>';
        return;
      }

      list.forEach(e => {
        const row = document.createElement('div');
        row.className = 'entry';
        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `<strong>${escapeHtml(e.name || '—')}</strong><div class="muted small">${e.created_at || ''}</div>`;
        const right = document.createElement('div');
        right.style.textAlign = 'right';
        right.innerHTML = `${Math.round(e.calories||0)} kcal<br /><span class="muted small">P ${Math.round(e.protein||0)} • C ${Math.round(e.carbs||0)} • F ${Math.round(e.fat||0)}</span>`;
        row.appendChild(left);
        row.appendChild(right);
        entriesDiv.appendChild(row);
      });
    } catch (error) {
      console.error('Error loading entries:', error);
      entriesDiv.innerHTML = '<p class="muted small">Unable to load entries.</p>';
    }
  }

  // small helper to avoid XSS when inserting names
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>\"']/g, function (s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"})[s];
    });
  }

  // Set goal button
  const setGoalBtn = document.getElementById('setGoalBtn');
  setGoalBtn.addEventListener('click', () => {
    alert('Goal set to ' + document.getElementById('goalInput').value + ' calories');
    loadDailySummary();
  });

  // Image upload handling
  const imageInput = document.getElementById('imageInput');
  const previewImg = document.getElementById('previewImg');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearImgBtn = document.getElementById('clearImgBtn');
  const nutritionCard = document.getElementById('nutritionCard');

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        previewImg.src = event.target.result;
        previewImg.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  analyzeBtn.addEventListener('click', async () => {
    if (!imageInput.files[0]) {
      alert('Please select an image first');
      return;
    }

    const formData = new FormData();
    formData.append('photo', imageInput.files[0]);

    try {
      const response = await fetch('/api/upload_photo', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.saved) {
        // Display detected food and nutrition info
        let nutritionHTML = `
          <h4>🍲 Detected Food: ${result.detected_label}</h4>
          <p style="color: #00ff00; margin-bottom: 15px;">Image saved as: ${result.filename}</p>
        `;

        // Display nutrition for each logged meal
        if (result.meals_logged && result.meals_logged.length > 0) {
          nutritionHTML += '<div style="background: rgba(0,255,0,0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;">';
          nutritionHTML += '<h5 style="color: #00ff00; margin-top: 0;">📊 Nutrition (per 100g estimated)</h5>';
          
          result.meals_logged.forEach((meal, idx) => {
            nutritionHTML += `
              <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,255,0,0.3);">
                <p style="margin: 5px 0; font-weight: bold; color: #ffffff;">${meal.name.toUpperCase()}</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <p style="margin: 5px 0;">🔥 Calories: <span style="color: #00ff00; font-weight: bold;">${meal.calories}</span> kcal</p>
                  <p style="margin: 5px 0;">💪 Protein: <span style="color: #00ff00; font-weight: bold;">${meal.protein}</span>g</p>
                  <p style="margin: 5px 0;">🥖 Carbs: <span style="color: #00ff00; font-weight: bold;">${meal.carbs}</span>g</p>
                  <p style="margin: 5px 0;">🧈 Fat: <span style="color: #00ff00; font-weight: bold;">${meal.fat}</span>g</p>
                </div>
              </div>
            `;
          });
          nutritionHTML += '</div>';
        }

        // Display updated daily summary
        if (result.daily_summary) {
          nutritionHTML += '<div style="background: rgba(0,0,255,0.1); padding: 15px; border-radius: 8px;">';
          nutritionHTML += '<h5 style="color: #0099ff; margin-top: 0;">📈 Today\'s Total</h5>';
          nutritionHTML += `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <p style="margin: 5px 0;">Total Calories: <span style="color: #0099ff; font-weight: bold;">${Math.round(result.daily_summary.calories)}</span> kcal</p>
              <p style="margin: 5px 0;">Total Protein: <span style="color: #0099ff; font-weight: bold;">${Math.round(result.daily_summary.protein)}</span>g</p>
              <p style="margin: 5px 0;">Total Carbs: <span style="color: #0099ff; font-weight: bold;">${Math.round(result.daily_summary.carbs)}</span>g</p>
              <p style="margin: 5px 0;">Total Fat: <span style="color: #0099ff; font-weight: bold;">${Math.round(result.daily_summary.fat)}</span>g</p>
            </div>
          `;
          nutritionHTML += '</div>';
        }

        nutritionCard.innerHTML = nutritionHTML;
        
        // Update the tracker automatically
        loadDailySummary();
        loadEntries();
      } else {
        alert('Error: ' + (result.error || 'Failed to analyze image'));
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image');
    }
  });

  clearImgBtn.addEventListener('click', () => {
    imageInput.value = '';
    previewImg.src = '';
    previewImg.style.display = 'none';
    nutritionCard.innerHTML = '<p class="muted small">No card yet. Upload an image or select a dish.</p>';
  });

  // Quiz functionality
  const startQuizBtn = document.getElementById('startQuiz');
  const retakeQBtn = document.getElementById('retakeQ');
  const quizIntro = document.getElementById('quizIntro');
  const quizQ = document.getElementById('quizQ');
  const quizResult = document.getElementById('quizResult');
  const qText = document.getElementById('qText');
  const qOpts = document.getElementById('qOpts');
  const nextQBtn = document.getElementById('nextQ');
  const quitQBtn = document.getElementById('quitQ');
  const scoreText = document.getElementById('scoreText');

  const quizQuestions = [
    {
      q: 'How many calories are in 1 gram of protein?',
      opts: ['2', '4', '9', '7'],
      correct: 1
    },
    {
      q: 'Which nutrient is most important for muscle recovery?',
      opts: ['Carbs', 'Protein', 'Fat', 'Water'],
      correct: 1
    },
    {
      q: 'What is the recommended daily fiber intake?',
      opts: ['10g', '25-35g', '50g', '100g'],
      correct: 1
    },
    {
      q: 'Which vitamin is produced by sunlight exposure?',
      opts: ['Vitamin A', 'Vitamin B12', 'Vitamin D', 'Vitamin K'],
      correct: 2
    },
    {
      q: 'How many calories are in 1 gram of fat?',
      opts: ['2', '4', '7', '9'],
      correct: 3
    },
    {
      q: 'What is the recommended daily water intake?',
      opts: ['2 cups', '4 cups', '8 cups', '16 cups'],
      correct: 2
    },
    {
      q: 'Which is a complete protein?',
      opts: ['Lentils', 'Beans', 'Eggs', 'Nuts'],
      correct: 2
    },
    {
      q: 'What percentage of calories should come from carbs?',
      opts: ['10-20%', '30-40%', '45-65%', '70-80%'],
      correct: 2
    },
    {
      q: 'Which mineral is important for bone health?',
      opts: ['Iron', 'Calcium', 'Zinc', 'Magnesium'],
      correct: 1
    },
    {
      q: 'How long does digestion typically take?',
      opts: ['1 hour', '2-4 hours', '8 hours', '24 hours'],
      correct: 1
    }
  ];

  let currentQuestion = 0;
  let score = 0;
  let selectedAnswer = null;

  startQuizBtn.addEventListener('click', startQuiz);
  retakeQBtn.addEventListener('click', startQuiz);
  nextQBtn.addEventListener('click', nextQuestion);
  quitQBtn.addEventListener('click', quitQuiz);

  function startQuiz() {
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;
    quizIntro.hidden = true;
    quizResult.hidden = true;
    quizQ.hidden = false;
    showQuestion();
  }

  function showQuestion() {
    const question = quizQuestions[currentQuestion];
    qText.textContent = question.q;
    qOpts.innerHTML = '';
    selectedAnswer = null;

    question.opts.forEach((opt, idx) => {
      const label = document.createElement('label');
      label.className = 'quiz-option';
      label.innerHTML = `
        <input type="radio" name="answer" value="${idx}" />
        <span>${opt}</span>
      `;
      label.addEventListener('change', () => {
        selectedAnswer = idx;
      });
      qOpts.appendChild(label);
    });
  }

  function nextQuestion() {
    if (selectedAnswer === null) {
      alert('Please select an answer');
      return;
    }

    const question = quizQuestions[currentQuestion];
    if (selectedAnswer === question.correct) {
      score++;
    }

    currentQuestion++;
    if (currentQuestion < quizQuestions.length) {
      showQuestion();
    } else {
      endQuiz();
    }
  }

  function quitQuiz() {
    quizQ.hidden = true;
    quizIntro.hidden = false;
  }

  function endQuiz() {
    quizQ.hidden = true;
    quizResult.hidden = false;
    scoreText.textContent = `You scored ${score} out of ${quizQuestions.length} (${Math.round((score / quizQuestions.length) * 100)}%)`;
  }

  // Menu toggle
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.querySelector('.nav');
  menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
  });

  // Set footer year
  document.getElementById('year').textContent = new Date().getFullYear();

  // ====== CHATBOT FUNCTIONALITY ======
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatHistory = document.getElementById('chatHistory');
  const chatToggle = document.getElementById('chatbotToggle');
  const quickButtons = document.querySelectorAll('[id^="chatQuick"]');

  // Clear initial message when user starts chatting
  let chatStarted = false;

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query');
      chatInput.value = query;
      sendChatMessage();
    });
  });

  async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Clear initial message on first chat
    if (!chatStarted) {
      chatHistory.innerHTML = '';
      chatStarted = true;
    }

    // Display user message
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'background: #e3f2fd; padding: 10px; border-radius: 6px; margin-bottom: 10px; text-align: right; color: #1976d2;';
    userMsg.textContent = '👤 You: ' + message;
    chatHistory.appendChild(userMsg);

    // Clear input
    chatInput.value = '';
    chatSendBtn.disabled = true;
    chatSendBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/fitness_chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: message })
      });

      if (response.ok) {
        const result = await response.json();
        const botMsg = document.createElement('div');
        botMsg.style.cssText = 'background: #f0f7ff; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #ff3cac;';
        botMsg.innerHTML = '🤖 Coach: ' + result.response;
        chatHistory.appendChild(botMsg);
        
        // Auto-scroll to bottom
        chatHistory.scrollTop = chatHistory.scrollHeight;
      } else {
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'background: #ffebee; padding: 10px; border-radius: 6px; margin-bottom: 10px; color: #c62828;';
        errorMsg.textContent = '❌ Error: ' + (await response.text() || 'Failed to get response');
        chatHistory.appendChild(errorMsg);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = 'background: #ffebee; padding: 10px; border-radius: 6px; margin-bottom: 10px; color: #c62828;';
      errorMsg.textContent = '❌ Network error: ' + error.message;
      chatHistory.appendChild(errorMsg);
    } finally {
      chatSendBtn.disabled = false;
      chatSendBtn.textContent = 'Send';
    }
  }

  // Scroll to chatbot when toggling
  chatToggle.addEventListener('click', () => {
    document.getElementById('chatbot').scrollIntoView({ behavior: 'smooth' });
  });

  // Initial load
  loadDailySummary();
  loadEntries();
});
