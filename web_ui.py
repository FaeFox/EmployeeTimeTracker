import datetime
import json
import uuid
import os
import time
import requests
import shutil
import configparser
import webbrowser
import webview
import threading
import random
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO
from dateutil import parser
from pythonping import ping


def update_start_progress(window, percent, message):
    js = f"updateProgress({percent}, {json.dumps(message)})"
    window.evaluate_js(js)

# Starting the flask app and getting default config
app = Flask(__name__, static_folder='static')
app.secret_key = "SecretSample"  # Remember to keep your secret key secure
socketio = SocketIO(app, cors_allowed_origins="*", engineio_logger=True, transports=['websocket'])

# Get the directory of the current script [Windows Compatibility]
script_dir = os.path.dirname(os.path.abspath(__file__))
ini_file_path = os.path.join(script_dir, 'appconfig.ini')

def server_is_up(url):
    """Check if the server is up by attempting to connect to it."""
    try:
        response = requests.get(url, timeout=1)
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

    # DO NOT UPDATE TO ELIF! MIGRATION IMPLEMENTATION WILL FAIL!
    if current_version == '1.0':
        print('Database being updated (v1.0 > v1.1)...')
        data['version'] = '1.1'
        for key, value in data.items():
            if key != 'version' and isinstance(value, list):
                for entry in value:
                    if 'id' not in entry:
                        entry['id'] = str(uuid.uuid4())
        current_version = '1.1'
    if current_version == '1.1':
        print('Database being updated (v1.1 > v1.2)...')
        data['version'] = '1.2'
        for key, value in data.items():
            if key != 'version' and isinstance(value, list):
                for entry in value:
                    if 'edited' not in entry:
                        entry['edited'] = False
        current_version = '1.2'
    if current_version == '1.2':
        # update DB to keep track of config related to backups
        # 'backup_archive' is how many files to keep before deleting the oldest
        print('Database being updated (v1.2 > v1.3)...')
        data['version'] = '1.3'
        data['backup_status'] = {'last_backup': datetime.datetime.now().timestamp(), "backup_frequency": 3, "backup_archive": 5}
        current_version = '1.3'

    # Write updated DB
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4)
    print('Database update complete.')

def check_db_needs_update(file_path):
    """Check if the database needs an update and call update_db if necessary."""
    with open(file_path, 'r') as file:
        data = json.load(file)

    if 'version' in data:
        if data['version'] != '1.3':
            update_db(file_path, data['version'])
    else:
        update_db(file_path, '1.0')

def backup_db(file_path: str = None):
    """Check if a DB backup is needed, manage all backup functionality"""
    if not file_path:
        file_path = os.path.join(script_dir, 'db', 'db.json')
    with open(file_path, 'r') as file:
        data = json.load(file)
    # checks for expected keys as of database v1.3
    if 'backup_status' not in data:
        return
    # check if it is time for a database backup, return if not
    next_backup_time = data['backup_status']['last_backup'] + (data['backup_status']['backup_frequency'] * 86400)
    if datetime.datetime.now().timestamp() < next_backup_time:
        return
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    backup_dir = os.path.join(script_dir, 'db_backups')
    backup_file_path = f"{os.path.join(script_dir, 'db_backups', 'db.json')}.{timestamp}.BACKUP"
    try:
        os.makedirs(backup_dir, exist_ok=True)
        shutil.copyfile(file_path, backup_file_path)
        print(f"Backup of the DB created at {backup_file_path}")
    except Exception as e:
        raise RuntimeError("CRITICAL: Database Backup Failed!")
    # check if rolling backup has too many files, delete oldest if true
    if len(os.listdir(backup_dir)) > data['backup_status']['backup_archive']:
        file_list = os.listdir(backup_dir)
        full_path = [os.path.join(backup_dir, x) for x in file_list]
        oldest_file = min(full_path, key=os.path.getctime)
        os.remove(oldest_file)
    data['backup_status']['last_backup'] = datetime.datetime.now().timestamp()
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4)
    return

