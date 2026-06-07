import sqlite3
import os
import config

def get_db_connection():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create employees table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        department TEXT NOT NULL,
        role TEXT NOT NULL,
        encoding_path TEXT NOT NULL,
        profile_image_path TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Create attendance_logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        check_out_time TEXT,
        date TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
    )
    """)
    
    conn.commit()
    conn.close()

def add_employee(employee_id, full_name, email, department, role, encoding_path, profile_image_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO employees (employee_id, full_name, email, department, role, encoding_path, profile_image_path, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            (employee_id, full_name, email, department, role, encoding_path, profile_image_path)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def get_employees():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM employees WHERE status = 'active'")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def check_today_log(employee_id, date_str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM attendance_logs WHERE employee_id = ? AND date = ?",
        (employee_id, date_str)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def log_check_in(employee_id, time_str, date_str, similarity_score):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO attendance_logs (employee_id, check_in_time, date, similarity_score)
        VALUES (?, ?, ?, ?)
        """,
        (employee_id, time_str, date_str, similarity_score)
    )
    conn.commit()
    conn.close()

def log_check_out(employee_id, time_str, date_str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE attendance_logs
        SET check_out_time = ?
        WHERE employee_id = ? AND date = ?
        """,
        (time_str, employee_id, date_str)
    )
    conn.commit()
    conn.close()

def get_logs():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Join with employees to get their details
    cursor.execute(
        """
        SELECT l.id, l.employee_id, l.check_in_time, l.check_out_time, l.date, l.similarity_score,
               e.full_name, e.department, e.role, e.email
        FROM attendance_logs l
        JOIN employees e ON l.employee_id = e.employee_id
        ORDER BY l.date DESC, l.check_in_time DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_today_stats(date_str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total active employees
    cursor.execute("SELECT COUNT(*) FROM employees WHERE status = 'active'")
    total = cursor.fetchone()[0]
    
    # Present today (unique employees logged check-in today)
    cursor.execute("SELECT COUNT(DISTINCT employee_id) FROM attendance_logs WHERE date = ?", (date_str,))
    present = cursor.fetchone()[0]
    
    absent = max(0, total - present)
    
    conn.close()
    return {
        "total": total,
        "present": present,
        "absent": absent
    }
