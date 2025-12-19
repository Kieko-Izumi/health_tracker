# Project:health-Tracker - Flask backend + index.html

# -------------------------
# app.py
# -------------------------
from flask import Flask, request, jsonify, render_template, send_from_directory, session
import sqlite3
import os
from datetime import datetime
from werkzeug.utils import secure_filename
import requests 
import hashlib 

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

USDA_API_KEY = "BjcCpqm3bQcPdat2SL2QzBJctgGGGlTXqIljPdAg"
IMAGGA_API_KEY = "acc_e3ae73480254add"
IMAGGA_API_SECRET = "cbf19460607f9ed71d3590d94167b86b"
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')

# -------------------------
# Database helpers
# -------------------------

def init_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    
    # Create users table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Drop and recreate meals table to ensure correct schema with user_id
    cur.execute('DROP TABLE IF EXISTS meals')
    
    # Create meals table
    cur.execute('''
        CREATE TABLE meals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            calories REAL,
            protein REAL,
            carbs REAL,
            fat REAL,
            quantity TEXT,
            source TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    con.commit()
    con.close()


def insert_meal(meal, user_id):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute('''
        INSERT INTO meals (user_id, name, calories, protein, carbs, fat, quantity, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id,
        meal.get('name'), meal.get('calories'), meal.get('protein'), meal.get('carbs'),
        meal.get('fat'), meal.get('quantity'), meal.get('source'), meal.get('created_at')
    ))
    con.commit()
    con.close()


def get_daily_summary(user_id, date_str=None):
    if date_str is None:
        date_str = datetime.now().strftime('%Y-%m-%d')
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT SUM(coalesce(calories,0)), SUM(coalesce(protein,0)), SUM(coalesce(carbs,0)), SUM(coalesce(fat,0)) FROM meals WHERE user_id = ? AND created_at LIKE ?", (user_id, date_str + '%',))
    row = cur.fetchone()
    con.close()
    return {
        'calories': row[0] or 0,
        'protein': row[1] or 0,
        'carbs': row[2] or 0,
        'fat': row[3] or 0
    }