def backup_employee_db(file_path: str = None):
    """Check if a DB backup is needed, manage all backup functionality"""
    if not file_path:
        file_path = os.path.join(script_dir, 'static', 'employee_db.json')
    with open(file_path, 'r') as file:
        data = json.load(file)
    # checks for expected keys as of database v1.3
    # check if it is time for a database backup, return if not
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    backup_dir = os.path.join(script_dir, 'employee_db_backups')
    backup_file_path = f"{os.path.join(script_dir, 'employee_db_backups', 'employee_db.json')}.{timestamp}.BACKUP"
    try:
        os.makedirs(backup_dir, exist_ok=True)
        shutil.copyfile(file_path, backup_file_path)
        print(f"Backup of the DB created at {backup_file_path}")
    except Exception as e:
        raise RuntimeError("CRITICAL: Database Backup Failed!")
    # check if rolling backup has too many files, delete oldest if true
    # TODO: Hard-coded to save 20 backups, meaning 20 revisions can be made or undone
    # TODO: Should be configurable eventually.
    if len(os.listdir(backup_dir)) > 20:
        file_list = os.listdir(backup_dir)
        full_path = [os.path.join(backup_dir, x) for x in file_list]
        oldest_file = min(full_path, key=os.path.getctime)
        os.remove(oldest_file)
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4)
    return

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

def send_alert(title, body, footer=None, category="info", start_date=None, end_date=None):
    """Send an alert message to the frontend. Body is HTML. SweetAlerts2"""
    socketio.emit('alert_message', {'title': title, 'body': body, 'footer': footer, 'category': category, 'start_date': start_date, 'end_date': end_date})

def load_users_db():
    users = {}
    with open(f'{script_dir}/static/employee_db.json', 'r') as file:
        users = json.load(file)

    # Filter out users whose names start with "r!"
    users = {key: value for key, value in users.items() if not value['name'].startswith('r!')}
    
    return users

def load_users_db_unfiltered():
    """Load the users database without filtering removed users."""
    users = {}
    with open(f'{script_dir}/static/employee_db.json', 'r') as file:
        users = json.load(file)

    # Filter out users whose names start with "r!"
    # users = {key: value for key, value in users.items() if not value['name'].startswith('r!')}
    
    return users

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

def add_employee_to_db(employee_id, name, is_admin, password):
    """Add a new employee to the database."""
    users = load_users_db_unfiltered()
    users[employee_id] = {
        'name': name,
        'isAdmin': is_admin,
        'password': password
    }
    with open(os.path.join(script_dir, 'static', 'employee_db.json'), 'w') as file:
        json.dump(users, file, indent=4)
    return

@app.route("/admin/print_employee_report")
def print_employee_report():

    if not session.get("is_admin"):
        return "Unauthorized", 403

    employee_id = request.args.get("employee_id")
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    requester = request.args.get("req_name")

    start_dt = parser.parse(start)
    end_dt = parser.parse(end) + datetime.timedelta(days=1)

    clock_db = load_clockin_db()
    employee_db = load_users_db()

    employee_name = employee_db[employee_id]["name"]

    grouped_days = {}
    total_hours = 0

    for entry in clock_db.get(employee_id, []):

        if "clock_out" not in entry:
            continue

        clock_in = parser.parse(entry["clock_in"])
        clock_out = parser.parse(entry["clock_out"])

        if not(start_dt <= clock_in <= end_dt):
            continue

        hours = (clock_out - clock_in).total_seconds() / 3600
        total_hours += hours

        date_key = clock_in.strftime("%m/%d/%Y")

        shift = {
            "clock_in": clock_in.strftime("%I:%M %p"),
            "clock_out": clock_out.strftime("%I:%M %p"),
            "hours": f"{hours:.2f}"
        }

        if date_key not in grouped_days:
            grouped_days[date_key] = {
                "date": date_key,
                "shifts": [],
                "total": 0
            }

        grouped_days[date_key]["shifts"].append(shift)
        grouped_days[date_key]["total"] += hours

    days = []

    for day in grouped_days.values():
        day["total"] = f"{day['total']:.2f}"
        days.append(day)

    days.sort(key=lambda x: datetime.datetime.strptime(x["date"], "%m/%d/%Y"))

    return render_template(
        "reports/employee_hours_report.html",
        employee_name=employee_name,
        employee_id=employee_id,
        start_date=start,
        end_date=end,
        requester=requester,
        generated=datetime.datetime.now().strftime("%m/%d/%Y %I:%M %p"),
        days=days,
        total_hours=f"{total_hours:.2f}"
    )


def valid_credentials(username, password=None):
    """Validate user credentials."""
    users = load_users_db()
    if username in users:
        return {'status': 'OK', 'user_id': username, 'username': users[username]['name']}
    else:
        return {'status': 'KO', 'user_id': None}
    #user = None
    #for user_id, user_data in users.items():
    #    if user_id == username or user_data['name'].lower() == username.lower():
    #        user = user_data
    #        break
    #if user and user['password'] == password:
    #    return {'status': 'OK', 'user_id': user_id, 'username': user['name']}
    #else:
    #    return {'status': 'KO', 'user_id': None}

