import datetime
import json
import uuid
import os
import time
import requests
import shutil
import configparser
import webbrowser
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO
from dateutil import parser

# Starting the flask app and getting default config
app = Flask(__name__, static_folder='static')
app.secret_key = "CHANGEME"  # Remember to keep your secret key secure
socketio = SocketIO(app, cors_allowed_origins="*", engineio_logger=True, transports=['websocket'])

# Get the directory of the current script [Windows Compatibility]
script_dir = os.path.dirname(os.path.abspath(__file__))
ini_file_path = os.path.join(script_dir, 'appconfig.ini')

def server_is_up(url):
    """Check if the server is up by attempting to connect to it."""
    try:
        response = requests.get(url)
        return response.status_code == 200
    except requests.ConnectionError:
        return False

def open_browser_when_ready(url):
    """Wait for the server to start, then open the browser."""
    while not server_is_up(url):
        time.sleep(0.5)  # Check every half second
    file_path = os.path.join(script_dir, 'db', 'db.json')
    # Check for DB update at startup
    check_db_needs_update(file_path)
    webbrowser.open_new(url)

def update_db(file_path: str, current_version: str):
    """Update the database if needed and create a backup before updating."""
    print('Database update required - Creating backup before updating...')
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    backup_file_path = f"{file_path}.backup_{timestamp}"
    try:
        shutil.copyfile(file_path, backup_file_path)
        print(f"Backup of the DB created at {backup_file_path}")
    except Exception as e:
        raise RuntimeError("Failed to create a database backup before mandatory updates. The program cannot be started.")
    
    # Load current DB
    with open(file_path, 'r') as file:
        data = json.load(file)

    if current_version == '1.0':
        print('Database being updated (v1.0 > v1.1)...')
        data['version'] = '1.1'
        for key in data.keys():
            if key != 'version':
                for entry in data[key]:
                    if 'id' not in entry:
                        entry['id'] = str(uuid.uuid4())
    if current_version == '1.1':
        print('Database being updated (v1.1 > v1.2)...')
        data['version'] = '1.2'
        for key in data.keys():
            if key != 'version':
                for entry in data[key]:
                    if 'edited' not in entry:
                        entry['edited'] = False

    # Write updated DB
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4)
    print('Database update complete.')

def check_db_needs_update(file_path):
    """Check if the database needs an update and call update_db if necessary."""
    with open(file_path, 'r') as file:
        data = json.load(file)

    if 'version' in data:
        if data['version'] != '1.2':
            update_db(file_path, data['version'])
    else:
        update_db(file_path, '1.0')

def needs_clock_out(db, employee_id):
    """Check if the employee needs to clock out."""
    if employee_id in db and db[employee_id]:
        for entry in reversed(db[employee_id]):
            if 'clock_in' in entry and 'clock_out' not in entry:
                return True
    return False

def send_toast(message, category="info"):
    """Send a toast message to the frontend."""
    socketio.emit('toast_message', {'message': message, 'category': category})

def load_users_db():
    """Load the users database."""
    with open(os.path.join(script_dir, 'static', 'employee_db.json'), 'r') as file:
        return json.load(file)

def load_clockin_db():
    """Load the clock-in database."""
    with open(os.path.join(script_dir, 'db', 'db.json'), 'r') as file:
        return json.load(file)

def load_approved_devices():
    """Load the list of approved devices."""
    with open(os.path.join(script_dir, 'db', 'approved_devices.json'), 'r') as file:
        return json.load(file)

def update_approved_devices(new_device_list):
    """Update the list of approved devices."""
    with open(os.path.join(script_dir, 'db', 'approved_devices.json'), 'w') as file:
        json.dump(new_device_list, file, indent=4)

def update_clockin_db(new_data: dict):
    """Update the clock-in database with new data."""
    db_path = os.path.join(script_dir, 'db', 'db.json')
    with open(db_path, 'r') as file:
        db = json.load(file)
    
    db.update(new_data)

    with open(db_path, 'w') as file:
        json.dump(db, file, indent=4)

def valid_credentials(username, password):
    """Validate user credentials."""
    users = load_users_db()
    user = None
    for user_id, user_data in users.items():
        if user_id == username or user_data['name'].lower() == username.lower():
            user = user_data
            break

    if user and user['password'] == password:
        return {'status': 'OK', 'user_id': user_id, 'username': user['name']}
    else:
        return {'status': 'KO', 'user_id': None}

def read_employee_records_db():
    """Read employee records from the database."""
    with open(os.path.join(script_dir, 'db', 'db.json'), 'r') as file:
        return json.load(file)

