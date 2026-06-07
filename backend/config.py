import os

# Root project directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Database Configuration
DB_PATH = os.path.join(BASE_DIR, "attendance.db")

# Face Recognition Configuration
ENCODINGS_DIR = os.path.join(BASE_DIR, "data", "encodings")
PROFILE_IMAGES_DIR = os.path.join(BASE_DIR, "data", "profile_images")
RECOGNITION_THRESHOLD = 0.65

# Logging Configuration
LOGS_DIR = os.path.join(BASE_DIR, "logs")
LOG_FILE = os.path.join(LOGS_DIR, "server.log")

# Ensure required directories exist
os.makedirs(ENCODINGS_DIR, exist_ok=True)
os.makedirs(PROFILE_IMAGES_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)
