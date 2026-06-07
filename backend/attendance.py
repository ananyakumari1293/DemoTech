import os
import pickle
import numpy as np
import logging
import config
from register import get_face_analyzer, NoFaceError, MultipleFacesError

logger = logging.getLogger("demotech.attendance")

# Global cache in memory
cached_embeddings = []
cached_ids = []

def load_known_embeddings():
    """
    Loads all registered employee embeddings from disk into the global cache.
    """
    global cached_embeddings, cached_ids
    
    logger.info("Loading known embeddings from disk...")
    new_embeddings = []
    new_ids = []
    
    if not os.path.exists(config.ENCODINGS_DIR):
        os.makedirs(config.ENCODINGS_DIR, exist_ok=True)
        
    for file in os.listdir(config.ENCODINGS_DIR):
        if file.endswith(".pkl"):
            employee_id = file[:-4]
            filepath = os.path.join(config.ENCODINGS_DIR, file)
            try:
                with open(filepath, "rb") as f:
                    embs = pickle.load(f)
                    for emb in embs:
                        new_embeddings.append(emb)
                        new_ids.append(employee_id)
            except Exception as e:
                logger.error(f"Error loading embedding file {filepath}: {e}")
                
    cached_embeddings = new_embeddings
    cached_ids = new_ids
    logger.info(f"Loaded {len(cached_embeddings)} embeddings for {len(set(cached_ids))} unique employees.")

def add_employee_to_cache(employee_id, embeddings):
    """
    Dynamically appends new embeddings to the cache when a user registers.
    """
    global cached_embeddings, cached_ids
    for emb in embeddings:
        cached_embeddings.append(emb)
        cached_ids.append(employee_id)
    logger.info(f"Dynamically cached {len(embeddings)} embeddings for employee {employee_id}.")

def remove_employee_from_cache(employee_id):
    """
    Removes an employee's embeddings from the cache (e.g. on deletion).
    """
    global cached_embeddings, cached_ids
    indices_to_keep = [i for i, eid in enumerate(cached_ids) if eid != employee_id]
    cached_embeddings = [cached_embeddings[i] for i in indices_to_keep]
    cached_ids = [cached_ids[i] for i in indices_to_keep]
    logger.info(f"Removed employee {employee_id} embeddings from cache.")

def recognize_face(image_np):
    """
    Takes a BGR image, detects a face, and compares its embedding against the cache.
    Returns:
        dict: {
            "status": "verified" | "unknown" | "no_face" | "multiple_faces",
            "employee_id": str or None,
            "similarity": float,
            "confidence": "high" | "medium" | "low" | "unknown"
        }
    """
    analyzer = get_face_analyzer()
    faces = analyzer.get(image_np)
    
    if not faces or len(faces) == 0:
        return {
            "status": "no_face",
            "employee_id": None,
            "similarity": 0.0,
            "confidence": "unknown"
        }
    
    if len(faces) > 1:
        return {
            "status": "multiple_faces",
            "employee_id": None,
            "similarity": 0.0,
            "confidence": "unknown"
        }
        
    face = faces[0]
    embedding = face.embedding
    
    if not cached_embeddings:
        return {
            "status": "unknown",
            "employee_id": None,
            "similarity": 0.0,
            "confidence": "unknown"
        }
        
    best_score = -1.0
    best_id = None
    
    # Compare against all cached embeddings
    for i, known_emb in enumerate(cached_embeddings):
        # Cosine similarity
        norm_prod = np.linalg.norm(embedding) * np.linalg.norm(known_emb)
        if norm_prod == 0:
            continue
        similarity = np.dot(embedding, known_emb) / norm_prod
        
        if similarity > best_score:
            best_score = float(similarity)
            best_id = cached_ids[i]
            
    # Check threshold
    if best_score >= config.RECOGNITION_THRESHOLD:
        if best_score >= 0.85:
            confidence = "high"
        elif best_score >= 0.75:
            confidence = "medium"
        else:
            confidence = "low"
            
        return {
            "status": "verified",
            "employee_id": best_id,
            "similarity": best_score,
            "confidence": confidence
        }
    else:
        return {
            "status": "unknown",
            "employee_id": None,
            "similarity": best_score if best_score > 0 else 0.0,
            "confidence": "unknown"
        }
