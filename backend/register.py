import cv2
import insightface
import numpy as np
import os
import pickle
import logging
from . import config

logger = logging.getLogger("demotech.register")

_face_analyzer = None

def get_face_analyzer():
    global _face_analyzer
    if _face_analyzer is None:
        logger.info("Initializing InsightFace FaceAnalysis model...")
        try:
            _face_analyzer = insightface.app.FaceAnalysis()
            _face_analyzer.prepare(ctx_id=0)
            logger.info("InsightFace initialized on GPU (ctx_id=0).")
        except Exception as e:
            logger.warning(f"Failed to initialize on GPU: {e}. Falling back to CPU (ctx_id=-1).")
            try:
                _face_analyzer = insightface.app.FaceAnalysis()
                _face_analyzer.prepare(ctx_id=-1)
                logger.info("InsightFace initialized on CPU (ctx_id=-1).")
            except Exception as ex:
                logger.error(f"Failed to initialize InsightFace on CPU: {ex}")
                raise ex
    return _face_analyzer

class NoFaceError(Exception):
    """Exception raised when no face is detected in the image."""
    pass

class MultipleFacesError(Exception):
    """Exception raised when multiple faces are detected in the image."""
    pass

def extract_face_embedding(image_np):
    """
    Analyzes image_np and extracts the embedding.
    Validates face presence:
    - 0 faces: raises NoFaceError
    - >1 faces: raises MultipleFacesError
    - Exactly 1 face: returns the embedding (512-d list/array)
    """
    analyzer = get_face_analyzer()
    faces = analyzer.get(image_np)
    
    if not faces or len(faces) == 0:
        raise NoFaceError("No face detected.")
    if len(faces) > 1:
        raise MultipleFacesError(f"Multiple faces detected: {len(faces)}.")
        
    return faces[0].embedding

def save_profile_image(employee_id, image_np):
    """
    Saves image_np to PROFILE_IMAGES_DIR as employee_id.jpg.
    """
    filename = f"{employee_id}.jpg"
    filepath = os.path.join(config.PROFILE_IMAGES_DIR, filename)
    cv2.imwrite(filepath, image_np)
    logger.info(f"Saved profile image for {employee_id} to {filepath}")
    return filepath
