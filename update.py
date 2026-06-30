import os
import shutil

script_dir = os.path.dirname(os.path.abspath(__file__))

def backup_dir():
    backup_dir = os.path.join(script_dir, 'update_backup')
    try:
        os.makedirs(backup_dir, exist_ok=True)
        shutil.copytree(src=script_dir, dst=backup_dir)
        #print(f"Backup of the DB created at {backup_file_path}")
    except Exception as e:
        raise RuntimeError("CRITICAL: Database Backup Failed!")