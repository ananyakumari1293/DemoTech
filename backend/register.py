import cv2
import insightface
import numpy as np
import os
import pickle
import logging
import config

logger = logging.getLogger("demotech.register")

_face_analyzer = None


def get_face_analyzer():
    global _face_analyzer

    if _face_analyzer is None:
        logger.info("Initializing InsightFace on CPU...")

        _face_analyzer = insightface.app.FaceAnalysis(
            providers=["CPUExecutionProvider"]
        )

        _face_analyzer.prepare(
            ctx_id=-1,
            det_size=(224, 224)
        )

        logger.info("InsightFace initialized successfully.")

    return _face_analyzer


class NoFaceError(Exception):
    pass


class MultipleFacesError(Exception):
    pass


def extract_face_embedding(image_np):
    analyzer = get_face_analyzer()
    faces = analyzer.get(image_np)

    if not faces:
        raise NoFaceError("No face detected.")

    if len(faces) > 1:
        raise MultipleFacesError(
            f"Multiple faces detected: {len(faces)}."
        )

    return faces[0].embedding


def save_profile_image(employee_id, image_np):
    filename = f"{employee_id}.jpg"
    filepath = os.path.join(
        config.PROFILE_IMAGES_DIR,
        filename
    )

    cv2.imwrite(filepath, image_np)

    logger.info(
        f"Saved profile image for {employee_id} to {filepath}"
    )

    return filepath