@app.route('/admin/verify-admin-password', methods=['POST'])
def verify_admin_password():
    """Verify admin password and approve device if valid."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not session.get('is_admin'):
        return jsonify({'isValid': False}), 403

    result = valid_credentials(username, password)
    
    if result['status'] == 'OK':
        unique_id = str(uuid.uuid4())
        response = jsonify({'isValid': True})
        response.set_cookie('device_id', unique_id, max_age=60*60*24*365)
        approved_devices = load_approved_devices()
        approved_devices['approved_devices'].append(unique_id)
        update_approved_devices(approved_devices)
        return response, 200
    else:
        return jsonify({'isValid': False}), 403

@app.route('/get_all_registered_employees', methods=['GET'])
def get_employees():
    """Get all registered employees and format the response for Select2."""
    employees_db = load_users_db()
    current_id = 0

    employees = [{"id": (current_id := current_id + 1), "name": data["name"], "code": int(emp_id)} for emp_id, data in employees_db.items()]

    results = [{"id": employee["id"], "text": f"{employee['name']} ({employee['code']})"} for employee in employees]

    return jsonify({"results": results})

@app.route('/get_employee_records/<employee_id>')
def get_employee_records(employee_id):
    """Get all records for a specific employee."""
    employee_records = read_employee_records_db()
    employee_id = str(employee_id)

    if employee_id in employee_records:
        records = employee_records[employee_id]
        records.reverse()
        return jsonify(records)
    else:
        return jsonify([])

@app.route('/api/check_if_user_clocked_out')
def check_if_user_clocked_out():
    """Check if the user has clocked out."""
    user_id = request.args.get('user_id')
    data = read_employee_records_db()

    if user_id in data:
        entries = data[user_id]
        if entries:
            if 'clock_out' in entries[-1].keys():
                return jsonify({"hasToClockOut": False})
            else:
                return jsonify({"hasToClockOut": True})
        else:
            return jsonify({"hasToClockOut": False})
    else:
        return jsonify({"hasToClockOut": False})

def is_valid_datetime(date_string):
    """Check if the provided date string is a valid datetime."""
    try:
        date_string = parser.parse(date_string)
        date_string.strftime("%m-%d-%Y %I:%M:%S %p")
        return True
    except ValueError:
        return False

@app.route('/admin/get_employees_hours', methods=['GET'])
def get_specified_hours():
    """Get specified hours for an employee between start_date and end_date."""
    user_id = request.args.get('user_id')
    if not session.get('is_admin'):
        user_id = session.get('user_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    print(f"Received hour add-up request with the following info:\n\nUser ID: {user_id}\nStart Date: {start_date}\nEnd Date: {end_date}")

    start_date_dt = parser.parse(start_date)
    end_date_dt = parser.parse(end_date)

    # Add one day to the end of date picker so that it is inclusive
    end_date_dt += datetime.timedelta(days=1)

    clockin_db = load_clockin_db()
    employee_db = load_users_db()
    keys_list = list(employee_db.keys())
    if len(str(user_id)) < 4:
        user_id = keys_list[int(user_id) - 1]
    total_hours = 0
    user_hours = []

    if user_id in clockin_db:
        for entry in clockin_db[user_id]:
            if not is_valid_datetime(entry['clock_in']) and 'clock_out' in entry:
                clock_in = "<div class='bg-danger'>Manual Input Needed!</div>"
                clock_out = parser.parse(entry['clock_out'])
                user_hours.append({
                    'name': str(employee_db[str(user_id)]['name']),
                    'id': str(user_id),
                    'clock_in': clock_in,
                    'clock_out': clock_out.strftime("%m-%d-%Y %I:%M:%S %p"),
                    'hours_worked': f"-",
                    'uuid': entry['id']
                })
            elif not is_valid_datetime(entry['clock_in']) and 'clock_out' not in entry:
                user_hours.append({
                    'name': str(employee_db[str(user_id)]['name']),
                    'id': str(user_id),
                    'clock_in': "<div class='bg-danger'>Manual Input Needed!</div>",
                    'clock_out': "Still clocked in",
                    'hours_worked': f"-",
                    'uuid': entry['id']
                })
            elif 'clock_out' in entry:
                clock_in = parser.parse(entry['clock_in'])
                clock_out = parser.parse(entry['clock_out'])
                if start_date_dt <= clock_in <= end_date_dt:
                    hours_worked = (clock_out - clock_in).total_seconds() / 3600
                    hours = int(hours_worked)
                    minutes = int((hours_worked - hours) * 60)
                    user_hours.append({
                        'name': str(employee_db[str(user_id)]['name']),
                        'id': str(user_id),
                        'clock_in': clock_in.strftime("%m-%d-%Y %I:%M:%S %p"),
                        'clock_out': clock_out.strftime("%m-%d-%Y %I:%M:%S %p"),
                        'hours_worked': f"{hours}h {minutes}m",
                        'uuid': entry['id']
                    })
                    total_hours += hours_worked
            else:
                clock_in = parser.parse(entry['clock_in'])
                clock_out = "Still Clocked In"
                if start_date_dt <= clock_in <= end_date_dt:
                    user_hours.append({
                        'name': str(employee_db[str(user_id)]['name']),
                        'id': str(user_id),
                        'clock_in': clock_in.strftime("%Y-%m-%d %H:%M:%S"),
                        'clock_out': clock_out,
                        'hours_worked': f"-",
                        'uuid': entry['id']
                    })

    hours = int(total_hours)
    minutes = int((total_hours - hours) * 60)
    user_hours.insert(0, {
        'name': f"<strong>Total Hours for {employee_db[str(user_id)]['name']}</strong>",
        'id': " ",
        'clock_in': f"<strong>From</strong>: {start_date}",
        'clock_out': f"<strong>Through</strong>: {end_date}",
        'hours_worked': f"Total hours within selected period: <strong>{hours}h {minutes}m</strong>",
        'uuid': 0
    })
    print("Sending employee hours: " + str(user_hours))
    return jsonify(user_hours)

@app.route('/api/update_employee_hours', methods=['POST'])
def update_employee_hours():
    """Update employee hours in the database."""
    updates = request.get_json()
    clockin_db = load_clockin_db()
    print(f"Received hour modification request with the following data:\n{updates}")
    updates_needed = 0
    for update in updates:
        employee_id = update['id']
        clock_in = update['clock_in']
        clock_out = update['clock_out']
        action_id = update['uuid']

        if clock_in == '.000000':
            send_toast("One row was ignored due to being blank. Please refresh this page and verify hours again.", 'info')
            continue

        if len(list(filter(None, clock_out.split(".")))) <= 1:
            clock_out = None
        
        for event in clockin_db[employee_id]:
            if event['id'] == action_id:
                if event['clock_in'][:-6] != clock_in[-6] or event['clock_out'][:-6] != clock_out[-6]:
                    updates_needed += 1
                event['clock_in'] = clock_in
                if clock_out:
                    event['clock_out'] = clock_out
                event['edited'] = True

    if updates_needed > 0:
        update_clockin_db(clockin_db)

    send_toast("Hours successfully updated!")
    return jsonify({'status': 'success', 'message': 'Employee hours updated successfully.'})

@app.route('/admin/view_employee_hours')
def view_employee_hours():
    """Render the view employee hours page for admin."""
    if session.get("logged_in"):
        return render_template("/admin/view_employee_hours.html")
    return redirect(url_for("index"))

@socketio.on('check_autolog')
def handle_autolog_check(data):
    """Check if auto logout is enabled in the config and respond to the frontend."""
    config = configparser.ConfigParser()
    config.read(ini_file_path)
    auto_logout = config.getboolean('settings', 'auto_logout_on_clock', fallback=False)
    print('Received autolog check request: ' + data['message'])
    socketio.emit('receive_autolog_check', {'message': f'{auto_logout}'})

@socketio.on('start_employee_clockin')
def start_employee_clockin(data):
    """Handle employee clock-in and clock-out requests."""
    user_id = request.cookies.get('device_id')
    if not user_id:
        send_toast("Clock-in failed: Unauthorized device.", "error")
        return
    approved_ids = load_approved_devices()
    if user_id not in approved_ids['approved_devices']:
        send_toast("Clock-in failed: Unauthorized device.", "error")
        return
    formData = data
    clocking_in = True

    employee_id = formData['employeeId']
    db_path = os.path.join(script_dir, 'db', 'db.json')

    with open(db_path, 'r') as file:
        db = json.load(file)

    if employee_id not in db:
        db[employee_id] = []

    current_time = datetime.datetime.now().isoformat()

    if needs_clock_out(db, employee_id):
        for entry in reversed(db[employee_id]):
            if 'clock_in' in entry and 'clock_out' not in entry:
                entry['clock_out'] = current_time
                clocking_in = False
                break
    else:
        db[employee_id].append({'clock_in': current_time, 'id': str(uuid.uuid4())})
        clocking_in = True

    with open(db_path, 'w') as file:
        json.dump(db, file, indent=4)

    if clocking_in:
        send_toast("Punch recorded successfully, welcome in!", "success")
    else:
        send_toast("Clocked out successfully, see you later!", "success")

    return jsonify({"status": "success"})

@app.route('/')
def index():
    """Render the index page with settings from the config file."""
    config = configparser.ConfigParser()
    config.read(ini_file_path)
    settings = {
        'auto_logout_on_clock': config.get('settings', 'auto_logout_on_clock')
    }
    return render_template('index.html', settings=settings)


@app.route('/check_in')
def check_in():
    """Render the check-in page if the user is logged in."""
    if session.get("logged_in"):
       return render_template("check_in.html")
    return redirect(url_for("index"))

@app.route('/admin/get_employees_list', methods=['GET'])
def get_employees_list():
    """Get the list of employees and their clock-in/clock-out records."""
    clock_data = read_employee_records_db()
    user_data = load_users_db()
    user_list = []

    for user_id, user_info in user_data.items():
        user_records = []
        for entry in clock_data.get(user_id, []):
            user_record = {
                "id": user_id,
                "name": user_info.get("name", ""),
                "isAdmin": user_info.get("isAdmin", False),
                "clock_in": entry.get("clock_in", ""),
                "clock_out": entry.get("clock_out", ""),
            }
            user_records.append(user_record)
        
        sorted_user_records = sorted(user_records, key=lambda x: (x["name"], x["clock_in"], x["clock_out"]))
        user_list.extend(sorted_user_records)

    return jsonify(user_list)

@app.route('/change_password')
def change_password():
    """Render the change password page if the user is logged in."""
    if session.get("logged_in"):
       return render_template("change_password.html")
    return redirect(url_for("index"))

@app.route('/admin/manage_clock_ins')
def manage_clock_ins():
    """Render the manage clock-ins page for admin."""
    if session.get("logged_in"):
       return render_template("admin/manage_clock_ins.html")
    return redirect(url_for("index"))

def update_password_by_user_id(user_id, new_password):
    """Update the password for a specific user ID."""
    data = load_users_db()
    if user_id in data:
        data[user_id]['password'] = new_password
        with open(os.path.join(script_dir, 'static', 'employee_db.json'), 'w') as file:
            json.dump(data, file, indent=4)
        print(f"Password updated for user with ID {user_id}")
    else:
        print(f"User with ID {user_id} not found in the database")

def get_current_user_password(user_id):
    """Get the current password for a specific user ID."""
    data = load_users_db()
    user_data = data.get(str(user_id))
    return user_data['password'] if user_data else None

def is_user_admin(username):
    """Check if the user is an admin."""
    users = load_users_db()
    user_id = None
    for uid, user_data in users.items():
        if uid == username or user_data['name'].lower() == username.lower():
            user_id = uid
            break

    if user_id and users[user_id]['isAdmin']:
        return True
    else:
        return False

@app.route('/api/update-password', methods=['POST'])
def update_password():
    """Update the password for a user if the current password matches."""
    data = request.get_json()
    employee_id = data.get('employeeId')
    new_password = data.get('newPassword')
    current_password = data.get('currentPassword')

    currentPassword_db = get_current_user_password(employee_id)
    if currentPassword_db.strip() == current_password.strip(): 
        update_password_by_user_id(employee_id, new_password)
        response = {'message': 'Password updated successfully'}
        return jsonify(response), 200
    else:
        response =  {'message': 'Current password incorrect'}
        return jsonify(response), 400

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handle user login."""
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        print("Backend")
        print("Username: "+ username)
        print("Password: " + password)

        result = valid_credentials(username, password)

        if result['status'] == 'OK':
            print("User logged in...")
            user_id = result['user_id']
            session["is_admin"] = is_user_admin(user_id)
            session["logged_in"] = True
            session['user_id'] = user_id
            session['username'] = result['username']
            return redirect(url_for("check_in"))
        else:
            return redirect(url_for('index'))

    return render_template('login.html')

@app.route('/logout', methods=['POST', 'GET'])
def logout():
    """Handle user logout."""
    if 'logged_in' in session:
        session.pop('logged_in', None)
        session.pop('user_id', None)
        session.pop('username', None)
        session.pop('is_admin', None)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'message': 'Logged out'}), 200

    return redirect(url_for("index"))

if __name__ == '__main__':
    socketio.run(app, host="127.0.0.1", port=5000, debug=True, use_reloader=False)