# -------------------------
# Utility functions
# -------------------------

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def hash_password(password):
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def create_user(username, password):
    """Create new user in database"""
    try:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        hashed_pwd = hash_password(password)
        cur.execute(
            'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)',
            (username, hashed_pwd, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        )
        con.commit()
        user_id = cur.lastrowid
        con.close()
        return user_id
    except sqlite3.IntegrityError:
        return None


def verify_user(username, password):
    """Verify user credentials and return user_id"""
    try:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        hashed_pwd = hash_password(password)
        cur.execute('SELECT id FROM users WHERE username = ? AND password = ?', (username, hashed_pwd))
        result = cur.fetchone()
        con.close()
        return result[0] if result else None
    except:
        return None


# -------------------------
# Routes
# -------------------------

@app.route('/api/signup', methods=['POST'])
def signup():
    """Register new user"""
    data = request.get_json(force=True)
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    
    user_id = create_user(username, password)
    
    if not user_id:
        return jsonify({'error': 'Username already exists'}), 400
    
    session['user_id'] = user_id
    session['username'] = username
    
    return jsonify({'success': True, 'user_id': user_id, 'username': username})


@app.route('/api/login', methods=['POST'])
def login():
    """Login user"""
    data = request.get_json(force=True)
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    user_id = verify_user(username, password)
    
    if not user_id:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    session['user_id'] = user_id
    session['username'] = username
    
    return jsonify({'success': True, 'user_id': user_id, 'username': username})


@app.route('/api/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.clear()
    return jsonify({'success': True})


@app.route('/api/current_user', methods=['GET'])
def current_user():
    """Get current logged in user"""
    if 'user_id' in session:
        return jsonify({'user_id': session['user_id'], 'username': session['username']})
    return jsonify({'user_id': None}), 401

@app.route('/')
def index():
    # Renders templates/start.html as landing page
    return render_template('start.html')


@app.route('/app')
def app_page():
    # Renders templates/index.html as main app
    return render_template('index.html')


@app.route('/charts')
@app.route('/charts.html')
def charts_page():
    # Render charts template
    return render_template('charts.html')


@app.route('/api/log_food', methods=['POST'])
def log_food():
    """Accepts JSON or form data: { name, quantity (optional), source (typed/photo/voice) }
    Requires user to be logged in
    """
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401
    
    user_id = session['user_id']
    
    # Handle both JSON and form data submissions
    if request.is_json:
        data = request.get_json(force=True)
    else:
        data = request.form

    # Read submitted values using request.get (for form data) or dict.get (for JSON)
    name = data.get('name') or data.get('foodName')
    if not name:
        return jsonify({'error': 'Missing `name` or `foodName` in request body.'}), 400

    quantity = data.get('quantity', '')
    source = data.get('source', 'typed')
    calories = data.get('calories')
    protein = data.get('protein')
    carbs = data.get('carbs')
    fat = data.get('fat')

    # If nutrition values not provided, call USDA API
    if not all([calories, protein, carbs, fat]):
        nutrition = query_edamam_for_nutrition(name)
    else:
        nutrition = {
            'calories': float(calories) if calories else None,
            'protein': float(protein) if protein else None,
            'carbs': float(carbs) if carbs else None,
            'fat': float(fat) if fat else None
        }

    record = {
        'name': name,
        'calories': nutrition.get('calories'),
        'protein': nutrition.get('protein'),
        'carbs': nutrition.get('carbs'),
        'fat': nutrition.get('fat'),
        'quantity': quantity,
        'source': source,
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

    insert_meal(record, user_id)
    return jsonify({'saved': True, 'record': record})


@app.route('/api/daily_summary', methods=['GET'])
def daily_summary():
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401
    
    user_id = session['user_id']
    date = request.args.get('date')  # format YYYY-MM-DD
    summary = get_daily_summary(user_id, date)
    return jsonify({'date': date or datetime.now().strftime('%Y-%m-%d'), 'summary': summary})


@app.route('/api/upload_photo', methods=['POST'])
def upload_photo():
    # Check if user is logged in
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401
    
    user_id = session['user_id']
    
    # Accepts file under 'photo'
    if 'photo' not in request.files:
        return jsonify({'error': 'No photo part'}), 400
    file = request.files['photo']
    if not file or not file.filename or file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed. Use PNG, JPG, or JPEG'}), 400
    
    try:
        filename = secure_filename(file.filename)
        # Add timestamp to avoid filename collisions
        filename = f"{int(datetime.now().timestamp())}_{filename}"
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)
        
        # Call image recognition API to detect food label(s)
        detected_label = image_recognition_placeholder(save_path)
        
        # Check for API errors
        if 'Error' in detected_label or 'error' in detected_label.lower():
            return jsonify({
                'saved': False,
                'error': detected_label,
                'filename': filename
            }), 400
        
        # Automatically fetch nutrition for detected food and log to tracker
        foods = [f.strip() for f in detected_label.split(',') if f.strip()]
        meals_logged = []
        
        for food in foods:
            if food and food.lower() != 'unknown food':
                try:
                    # Get nutrition data from USDA API
                    nutrition = query_edamam_for_nutrition(food)
                    
                    # Create meal record
                    record = {
                        'name': food,
                        'calories': nutrition.get('calories'),
                        'protein': nutrition.get('protein'),
                        'carbs': nutrition.get('carbs'),
                        'fat': nutrition.get('fat'),
                        'quantity': '100g (estimated)',
                        'source': 'photo',
                        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }
                    
                    # Insert into database
                    insert_meal(record, user_id)
                    meals_logged.append(record)
                except Exception as e:
                    print(f'Error processing food {food}: {e}')
                    continue
        
        return jsonify({
            'saved': True, 
            'filename': filename, 
            'detected_label': detected_label,
            'meals_logged': meals_logged,
            'daily_summary': get_daily_summary(user_id)
        })
    except Exception as e:
        print(f'Upload error: {e}')
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/get_entries', methods=['GET'])
def get_entries():
    """Get meal entries for a specific date"""
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401
    
    user_id = session['user_id']
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute('''
        SELECT id, name, calories, protein, carbs, fat, quantity, source, created_at 
        FROM meals 
        WHERE user_id = ? AND created_at LIKE ? 
        ORDER BY created_at DESC
    ''', (user_id, date_str + '%'))
    
    rows = cur.fetchall()
    con.close()
    
    entries = []
    for row in rows:
        entries.append({
            'id': row[0],
            'name': row[1],
            'calories': row[2],
            'protein': row[3],
            'carbs': row[4],
            'fat': row[5],
            'quantity': row[6],
            'source': row[7],
            'created_at': row[8]
        })
    
    return jsonify({'entries': entries})


@app.route('/api/fitness_chat', methods=['POST'])
def fitness_chat():
    """Chatbot endpoint for fitness advice"""
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401
    
    data = request.get_json(force=True)
    user_message = data.get('message', '').strip()
    
    if not user_message:
        return jsonify({'error': 'Message is required'}), 400
    
    # Get user's daily summary for context
    user_id = session['user_id']
    daily_summary = get_daily_summary(user_id)
    
    # Use a simple rule-based chatbot or API
    response = generate_fitness_advice(user_message, daily_summary)
    
    return jsonify({'response': response})


# -------------------------
# External API placeholders
# -------------------------

def query_edamam_for_nutrition(food_text):
    """
    Use USDA FoodData Central API to get nutrition values.
    Free API - get key from https://fdc.nal.usda.gov/api-key-signup.html
    
    Example request:
    GET https://api.nal.usda.gov/fdc/v1/foods/search?query={food}&pageSize=1&api_key={API_KEY}
    """
    import requests
    
    url = 'https://api.nal.usda.gov/fdc/v1/foods/search'
    params = {
        'query': food_text,
        'pageSize': 1,
        'api_key': USDA_API_KEY
    }
    
    try:
        r = requests.get(url, params=params, timeout=8)
        data = r.json()
        
        if data.get('foods') and len(data['foods']) > 0:
            food = data['foods'][0]
            nutrients = {n['nutrientName']: n.get('value', 0) for n in food.get('foodNutrients', [])}
            
            # Extract key nutrients (values are typically per 100g)
            calories = nutrients.get('Energy', 0)
            # Convert from kJ to kcal if needed (Energy is usually in kJ)
            if calories > 50:  # Likely in kJ
                calories = calories / 4.184
            
            protein = nutrients.get('Protein', 0)
            carbs = nutrients.get('Carbohydrate, by difference', 0)
            fat = nutrients.get('Total lipid (fat)', 0)
            
            return {
                'calories': round(calories, 1),
                'protein': round(protein, 1),
                'carbs': round(carbs, 1),
                'fat': round(fat, 1)
            }
    except Exception as e:
        print('USDA API request failed:', e)

    # Fallback dummy values (very rough estimates)
    # NOTE: these are placeholders — replace with real API calls for production.
    lower = 50
    upper = 500
    import random
    calories = random.randint(lower, upper)
    protein = round(random.uniform(0, 30), 1)
    carbs = round(random.uniform(0, 80), 1)
    fat = round(random.uniform(0, 40), 1)
    return {'calories': calories, 'protein': protein, 'carbs': carbs, 'fat': fat}


def generate_fitness_advice(user_message, daily_summary):
    """
    Generate fitness advice using a rule-based chatbot.
    For more advanced AI, integrate with Groq, OpenAI, or Hugging Face APIs.
    """
    message_lower = user_message.lower()
    
    # Rule-based responses
    if any(word in message_lower for word in ['protein', 'muscle', 'strength']):
        return f"💪 Protein is essential for muscle growth! Today you've consumed {daily_summary.get('protein', 0):.1f}g protein. Aim for 1.6-2.2g per kg of body weight. Sources: chicken, fish, eggs, legumes, Greek yogurt."
    
    elif any(word in message_lower for word in ['weight loss', 'diet', 'calorie', 'lose weight']):
        target = 2000
        consumed = daily_summary.get('calories', 0)
        remaining = target - consumed
        return f"🔥 For weight loss, maintain a calorie deficit. Today: {consumed:.0f}/{target} calories. {remaining:.0f} remaining. Focus on high-protein, high-fiber foods to stay full."
    
    elif any(word in message_lower for word in ['carb', 'energy', 'stamina']):
        return f"⚡ Carbs fuel your workouts! Today: {daily_summary.get('carbs', 0):.1f}g carbs. Aim for 5-7g/kg for moderate activity, 7-10g/kg for intense training. Choose complex carbs: oats, brown rice, sweet potatoes."
    
    elif any(word in message_lower for word in ['fat', 'healthy fat', 'omega']):
        return f"🧈 Healthy fats support hormones and heart health. Today: {daily_summary.get('fat', 0):.1f}g fat. Aim for 20-35% of calories. Sources: avocado, nuts, olive oil, fatty fish."
    
    elif any(word in message_lower for word in ['water', 'hydration', 'drink']):
        return "💧 Hydration is key! Drink at least 8-10 glasses (2-3L) of water daily. More if you exercise. Check urine color—pale yellow is ideal."
    
    elif any(word in message_lower for word in ['workout', 'exercise', 'gym', 'training']):
        return "🏋️ Exercise regularly: 150 min moderate or 75 min vigorous cardio + 2 days strength training weekly. Mix cardio, strength, and flexibility for best results."
    
    elif any(word in message_lower for word in ['sleep', 'rest', 'recovery']):
        return "😴 Sleep is crucial! Aim for 7-9 hours nightly. Quality sleep aids recovery, metabolism, and mood. Keep your bedroom cool and dark."
    
    elif any(word in message_lower for word in ['goal', 'track', 'how do i']):
        return f"🎯 Your today's stats: {daily_summary.get('calories', 0):.0f} cal | {daily_summary.get('protein', 0):.1f}g protein | {daily_summary.get('carbs', 0):.1f}g carbs | {daily_summary.get('fat', 0):.1f}g fat. Keep logging to track trends and reach your goals!"
    
    else:
        return "🤔 Great question! I can help with nutrition, macros, fitness tips, hydration, sleep, and workout advice. What would you like to know?"


def image_recognition_placeholder(image_path):
    """
    Use Imagga API to identify food in images.
    
    Requires:
    - IMAGGA_API_KEY environment variable with your API key
    - IMAGGA_API_SECRET environment variable with your API secret
    - Get keys from: https://imagga.com/
    - Create account and get free tier API credentials
    
    Note: Free tier includes 100 requests/month. Paid plans available for higher usage.
    """
    if not IMAGGA_API_KEY or not IMAGGA_API_SECRET:
        return 'API credentials not configured. Please set IMAGGA_API_KEY and IMAGGA_API_SECRET environment variables.'
    
    try:
        import requests
        from requests.auth import HTTPBasicAuth
        
        # Upload image to Imagga
        upload_url = 'https://api.imagga.com/v2/uploads'
        
        with open(image_path, 'rb') as img_file:
            files = {'image': img_file}
            upload_response = requests.post(
                upload_url,
                files=files,
                auth=HTTPBasicAuth(IMAGGA_API_KEY, IMAGGA_API_SECRET),
                timeout=30
            )
        
        if upload_response.status_code != 200:
            try:
                error_msg = upload_response.json().get('error', {}).get('message', 'Upload failed')
            except:
                error_msg = f'Upload failed with status {upload_response.status_code}'
            print(f'Imagga upload error: {error_msg}')
            return f'Error: {error_msg}'
        
        upload_data = upload_response.json()
        image_id = upload_data['result']['upload_id']
        
        # Get tags/labels for the uploaded image
        tags_url = 'https://api.imagga.com/v2/tags'
        params = {
            'image_upload_id': image_id
        }
        
        tags_response = requests.get(
            tags_url,
            params=params,
            auth=HTTPBasicAuth(IMAGGA_API_KEY, IMAGGA_API_SECRET),
            timeout=30
        )
        
        if tags_response.status_code == 200:
            tags_data = tags_response.json()
            
            # Extract food-related tags
            labels = []
            if 'result' in tags_data and 'tags' in tags_data['result']:
                for tag in tags_data['result']['tags']:
                    confidence = tag.get('confidence', 0)
                    tag_name = tag.get('tag', {}).get('en', 'unknown')
                    
                    # Only include high confidence labels (>30%)
                    if confidence > 30 and tag_name != 'unknown':
                        labels.append(tag_name)
            
            detected_food = ', '.join(labels[:3]) if labels else 'unknown food'
            return detected_food
        else:
            try:
                error_msg = tags_response.json().get('error', {}).get('message', 'Unknown error')
            except:
                error_msg = f'Tagging failed with status {tags_response.status_code}'
            print(f'Imagga tagging error: {error_msg}')
            return f'Error: {error_msg}'
            
    except Exception as e:
        print(f'Image recognition failed: {e}')
        # Fallback to filename-based detection
        try:
            name = os.path.basename(image_path).lower()
            if 'egg' in name:
                return 'egg'
            if 'apple' in name:
                return 'apple'
            if 'banana' in name:
                return 'banana'
            if 'dosa' in name:
                return 'dosa'
            if 'rice' in name:
                return 'rice'
            if 'bread' in name:
                return 'bread'
        except:
            pass
        return 'unknown food (enable Imagga API credentials for AI recognition)'


# -------------------------
# App entry
# -------------------------

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)


