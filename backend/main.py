import base64
import os
import cv2
import numpy as np
import pickle
import logging
from datetime import date, datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from . import database
from . import register
from . import attendance

# Setup Logging basic config
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(config.LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("demotech.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Initializing database...")
    database.init_db()
    
    logger.info("Loading face embeddings cache...")
    attendance.load_known_embeddings()
    
    yield
    # Shutdown actions
    logger.info("Server shutting down...")

app = FastAPI(title="DemoTech Attendance Portal API", version="1.0.0", lifespan=lifespan)

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper functions
def decode_base64_image(base64_str: str) -> np.ndarray:
    """
    Decodes a base64 image string (with or without data URL prefix) to an OpenCV/Numpy BGR image.
    """
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    image_bytes = base64.b64decode(base64_str)
    nparr = np.frombuffer(image_bytes, np.uint8)
    image_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_np is None:
        raise ValueError("Failed to decode base64 image data.")
    return image_np

def calculate_hours(check_in: Optional[str], check_out: Optional[str]) -> float:
    """
    Computes elapsed decimal hours between 12-hour AM/PM strings.
    """
    if not check_in or not check_out:
        return 0.0
    try:
        fmt = "%I:%M %p"
        t1 = datetime.strptime(check_in, fmt)
        t2 = datetime.strptime(check_out, fmt)
        diff = t2 - t1
        return round(diff.total_seconds() / 3600.0, 1)
    except Exception as e:
        logger.error(f"Error calculating hours from {check_in} and {check_out}: {e}")
        return 0.0

def get_employees_with_attendance_today() -> List[dict]:
    """
    Queries database active employees and left joins today's logs to return UI-ready dictionaries.
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()
    today_str = date.today().isoformat()
    cursor.execute("""
        SELECT e.employee_id as id, e.full_name as name, e.email, e.department as dept, 
               e.role, l.check_in_time as checkIn, l.check_out_time as checkOut
        FROM employees e
        LEFT JOIN attendance_logs l ON e.employee_id = l.employee_id AND l.date = ?
        WHERE e.status = 'active'
    """, (today_str,))
    rows = cursor.fetchall()
    conn.close()
    
    employees_list = []
    for r in rows:
        d = dict(r)
        d["status"] = "Present" if d["checkIn"] else "Absent"
        if not d["checkIn"]:
            d["checkIn"] = ""
        if not d["checkOut"]:
            d["checkOut"] = ""
        employees_list.append(d)
    return employees_list

def clear_all_data():
    """
    Cleans database records and deletes physical pickle/JPEG files.
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM attendance_logs")
    cursor.execute("DELETE FROM employees")
    conn.commit()
    conn.close()
    
    # Delete storage contents
    for folder in [config.ENCODINGS_DIR, config.PROFILE_IMAGES_DIR]:
        if os.path.exists(folder):
            for f in os.listdir(folder):
                fp = os.path.join(folder, f)
                try:
                    if os.path.isfile(fp):
                        os.remove(fp)
                except Exception as e:
                    logger.error(f"Error deleting file {fp} during reset: {e}")

# API Request Schemas
class RegisterSampleRequest(BaseModel):
    image: str
    sample_index: int
    employee_id: str

class RegisterRequest(BaseModel):
    employee_id: str
    full_name: str
    email: str
    department: str
    role: str
    embeddings: List[List[float]]

class VerifyRequest(BaseModel):
    image: str

class CheckoutRequest(BaseModel):
    employee_id: str

# API Routes
@app.get("/api/v1/health")
def health_check():
    try:
        conn = database.get_db_connection()
        conn.execute("SELECT 1")
        conn.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"disconnected: {e}"
        logger.error(f"Health check database failure: {e}")
        
    employees_count = len(set(attendance.cached_ids))
    embeddings_count = len(attendance.cached_embeddings)
    
    return {
        "status": "online",
        "database": db_status,
        "employees_loaded": employees_count,
        "cached_embeddings": embeddings_count
    }

@app.get("/api/v1/stats")
def get_stats():
    try:
        today_str = date.today().isoformat()
        return database.get_today_stats(today_str)
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/employees")
def get_employees():
    try:
        return get_employees_with_attendance_today()
    except Exception as e:
        logger.error(f"Error fetching employees: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/register/sample")
def register_sample(req: RegisterSampleRequest):
    try:
        image_np = decode_base64_image(req.image)
        # Extract embedding & validate single face
        embedding = register.extract_face_embedding(image_np)
        
        # Save first frame as primary profile photo
        if req.sample_index == 1:
            register.save_profile_image(req.employee_id, image_np)
            
        logger.info(f"Processed registration sample {req.sample_index}/5 for {req.employee_id}")
        return {
            "status": "success",
            "embedding": embedding.tolist()
        }
    except register.NoFaceError:
        logger.warning(f"Registration sample {req.sample_index} for {req.employee_id} failed: No face detected.")
        raise HTTPException(status_code=400, detail={"status": "no_face", "message": "No face detected in the frame."})
    except register.MultipleFacesError:
        logger.warning(f"Registration sample {req.sample_index} for {req.employee_id} failed: Multiple faces detected.")
        raise HTTPException(status_code=400, detail={"status": "multiple_faces", "message": "Multiple faces detected in the frame."})
    except Exception as e:
        logger.error(f"Registration sample processing error for {req.employee_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/register")
def register_employee(req: RegisterRequest):
    try:
        # Save embeddings pickle file
        encoding_filename = f"{req.employee_id}.pkl"
        encoding_path = os.path.join(config.ENCODINGS_DIR, encoding_filename)
        
        with open(encoding_path, "wb") as f:
            pickle.dump(req.embeddings, f)
            
        profile_image_path = f"data/profile_images/{req.employee_id}.jpg"
        
        # Save to database
        success = database.add_employee(
            employee_id=req.employee_id,
            full_name=req.full_name,
            email=req.email,
            department=req.department,
            role=req.role,
            encoding_path=encoding_path,
            profile_image_path=profile_image_path
        )
        
        if not success:
            logger.warning(f"Cannot register employee {req.employee_id}: Database insert failed (duplicate ID).")
            raise HTTPException(status_code=400, detail="Employee ID already exists.")
            
        # Update cache dynamically
        attendance.add_employee_to_cache(req.employee_id, req.embeddings)
        
        logger.info(f"Registered employee successfully: {req.full_name} ({req.employee_id})")
        return {
            "status": "success",
            "message": f"Employee {req.full_name} registered successfully."
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Registration endpoint error for {req.employee_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/verify")
def verify_attendance(req: VerifyRequest):
    try:
        image_np = decode_base64_image(req.image)
        res = attendance.recognize_face(image_np)
        
        if res["status"] == "no_face":
            raise HTTPException(status_code=400, detail={"status": "no_face", "message": "No face detected in the frame."})
            
        if res["status"] == "multiple_faces":
            raise HTTPException(status_code=400, detail={"status": "multiple_faces", "message": "Multiple faces detected in the frame."})
            
        if res["status"] == "unknown":
            logger.info("Verification result: unknown face template.")
            return {
                "status": "unknown",
                "similarity": res["similarity"],
                "confidence": "unknown"
            }
            
        employee_id = res["employee_id"]
        similarity = res["similarity"]
        confidence = res["confidence"]
        
        # Load employee record from DB
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM employees WHERE employee_id = ? AND status = 'active'", (employee_id,))
        emp = cursor.fetchone()
        conn.close()
        
        if not emp:
            logger.warning(f"Match verified ID {employee_id} but record is inactive or missing in database.")
            return {
                "status": "unknown",
                "similarity": similarity,
                "confidence": "unknown"
            }
            
        emp = dict(emp)
        now = datetime.now()
        today_str = now.date().isoformat()
        
        # Enforce single daily check-in rule
        existing_log = database.check_today_log(employee_id, today_str)
        if existing_log:
            logger.info(f"Daily check-in duplicate prevention triggered for {emp['full_name']} ({employee_id}).")
            return {
                "status": "already_marked",
                "employee_id": employee_id,
                "full_name": emp["full_name"],
                "department": emp["department"],
                "role": emp["role"],
                "similarity": similarity,
                "confidence": confidence,
                "check_in_time": existing_log["check_in_time"]
            }
            
        # Record new check-in
        time_str = now.strftime("%I:%M %p")
        database.log_check_in(employee_id, time_str, today_str, similarity)
        
        logger.info(f"Attendance Verified: check-in for {emp['full_name']} ({employee_id}) at {time_str} ({confidence} similarity)")
        return {
            "status": "verified",
            "employee_id": employee_id,
            "full_name": emp["full_name"],
            "department": emp["department"],
            "role": emp["role"],
            "similarity": similarity,
            "confidence": confidence,
            "check_in_time": time_str
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error in face verification: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/checkout")
def checkout_attendance(req: CheckoutRequest):
    try:
        employee_id = req.employee_id
        now = datetime.now()
        today_str = now.date().isoformat()
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM employees WHERE employee_id = ? AND status = 'active'", (employee_id,))
        emp = cursor.fetchone()
        conn.close()
        
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found or inactive.")
            
        existing_log = database.check_today_log(employee_id, today_str)
        if not existing_log:
            raise HTTPException(status_code=400, detail="Cannot check out: Employee is not checked in today.")
            
        if existing_log["check_out_time"]:
            return {
                "status": "success",
                "check_out_time": existing_log["check_out_time"],
                "message": "Already checked out today."
            }
            
        time_str = now.strftime("%I:%M %p")
        database.log_check_out(employee_id, time_str, today_str)
        logger.info(f"Attendance Verified: check-out for {dict(emp)['full_name']} ({employee_id}) at {time_str}")
        return {
            "status": "success",
            "check_out_time": time_str
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error during check-out for {req.employee_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/attendance")
def get_attendance(employee_id: Optional[str] = None):
    try:
        if employee_id:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT date, check_in_time as checkIn, check_out_time as checkOut, similarity_score
                FROM attendance_logs
                WHERE employee_id = ?
                ORDER BY date DESC, check_in_time DESC
            """, (employee_id,))
            rows = cursor.fetchall()
            conn.close()
            
            logs_list = []
            for r in rows:
                d = dict(r)
                d["hours"] = calculate_hours(d["checkIn"], d["checkOut"])
                d["status"] = "Present"
                logs_list.append(d)
            return logs_list
        else:
            return database.get_logs()
    except Exception as e:
        logger.error(f"Error fetching logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/v1/employees/{employee_id}")
def delete_employee(employee_id: str):
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE employees SET status = 'inactive' WHERE employee_id = ?", (employee_id,))
        conn.commit()
        conn.close()
        
        # Remove from cache
        attendance.remove_employee_from_cache(employee_id)
        
        logger.info(f"Employee {employee_id} marked inactive and removed from cache.")
        return {"status": "success", "message": f"Employee {employee_id} removed successfully."}
    except Exception as e:
        logger.error(f"Error deleting employee {employee_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/employees/{employee_id}/toggle")
def toggle_employee_presence(employee_id: str):
    try:
        now = datetime.now()
        today_str = now.date().isoformat()
        existing_log = database.check_today_log(employee_id, today_str)
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        if existing_log:
            cursor.execute("DELETE FROM attendance_logs WHERE employee_id = ? AND date = ?", (employee_id, today_str))
            conn.commit()
            status = "Absent"
            message = "Status toggled to Absent."
        else:
            time_str = now.strftime("%I:%M %p")
            cursor.execute("""
                INSERT INTO attendance_logs (employee_id, check_in_time, date, similarity_score)
                VALUES (?, ?, ?, ?)
            """, (employee_id, time_str, today_str, 1.0))
            conn.commit()
            status = "Present"
            message = f"Status toggled to Present at {time_str}."
            
        conn.close()
        logger.info(f"Admin toggled presence for {employee_id} to {status}")
        return {"status": "success", "employee_status": status, "message": message}
    except Exception as e:
        logger.error(f"Error toggling presence for {employee_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/admin/populate")
def populate_mock_data():
    """
    Clears current logs and seeds database with mock template employee profiles.
    Generates dummy 512-d zero vectors for embeddings.
    """
    try:
        clear_all_data()
        
        mock_employees = [
            {"id": "EMP-0925", "name": "Ananya Prakash", "email": "ananya@demotech.com", "dept": "Engineering", "role": "Architect"},
            {"id": "EMP-1042", "name": "Jane Cooper", "email": "jane.cooper@demotech.com", "dept": "Product Management", "role": "Product Manager"},
            {"id": "EMP-2104", "name": "Arjun Sharma", "email": "arjun.sharma@demotech.com", "dept": "Engineering", "role": "DevOps Lead"},
            {"id": "EMP-3042", "name": "Sarah Jenkins", "email": "sales.j@demotech.com", "dept": "Sales & Marketing", "role": "Marketing Lead"},
            {"id": "EMP-4019", "name": "Michael Chang", "email": "m.chang@demotech.com", "dept": "Finance & HR", "role": "Financial Controller"}
        ]
        
        dummy_embedding = np.zeros(512, dtype=np.float32)
        dummy_embeddings = [dummy_embedding.tolist() for _ in range(5)]
        
        for emp in mock_employees:
            encoding_filename = f"{emp['id']}.pkl"
            encoding_path = os.path.join(config.ENCODINGS_DIR, encoding_filename)
            with open(encoding_path, "wb") as f:
                pickle.dump(dummy_embeddings, f)
                
            database.add_employee(
                employee_id=emp["id"],
                full_name=emp["name"],
                email=emp["email"],
                department=emp["dept"],
                role=emp["role"],
                encoding_path=encoding_path,
                profile_image_path=None
            )
            
        attendance.load_known_embeddings()
        logger.info("Admin override: Populated database with mock templates successfully.")
        return {"status": "success", "message": "Mock database loaded with template records."}
    except Exception as e:
        logger.error(f"Error populating mock data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/admin/reset")
def reset_database():
    """
    Clears all database logs, employee records, and storage directories.
    """
    try:
        clear_all_data()
        attendance.load_known_embeddings()
        logger.info("Admin override: Database reset.")
        return {"status": "success", "message": "Registry database successfully cleared."}
    except Exception as e:
        logger.error(f"Error resetting database: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount Static Assets
# Serve static data (including profile photos) at /data
app.mount("/data", StaticFiles(directory=os.path.join(config.BASE_DIR, "data")), name="data")

# Serve frontend files at root (index.html, style.css, app.js, etc.)
app.mount("/", StaticFiles(directory=os.path.join(config.BASE_DIR, "frontend"), html=True), name="frontend")