def valid_admin_credentials(username, password):
    """Validate admin credentials, requires password for extra security."""
    users = load_users_db()
    user = None
    for user_id, user_data in users.items():
        if user_id == username or user_data['name'].lower() == username.lower():
            user = user_data
            break
    if user and user['password'] == password:
        print("Admin login SUCCESS")
        return {'status': 'OK', 'user_id': user_id, 'username': user['name']}
    else:
        print("Admin login FAIL")
        return {'status': 'KO', 'user_id': None}

def read_employee_records_db():
    """Read employee records from the database."""
    with open(os.path.join(script_dir, 'db', 'db.json'), 'r') as file:
        return json.load(file)

@app.route('/admin/is_admin_verified', methods=['POST'])
def is_admin_verified():
    """Check if the admin is has already verified this session."""
    return jsonify({'isValid': session.get('admin_verified', False)})

@app.route('/admin/verify-admin-password', methods=['POST'])
def verify_admin_password():
    """Verify admin password and approve device if valid."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not session.get('is_admin'):
        return jsonify({'isValid': False}), 403

    result = valid_admin_credentials(username, password)
    
    try:
        cookie = data.get("cookie")
    except:
        cookie = True
    if not cookie:
        if result['status'] == 'OK':
            print("Cookie not requested, skipping device approval.")
            response = jsonify({'isValid': True})
            session["admin_verified"] = True
            return response, 200
        else:
            return jsonify({'isValid': False}), 403

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

# Utility functions for generating non-similar IDs -----------------------------
# TODO: NOT YET VALIDATED
# TODO: INEFFICIENT
def is_too_similar(id1, id2, min_digit_diff=2):
    """Check if two 4-digit strings are too similar."""
    diff = sum(a != b for a, b in zip(id1, id2))
    return diff < min_digit_diff  # e.g., must differ by at least 2 digits

def generate_non_similar_id(existing_ids, attempts=500):
    """Generate a 4-digit ID not too similar to existing ones."""
    for _ in range(attempts):
        candidate = str(random.randint(1, 9999)).zfill(4)
        if all(not is_too_similar(candidate, e) for e in existing_ids):
            return candidate
    raise ValueError("Couldn't find a sufficiently unique ID after many attempts.")

def generate_spread_id(existing_ids, attempts=500):
    existing_nums = [int(e) for e in existing_ids]
    for _ in range(attempts):
        candidate = random.randint(1, 9999)
        # Randomized exclusion window: 5–30 numbers away from each existing
        too_close = any(abs(candidate - e) < random.randint(5, 30) for e in existing_nums)
        if not too_close:
            return str(candidate).zfill(4)
    raise ValueError("No available ID found.")


@app.route('/admin/register_new_employee', methods=['POST'])
def register_new_employee():
    if not session.get('is_admin'):
        return jsonify({'status': 'error', 'message': 'Not authorized.'}), 403

    current_employees = load_users_db_unfiltered()
    existing_ids = set(current_employees.keys())

    try:
        new_employee_id = generate_non_similar_id(existing_ids)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Unable to generate unique ID.'}), 400

    data = request.get_json()
    name = data.get('name')
    is_admin = data.get('isAdmin', False)
    #password = data.get('password')
    password = new_employee_id

    try:
        backup_employee_db()
    except RuntimeError:
        send_alert("Critical Error", "Failed to backup employee database. To protect against potential data loss, your changes have not been saved. If you see this error repeatedly, please contact your administrator.", category="error")
        return jsonify({'status': 'error', 'message': 'Database backup failed.'}), 500

    add_employee_to_db(new_employee_id, name, is_admin, password)

    send_toast(f"New employee '{name}' (ID: {new_employee_id}) registered successfully!", "success")
    return jsonify({'status': 'success', 'employeeId': new_employee_id})

@app.route('/admin/remove_employee', methods=['POST'])
def remove_employee():
    if not session.get('is_admin'):
        return jsonify({'status': 'error', 'message': 'Not authorized.'}), 403
    data = request.get_json()
    employee_id = data.get('employee_id')

    users = load_users_db_unfiltered()
    try:
        users[f'{employee_id}']['name'] = f"r!{users[f'{employee_id}']['name']}"
    except KeyError:
        return jsonify({'status': 'error', 'message': 'Employee not found.'}), 404
    try:
        backup_employee_db()
    except RuntimeError:
        send_alert("Critical Error", "Failed to backup employee database. To protect against potential data loss, your changes have not been saved. If you see this error repeatedly, please contact your administrator.", category="error")
        return jsonify({'status': 'error', 'message': 'Database backup failed.'}), 500
    with open(os.path.join(script_dir, 'static', 'employee_db.json'), 'w') as file:
        json.dump(users, file, indent=4)
    return jsonify({'status': 'success'})

@app.route('/admin/get_all_employees_full', methods=['GET'])
def get_all_employees_full():
    if not session.get('is_admin'):
        return jsonify([]), 403

    users = load_users_db_unfiltered()

    results = []
    for employee_id, data in users.items():
        # Skip soft-deleted users (optional)
        if data['name'].startswith("r!"):
            continue

        results.append({
            "id": employee_id,
            "name": data['name'],
            "isAdmin": data.get('isAdmin', False)
        })

    return jsonify(results)

@app.route('/admin/manage_employees')
def manage_employees():
    """Render the view employee hours page for admin."""
    if session.get("logged_in"):
        return render_template("/admin/manage_employees.html")
    return redirect(url_for("index"))
# -----------------------------------------------------------------------------

@app.route('/get_all_registered_employees', methods=['GET'])
def get_employees():
    """Get all registered employees and format the response for Select2."""
    employees_db = load_users_db()
    current_id = 0

    employees = [{"id": int(emp_id), "name": data["name"], "code": int(emp_id)} for emp_id, data in employees_db.items()]

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

@app.route('/admin/get_hours_summary', methods=['GET'])
def get_hours_summary(to_file=False):
    #user_id = request.args.get('user_id')
    if not session.get('is_admin'):
        return
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    print(f"Received hour summary request with the following info:\n\nStart Date: {start_date}\nEnd Date: {end_date}")
    start_date_dt = parser.parse(start_date)
    end_date_dt = parser.parse(end_date)
    # Add one day to the end of date picker so that it is inclusive
    end_date_dt += datetime.timedelta(days=1)

    readable_start_date = start_date_dt.strftime("%m/%d/%Y %H:%M")
    readable_end_date = end_date_dt.strftime("%m/%d/%Y %H:%M")

    clockin_db = load_clockin_db()
    employee_db = load_users_db()
    keys_list = list(employee_db.keys())
    #if len(str(user_id)) < 4:
    #    user_id = keys_list[int(user_id) - 1]

    total_hours = 0
    final_employee_hours = {}
    

    errors = {
        'invalid_time': [],
        'clocked_in': []
    }

    for emp_id, entries in clockin_db.items():
        if emp_id == 'version' or emp_id == 'backup_status':
            continue
        for entry in entries:
            # add error if invalid time found
            if not is_valid_datetime(entry['clock_in']) and 'clock_out' in entry:
                errors['invalid_time'].append(employee_db[str(emp_id)]['name'])
            elif not is_valid_datetime(entry['clock_in']) and 'clock_out' not in entry:
                errors['invalid_time'].append(employee_db[str(emp_id)]['name'])
            # add to total hours worked (successful clock-in+out)
            elif 'clock_out' in entry:
                clock_in = parser.parse(entry['clock_in'])
                clock_out = parser.parse(entry['clock_out'])
                if start_date_dt <= clock_in <= end_date_dt:
                    hours_worked = (clock_out - clock_in).total_seconds() / 3600
                    total_hours += hours_worked
            # add error if still clocked in
            else:
                clock_in = parser.parse(entry['clock_in'])
                if start_date_dt <= clock_in:
                    errors['clocked_in'].append(employee_db[str(emp_id)]['name'])
            #final_employee_hours[str(employee_db[str(emp_id)]['name'])] = total_hours TODO: replace ID with name
        if total_hours > 0:
            emp_key = str(emp_id)
            if emp_key in employee_db:
                emp_name = employee_db[emp_key]["name"]
            else:
                emp_name = f"Unknown-{emp_id}"  # fallback
            final_employee_hours[emp_name] = total_hours
            #print(emp_name)
        total_hours = 0
    
    if errors["invalid_time"] or errors["clocked_in"]:
        print("Errors Found!!!")
        error_message = "<style>pre {background-color: #f8d7da; padding: 10px; border-radius: 5px;}</style>"
        if errors["invalid_time"]:
            error_message += f"The following employee(s) have invalid times:<br><pre><code>{', '.join(errors['invalid_time'])}</code></pre><br>"
        if errors["clocked_in"]:
            error_message += f"- {len(errors['clocked_in'])} employees are still clocked in and need to clock out.<br>"
        error_message += "Please review the employee hours for details."

        send_alert("Error Generating Report", error_message, category="error")
    else:
        #message = "Clock-ins from <strong>" + str(start_date_dt) + "</strong> to <strong>" + str(end_date_dt) + "</strong>:<br><style>pre {background-color: #dbdbdb; padding: 10px; border-radius: 5px; text-align:left;}</style><pre id='reportBox'><code>"
        message = (
            "Clock-ins from <strong>" + str(readable_start_date) + "</strong> to <strong>" + str(readable_end_date) + "</strong>:<br>"
            """<style>
                .code-container {
                    position: relative;
                    display: inline-block;
                    width: 100%;
                }
                .copy-btn {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    border: none;
                    border-radius: 5px;
                    background: none;
                    background-color: rgba(0, 0, 0, 0.5);
                    cursor: pointer;
                    font-size: 16px;
                    opacity: 0.7;
                }
                .copy-btn:hover {
                    opacity: 1;
                }
                pre {
                    background-color: #dbdbdb;
                    padding: 10px;
                    border-radius: 5px;
                    text-align:left;
                    overflow-x:auto;
                }
            </style>
            <div class='code-container'>
                <button id='copyReportBtn' class='copy-btn' title='Copy'>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/>
                    </svg>
                </button>
                <pre id='reportBox'><code>"""
        )
        for emp in final_employee_hours:
            hours = int(final_employee_hours[emp])
            minutes = int((final_employee_hours[emp] - hours) * 60)
            message += f"{emp}: {hours}h {minutes}m\n"
            #final_employee_hours[emp] = f"{hours}h {minutes}m"
        message += "</code></pre>"

        send_alert("Report Generated", message, category="success", start_date=str(readable_start_date), end_date=str(readable_end_date), footer="It is recommended to review the report before submitting.")

    return jsonify(final_employee_hours)
            
            


@app.route('/admin/get_employees_hours', methods=['GET'])
def get_specified_hours(to_file=False):
    """Get specified hours for an employee between start_date and end_date.
    to_file: bool - If True, returns specified hours entry to the calling function rather than to the front-end"""
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
    # error tracking, used for hours summary file generation (to_file=True)
    errors = {
        'invalid_time': 0,
        'clocked_in': 0
    }
    hour_summary = []

    if user_id in clockin_db:
        for entry in clockin_db[user_id]:
            if not is_valid_datetime(entry['clock_in']) and 'clock_out' in entry:
                errors['invalid_time'] += 1
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
                errors['invalid_time'] += 1
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
                errors['clocked_in'] += 1
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
    if not session.get('is_admin') and not session.get('admin_verified'):
        return jsonify({'status': 'error', 'message': 'Not authorized.'}), 403
    else:
        print("Admin verified.")
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
        session.pop('admin_verified', None)
        session.clear()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'message': 'Logged out'}), 200

    return redirect(url_for("index"))


def start_flask():
    socketio.run(app, host="127.0.0.1", port=5000, debug=True, use_reloader=False)

def startup(window):
    update_start_progress(window, 0, "Checking internet connection...")
    try:
        ping('www.google.com')
    except:
        update_start_progress(window, 0, "Error: You are not connected to the internet. Close the application, check your Wi-Fi connection, then try again.")
        return
    time.sleep(0.3)
    update_start_progress(window, 10, "Cleaning up database...")
    try: 
        check_db_needs_update(file_path = os.path.join(script_dir, 'db', 'db.json'))
    except Exception as e:
        update_start_progress(window, 0, "Error: Failed to update the database. The application has been stopped to prevent loss of data.")
        print('[FATAL]' + e)
        return
    time.sleep(0.25)
    update_start_progress(window, 30, "Creating backup...")
    try:
        backup_db()
    except Exception as e:
        update_start_progress(window, 0, "Error: Failed to create a backup of the database. The application has been stopped to prevent loss of data.")
        print('[FATAL]' + e)
        return
    time.sleep(0.5)
    update_start_progress(window, 70, "Starting application...")
    try:
        flask_thread = threading.Thread(target=start_flask, daemon=True)
        flask_thread.start()
        while not server_is_up("http://127.0.0.1:5000"):
            time.sleep(0.25)
        update_start_progress(window, 100, "")
        time.sleep(0.8)
        window.load_url("http://127.0.0.1:5000")
    except Exception as e:
        update_start_progress(window, 0, "Error: The application failed to load. Please close the application, then open it again. If error persists, please try restarting your computer.")
        print('[FATAL]' + e)
        return

if __name__ == "__main__":
    load_screen = os.path.join(script_dir, 'templates', "loading.html")
    window = webview.create_window(
        "St. Monica Employee Portal", load_screen, maximized=True
    )
    webview.start(
        startup,
        window,
        gui="edgechromium",
        debug=False,
        private_mode=False,
        storage_path=os.path.join(script_dir, "webview_data"),
    )
